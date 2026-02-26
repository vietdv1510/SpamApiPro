use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Barrier;
use hdrhistogram::Histogram;
use parking_lot::Mutex;

/// Config cho 1 lần chạy test
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TestConfig {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub virtual_users: u32,
    pub duration_secs: Option<u32>,
    pub iterations: Option<u32>,
    pub mode: TestMode,
    pub timeout_ms: u64,
    pub think_time_ms: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TestMode {
    Burst,
    Constant,
    RampUp,
    StressTest,
}

/// Kết quả của 1 request đơn lẻ
#[derive(Debug, Clone, Serialize)]
pub struct RequestResult {
    pub id: u32,
    pub success: bool,
    pub status_code: Option<u16>,
    pub latency_ms: f64,
    pub error: Option<String>,
    pub response_size_bytes: usize,
    pub timestamp_ms: u64,
    pub response_body: Option<String>, // chỉ giữ preview 512 bytes cho race detection
}

/// Kết quả tổng hợp toàn bộ test
#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    pub total_requests: u64,
    pub success_count: u64,
    pub error_count: u64,
    pub total_duration_ms: f64,
    pub requests_per_second: f64,
    pub burst_dispatch_us: f64,
    pub warmup_time_ms: f64,
    // Latency percentiles
    pub latency_min_ms: f64,
    pub latency_max_ms: f64,
    pub latency_avg_ms: f64,
    pub latency_p50_ms: f64,
    pub latency_p90_ms: f64,
    pub latency_p95_ms: f64,
    pub latency_p99_ms: f64,
    pub latency_p999_ms: f64,
    // Race condition analysis
    pub race_conditions_detected: u32,
    pub unique_responses: u32,
    pub response_consistency: f64,
    // Breakdowns
    pub error_types: HashMap<String, u32>,
    pub timeline: Vec<RequestResult>,
    pub status_distribution: HashMap<String, u32>,
}

/// Max bytes giữ lại từ response body cho race detection
const BODY_PREVIEW_BYTES: usize = 512;

/// Max connections warm up (match pool_max_idle_per_host)
const MAX_WARMUP_CONNECTIONS: usize = 1000;

/// Engine chính — chạy load test
pub struct LoadTestEngine {
    client: reqwest::Client,
}

impl LoadTestEngine {
    pub fn new(timeout_ms: u64) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .connect_timeout(Duration::from_secs(10))
            .connection_verbose(false)
            // Connection pooling
            .pool_max_idle_per_host(MAX_WARMUP_CONNECTIONS)
            .pool_idle_timeout(Duration::from_secs(90))
            // TCP tuning
            .tcp_keepalive(Duration::from_secs(30))
            .tcp_nodelay(true)
            // TLS
            .danger_accept_invalid_certs(true)
            .use_rustls_tls()
            // Headers
            .user_agent("SpamAPI-Pro/1.0 (Rust/Tokio)")
            .build()
            .expect("Failed to build HTTP client");

        Self { client }
    }

    /// 🔥 Warm up connections — tạo sẵn TCP+TLS connections trong pool
    /// Returns (elapsed_time, success_count) — không fail silently
    async fn warm_up_connections(&self, url: &str, count: usize) -> (Duration, usize) {
        let start = Instant::now();
        let success = Arc::new(AtomicU32::new(0));
        let mut handles = Vec::with_capacity(count);

        for _ in 0..count {
            let client = self.client.clone();
            let url = url.to_string();
            let success = Arc::clone(&success);
            handles.push(tokio::spawn(async move {
                if client.head(&url).send().await.is_ok() {
                    success.fetch_add(1, Ordering::Relaxed);
                }
            }));
        }

        for handle in handles {
            let _ = handle.await;
        }

        (start.elapsed(), success.load(Ordering::Relaxed) as usize)
    }

    /// ⭐ BURST MODE: Tất cả requests hội tụ tại 1 điểm rồi bắn đồng loạt
    /// Pattern: Warm up → Pre-build → Barrier → Execute → Receive
    pub async fn run_burst(
        &self,
        config: TestConfig,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        let n = config.virtual_users as usize;

        // ── PHASE 1: WARM UP ──────────────────────────────────
        // Cap ở pool_max_idle_per_host — warm hơn cũng bị pool drop
        let warmup_count = n.min(MAX_WARMUP_CONNECTIONS);
        let (warmup_time, warmup_ok) = self.warm_up_connections(&config.url, warmup_count).await;
        eprintln!("🔥 Warmed up {}/{} connections in {:?}", warmup_ok, warmup_count, warmup_time);
        if warmup_ok < warmup_count / 2 {
            eprintln!("⚠️  >50% warm up failed — server có thể block HEAD requests");
        }

        // ── PHASE 2: BURST ────────────────────────────────────
        let barrier = Arc::new(Barrier::new(n));
        let results = Arc::new(Mutex::new(Vec::with_capacity(n)));
        let callback = Arc::new(progress_callback);

        // Lock-free dispatch times — mỗi task ghi vào slot riêng, ZERO contention
        let dispatch_nanos: Arc<Vec<AtomicU64>> = Arc::new(
            (0..n).map(|_| AtomicU64::new(0)).collect()
        );
        // Atomic counter — progress theo thứ tự hoàn thành thực tế
        let completed = Arc::new(AtomicU32::new(0));

        let global_start = Instant::now();
        let config = Arc::new(config);
        let mut handles = Vec::with_capacity(n);

        for i in 0..n {
            let barrier = Arc::clone(&barrier);
            let results = Arc::clone(&results);
            let config = Arc::clone(&config);
            let client = self.client.clone();
            let callback = Arc::clone(&callback);
            let dispatch_nanos = Arc::clone(&dispatch_nanos);
            let completed = Arc::clone(&completed);
            let global_start = global_start;

            let handle = tokio::spawn(async move {
                // 🏗️ PRE-BUILD request TRƯỚC barrier — zero work sau barrier
                let mut builder = match config.method.to_uppercase().as_str() {
                    "GET"    => client.get(&config.url),
                    "POST"   => client.post(&config.url),
                    "PUT"    => client.put(&config.url),
                    "DELETE" => client.delete(&config.url),
                    "PATCH"  => client.patch(&config.url),
                    _        => client.get(&config.url),
                };
                for (key, value) in &config.headers {
                    builder = builder.header(key, value);
                }
                if let Some(body) = &config.body {
                    builder = builder.body(body.clone());
                }
                let request = builder.build().expect("Failed to build request");

                // ⏳ Barrier — tất cả tasks đợi nhau
                barrier.wait().await;

                // ⚡ SAU barrier — chỉ execute + ghi timestamp lock-free
                let fired_at_ns = global_start.elapsed().as_nanos() as u64;
                dispatch_nanos[i].store(fired_at_ns, Ordering::Relaxed);

                let start = Instant::now();
                let now_epoch = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let result = match client.execute(request).await {
                    Ok(response) => {
                        let status = response.status().as_u16();
                        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

                        // Đọc body nhưng CHỈ GIỮ preview — không ăn RAM
                        let body_bytes = response.bytes().await.unwrap_or_default();
                        let response_size = body_bytes.len();
                        let body_preview = if body_bytes.is_empty() {
                            None
                        } else {
                            let cap = body_bytes.len().min(BODY_PREVIEW_BYTES);
                            Some(String::from_utf8_lossy(&body_bytes[..cap]).into_owned())
                        };
                        // body_bytes dropped ở đây — full body KHÔNG giữ trong RAM

                        let success = status >= 200 && status < 300;

                        RequestResult {
                            id: i as u32,
                            success,
                            status_code: Some(status),
                            latency_ms,
                            error: if success { None } else { Some(format!("HTTP {}", status)) },
                            response_size_bytes: response_size,
                            timestamp_ms: now_epoch,
                            response_body: body_preview,
                        }
                    }
                    Err(e) => {
                        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
                        let error_msg = if e.is_timeout() {
                            "Timeout".to_string()
                        } else if e.is_connect() {
                            "Connection refused".to_string()
                        } else {
                            e.to_string()
                        };

                        RequestResult {
                            id: i as u32,
                            success: false,
                            status_code: None,
                            latency_ms,
                            error: Some(error_msg),
                            response_size_bytes: 0,
                            timestamp_ms: now_epoch,
                            response_body: None,
                        }
                    }
                };

                // 📊 Progress — thứ tự hoàn thành THỰC TẾ, không phải index spawn
                let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                let progress = done as f32 / n as f32 * 100.0;
                callback(progress, result.clone());
                results.lock().push(result);
            });

            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await;
        }

        let total_duration_ms = global_start.elapsed().as_secs_f64() * 1000.0;
        let raw_results = Arc::try_unwrap(results).unwrap().into_inner();

        // Tính dispatch spread từ lock-free array — chính xác, không bị mutex phình
        let dispatch_nanos = Arc::try_unwrap(dispatch_nanos).unwrap();
        let nanos: Vec<u64> = dispatch_nanos.iter()
            .map(|a| a.load(Ordering::Relaxed))
            .filter(|&v| v > 0)
            .collect();
        let dispatch_us = if nanos.len() >= 2 {
            let min_t = nanos.iter().min().unwrap();
            let max_t = nanos.iter().max().unwrap();
            (max_t - min_t) as f64 / 1000.0 // nanos → micros
        } else {
            0.0
        };

        let mut result = self.aggregate_results(raw_results, total_duration_ms);
        result.burst_dispatch_us = dispatch_us;
        result.warmup_time_ms = warmup_time.as_secs_f64() * 1000.0;
        result
    }

    /// Tính toán tổng hợp metrics từ raw results
    fn aggregate_results(&self, results: Vec<RequestResult>, total_duration_ms: f64) -> TestResult {
        let total = results.len() as u64;
        let mut hist = Histogram::<u64>::new(3).unwrap();
        let mut success_count = 0u64;
        let mut error_count = 0u64;
        let mut error_types: HashMap<String, u32> = HashMap::new();
        let mut status_distribution: HashMap<String, u32> = HashMap::new();
        let mut min_latency = f64::MAX;
        let mut max_latency = 0.0f64;
        let mut total_latency = 0.0f64;

        // Race detection — hash trực tiếp, KHÔNG clone body strings
        let mut unique_bodies: std::collections::HashSet<String> = std::collections::HashSet::new();

        for r in &results {
            let latency_us = (r.latency_ms * 1000.0) as u64;
            let _ = hist.record(latency_us.max(1));
            total_latency += r.latency_ms;
            min_latency = min_latency.min(r.latency_ms);
            max_latency = max_latency.max(r.latency_ms);

            if r.success {
                success_count += 1;
            } else {
                error_count += 1;
                if let Some(err) = &r.error {
                    *error_types.entry(err.clone()).or_insert(0) += 1;
                }
            }

            if let Some(status) = r.status_code {
                let key = format!("{}xx", status / 100);
                *status_distribution.entry(key).or_insert(0) += 1;
            }

            // Body đã truncated ở BODY_PREVIEW_BYTES — so sánh nhẹ nhàng
            if let Some(body) = &r.response_body {
                if !body.is_empty() {
                    let trimmed: String = body.chars().take(200).collect();
                    unique_bodies.insert(trimmed);
                }
            }
        }

        let unique_responses = unique_bodies.len() as u32;
        let body_count = results.iter().filter(|r| r.response_body.as_ref().map_or(false, |b| !b.is_empty())).count();
        let race_detected = if unique_responses > 1 { unique_responses - 1 } else { 0 };
        let consistency = if body_count == 0 {
            100.0
        } else {
            (body_count as f64 - race_detected as f64) / body_count as f64 * 100.0
        };

        let us_to_ms = |us: u64| us as f64 / 1000.0;

        TestResult {
            burst_dispatch_us: 0.0,
            warmup_time_ms: 0.0,
            total_requests: total,
            success_count,
            error_count,
            total_duration_ms,
            requests_per_second: if total_duration_ms > 0.0 {
                total as f64 / (total_duration_ms / 1000.0)
            } else { 0.0 },
            latency_min_ms: if min_latency == f64::MAX { 0.0 } else { min_latency },
            latency_max_ms: max_latency,
            latency_avg_ms: if total > 0 { total_latency / total as f64 } else { 0.0 },
            latency_p50_ms: us_to_ms(hist.value_at_quantile(0.50)),
            latency_p90_ms: us_to_ms(hist.value_at_quantile(0.90)),
            latency_p95_ms: us_to_ms(hist.value_at_quantile(0.95)),
            latency_p99_ms: us_to_ms(hist.value_at_quantile(0.99)),
            latency_p999_ms: us_to_ms(hist.value_at_quantile(0.999)),
            race_conditions_detected: race_detected,
            unique_responses,
            response_consistency: consistency,
            error_types,
            timeline: results,
            status_distribution,
        }
    }
}
