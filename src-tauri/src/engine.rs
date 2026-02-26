use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Barrier;
use hdrhistogram::Histogram;
use parking_lot::Mutex;

/// Config cho 1 lần chạy test
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TestConfig {
    pub url: String,
    pub method: String,                          // GET, POST, PUT, DELETE, PATCH
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub virtual_users: u32,                      // số concurrent requests
    pub duration_secs: Option<u32>,             // chạy trong bao lâu (nếu có)
    pub iterations: Option<u32>,                 // hoặc bao nhiêu lần
    pub mode: TestMode,
    pub timeout_ms: u64,
    pub think_time_ms: u64,                     // thời gian nghỉ giữa các iteration
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TestMode {
    Burst,          // Bắn TẤT CẢ cùng đúng 1 thời điểm (Rendezvous)
    Constant,       // Giữ N users liên tục
    RampUp,         // Tăng dần từ 0 đến N users
    StressTest,     // Tìm điểm gãy của server
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
    pub response_body: Option<String>, // chỉ lưu khi cần race detection
}

/// Kết quả tổng hợp toàn bộ test
#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    pub total_requests: u64,
    pub success_count: u64,
    pub error_count: u64,
    pub total_duration_ms: f64,
    pub requests_per_second: f64,
    // Latency
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
    pub response_consistency: f64, // 0-100%
    // Errors breakdown
    pub error_types: HashMap<String, u32>,
    // Raw results for chart
    pub timeline: Vec<RequestResult>,
    pub status_distribution: HashMap<String, u32>,
}

/// State counter dùng atomic để đếm không cần mutex
pub struct AtomicCounters {
    pub success: AtomicU64,
    pub errors: AtomicU64,
    pub total_latency_us: AtomicU64, // microseconds để tránh float issues
}

impl AtomicCounters {
    pub fn new() -> Self {
        Self {
            success: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            total_latency_us: AtomicU64::new(0),
        }
    }
}

/// Engine chính — chạy load test
pub struct LoadTestEngine {
    client: reqwest::Client,
}

impl LoadTestEngine {
    pub fn new(timeout_ms: u64) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .connection_verbose(false)
            .pool_max_idle_per_host(500)      // connection pooling tích cực
            .tcp_keepalive(Duration::from_secs(30))
            .http2_prior_knowledge()           // ưu tiên HTTP/2
            .build()
            .expect("Failed to build HTTP client");

        Self { client }
    }

    /// Bắn 1 request và đo latency
    async fn fire_single_request(
        &self,
        config: &TestConfig,
        request_id: u32,
    ) -> RequestResult {
        let start = Instant::now();
        let now_epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let mut req = match config.method.to_uppercase().as_str() {
            "GET"    => self.client.get(&config.url),
            "POST"   => self.client.post(&config.url),
            "PUT"    => self.client.put(&config.url),
            "DELETE" => self.client.delete(&config.url),
            "PATCH"  => self.client.patch(&config.url),
            _        => self.client.get(&config.url),
        };

        // Gắn headers
        for (key, value) in &config.headers {
            req = req.header(key, value);
        }

        // Gắn body nếu có
        if let Some(body) = &config.body {
            req = req.body(body.clone());
        }

        match req.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
                let response_size = response.content_length().unwrap_or(0) as usize;
                // Đọc body để detect race condition
                let body_text = response.text().await.unwrap_or_default();
                let success = status >= 200 && status < 300;

                RequestResult {
                    id: request_id,
                    success,
                    status_code: Some(status),
                    latency_ms,
                    error: if success { None } else { Some(format!("HTTP {}", status)) },
                    response_size_bytes: response_size.max(body_text.len()),
                    timestamp_ms: now_epoch,
                    response_body: Some(body_text),
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
                    id: request_id,
                    success: false,
                    status_code: None,
                    latency_ms,
                    error: Some(error_msg),
                    response_size_bytes: 0,
                    timestamp_ms: now_epoch,
                    response_body: None,
                }
            }
        }
    }

    /// ⭐ BURST MODE: Tất cả requests hội tụ tại 1 điểm rồi bắn đồng loạt
    pub async fn run_burst(
        &self,
        config: TestConfig,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        let n = config.virtual_users as usize;
        let barrier = Arc::new(Barrier::new(n));  // Rendezvous point
        let results = Arc::new(Mutex::new(Vec::with_capacity(n)));
        let callback = Arc::new(progress_callback);

        let global_start = Instant::now();
        let config = Arc::new(config);

        let mut handles = Vec::with_capacity(n);

        for i in 0..n {
            let barrier = Arc::clone(&barrier);
            let results = Arc::clone(&results);
            let config = Arc::clone(&config);
            let client = self.client.clone();
            let callback = Arc::clone(&callback);

            let handle = tokio::spawn(async move {
                // Tất cả goroutine đợi nhau tại điểm này
                barrier.wait().await;

                // Tất cả cùng fire!
                let engine = LoadTestEngine { client };
                let result = engine.fire_single_request(&config, i as u32).await;

                let progress = (i + 1) as f32 / n as f32 * 100.0;
                callback(progress, result.clone());
                results.lock().push(result);
            });

            handles.push(handle);
        }

        // Đợi tất cả xong
        for handle in handles {
            let _ = handle.await;
        }

        let total_duration_ms = global_start.elapsed().as_secs_f64() * 1000.0;
        let raw_results = Arc::try_unwrap(results).unwrap().into_inner();

        self.aggregate_results(raw_results, total_duration_ms)
    }

    /// Tính toán tổng hợp metrics từ raw results
    fn aggregate_results(&self, results: Vec<RequestResult>, total_duration_ms: f64) -> TestResult {
        let total = results.len() as u64;
        let mut hist = Histogram::<u64>::new(3).unwrap();
        let mut success_count = 0u64;
        let mut error_count = 0u64;
        let mut error_types: HashMap<String, u32> = HashMap::new();
        let mut status_distribution: HashMap<String, u32> = HashMap::new();
        let mut response_bodies: Vec<String> = Vec::new();
        let mut min_latency = f64::MAX;
        let mut max_latency = 0.0f64;
        let mut total_latency = 0.0f64;

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

            if let Some(body) = &r.response_body {
                if !body.is_empty() {
                    response_bodies.push(body.clone());
                }
            }
        }

        // Race condition detection: đếm số unique response bodies
        let mut unique_responses_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        for body in &response_bodies {
            // Chỉ so sánh 200 ký tự đầu để tránh noise
            let trimmed = body.chars().take(200).collect::<String>();
            unique_responses_set.insert(trimmed);
        }

        let unique_responses = unique_responses_set.len() as u32;
        let race_detected = if unique_responses > 1 { unique_responses - 1 } else { 0 };
        let consistency = if response_bodies.is_empty() {
            100.0
        } else {
            (response_bodies.len() as f64 - race_detected as f64) / response_bodies.len() as f64 * 100.0
        };

        let us_to_ms = |us: u64| us as f64 / 1000.0;

        TestResult {
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
