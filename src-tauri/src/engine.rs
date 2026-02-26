use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Barrier;
use tokio_util::sync::CancellationToken;
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
    pub response_body: Option<String>,
}

/// Kết quả tổng hợp toàn bộ test
#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    pub total_requests: u64,
    pub success_count: u64,
    pub error_count: u64,
    pub cancelled_count: u64,
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
    pub was_cancelled: bool,
}

const BODY_PREVIEW_BYTES: usize = 512;
const MAX_WARMUP_CONNECTIONS: usize = 1000;

/// Engine chính — chạy load test
pub struct LoadTestEngine {
    client: reqwest::Client,
}

impl LoadTestEngine {
    /// Tạo engine mới — trả Result thay vì panic
    pub fn new(timeout_ms: u64) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .connect_timeout(Duration::from_secs(10))
            .connection_verbose(false)
            .pool_max_idle_per_host(MAX_WARMUP_CONNECTIONS)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(30))
            .tcp_nodelay(true)
            .danger_accept_invalid_certs(true)
            .use_rustls_tls()
            .user_agent("SpamAPI-Pro/1.0 (Rust/Tokio)")
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

        Ok(Self { client })
    }

    /// Warm up connections — hỗ trợ cancel
    async fn warm_up_connections(
        &self,
        url: &str,
        count: usize,
        cancel: &CancellationToken,
    ) -> (Duration, usize) {
        let start = Instant::now();
        let success = Arc::new(AtomicU32::new(0));
        let mut handles = Vec::with_capacity(count);

        for _ in 0..count {
            let client = self.client.clone();
            let url = url.to_string();
            let success = Arc::clone(&success);
            let cancel = cancel.clone();
            handles.push(tokio::spawn(async move {
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {}
                    result = client.head(&url).send() => {
                        if result.is_ok() {
                            success.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            }));
        }

        for handle in handles {
            let _ = handle.await;
        }

        (start.elapsed(), success.load(Ordering::Relaxed) as usize)
    }

    /// ⭐ DISPATCHER — Chọn mode chạy phù hợp
    pub async fn run(
        &self,
        config: TestConfig,
        cancel: CancellationToken,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        match config.mode {
            TestMode::Burst => self.run_burst(config, cancel, progress_callback).await,
            TestMode::Constant => self.run_constant(config, cancel, progress_callback).await,
            TestMode::RampUp => self.run_ramp_up(config, cancel, progress_callback).await,
            TestMode::StressTest => self.run_stress_test(config, cancel, progress_callback).await,
        }
    }

    /// ⭐ BURST MODE với Cancel support
    pub async fn run_burst(
        &self,
        config: TestConfig,
        cancel: CancellationToken,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        let n = config.virtual_users as usize;

        if cancel.is_cancelled() {
            return Self::empty_result(true);
        }

        // ── PHASE 1: WARM UP ──
        let warmup_count = n.min(MAX_WARMUP_CONNECTIONS);
        let (warmup_time, warmup_ok) =
            self.warm_up_connections(&config.url, warmup_count, &cancel).await;
        eprintln!(
            "🔥 Warmed up {}/{} connections in {:?}",
            warmup_ok, warmup_count, warmup_time
        );

        if cancel.is_cancelled() {
            return Self::empty_result(true);
        }

        // ── PHASE 2: BURST ──
        let barrier = Arc::new(Barrier::new(n));
        let results = Arc::new(Mutex::new(Vec::with_capacity(n)));
        let callback = Arc::new(progress_callback);
        let dispatch_nanos: Arc<Vec<AtomicU64>> =
            Arc::new((0..n).map(|_| AtomicU64::new(0)).collect());
        let completed = Arc::new(AtomicU32::new(0));
        let cancelled_count = Arc::new(AtomicU32::new(0));

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
            let cancelled_count = Arc::clone(&cancelled_count);
            let cancel = cancel.clone();

            let handle = tokio::spawn(async move {
                // 🏗️ PRE-BUILD request TRƯỚC barrier
                let mut builder = match config.method.to_uppercase().as_str() {
                    "GET" => client.get(&config.url),
                    "POST" => client.post(&config.url),
                    "PUT" => client.put(&config.url),
                    "DELETE" => client.delete(&config.url),
                    "PATCH" => client.patch(&config.url),
                    _ => client.get(&config.url),
                };
                for (key, value) in &config.headers {
                    builder = builder.header(key, value);
                }
                if let Some(body) = &config.body {
                    builder = builder.body(body.clone());
                }

                let request = match builder.build() {
                    Ok(r) => r,
                    Err(e) => {
                        let result = RequestResult {
                            id: i as u32,
                            success: false,
                            status_code: None,
                            latency_ms: 0.0,
                            error: Some(format!("Build error: {}", e)),
                            response_size_bytes: 0,
                            timestamp_ms: 0,
                            response_body: None,
                        };
                        let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        callback(done as f32 / n as f32 * 100.0, result.clone());
                        results.lock().push(result);
                        return;
                    }
                };

                // ⏳ Barrier (No cancel select here, to avoid deadlocking other threads)
                barrier.wait().await;

                if cancel.is_cancelled() {
                    cancelled_count.fetch_add(1, Ordering::Relaxed);
                    let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                    let result = RequestResult {
                        id: i as u32,
                        success: false,
                        status_code: None,
                        latency_ms: 0.0,
                        error: Some("Cancelled".to_string()),
                        response_size_bytes: 0,
                        timestamp_ms: 0,
                        response_body: None,
                    };
                    callback(done as f32 / n as f32 * 100.0, result.clone());
                    results.lock().push(result);
                    return;
                }

                // ⚡ SAU barrier — fire + ghi timestamp
                let fired_at_ns = global_start.elapsed().as_nanos() as u64;
                dispatch_nanos[i].store(fired_at_ns, Ordering::Relaxed);

                let start = Instant::now();
                let now_epoch = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                // Execute with cancel
                let result = tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {
                        cancelled_count.fetch_add(1, Ordering::Relaxed);
                        RequestResult {
                            id: i as u32,
                            success: false,
                            status_code: None,
                            latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                            error: Some("Cancelled".to_string()),
                            response_size_bytes: 0,
                            timestamp_ms: now_epoch,
                            response_body: None,
                        }
                    }
                    resp = client.execute(request) => {
                        match resp {
                            Ok(response) => {
                                let status = response.status().as_u16();
                                let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
                                
                                // CANCEL-AWARE READ BODY
                                let body_bytes = tokio::select! {
                                    biased;
                                    _ = cancel.cancelled() => {
                                        cancelled_count.fetch_add(1, Ordering::Relaxed);
                                        return; // Break task
                                    }
                                    b = response.bytes() => b.unwrap_or_default()
                                };
                                
                                let response_size = body_bytes.len();
                                let body_preview = if body_bytes.is_empty() {
                                    None
                                } else {
                                    let cap = body_bytes.len().min(BODY_PREVIEW_BYTES);
                                    Some(String::from_utf8_lossy(&body_bytes[..cap]).into_owned())
                                };
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
                        }
                    }
                };

                let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                callback(done as f32 / n as f32 * 100.0, result.clone());
                results.lock().push(result);
            });

            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await;
        }

        let total_duration_ms = global_start.elapsed().as_secs_f64() * 1000.0;
        let was_cancelled = cancel.is_cancelled();

        let raw_results = match Arc::try_unwrap(results) {
            Ok(mutex) => mutex.into_inner(),
            Err(arc) => arc.lock().clone(),
        };

        let nanos: Vec<u64> = dispatch_nanos
            .iter()
            .map(|a| a.load(Ordering::Relaxed))
            .filter(|&v| v > 0)
            .collect();
        let dispatch_us = if nanos.len() >= 2 {
            let min_t = nanos.iter().min().unwrap();
            let max_t = nanos.iter().max().unwrap();
            (max_t - min_t) as f64 / 1000.0
        } else {
            0.0
        };

        let cancelled = cancelled_count.load(Ordering::Relaxed) as u64;
        let mut result = self.aggregate_results(raw_results, total_duration_ms);
        result.burst_dispatch_us = dispatch_us;
        result.warmup_time_ms = warmup_time.as_secs_f64() * 1000.0;
        result.was_cancelled = was_cancelled;
        result.cancelled_count = cancelled;
        result
    }

    /// ⭐ CONSTANT LOAD — Giữ số lượng users đồng thời cố định trong T giây
    pub async fn run_constant(
        &self,
        config: TestConfig,
        cancel: CancellationToken,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        let n = config.virtual_users as usize;
        let duration = Duration::from_secs(config.duration_secs.unwrap_or(10) as u64);
        let results = Arc::new(Mutex::new(Vec::new()));
        let callback = Arc::new(progress_callback);
        let semaphore = Arc::new(tokio::sync::Semaphore::new(n));
        let cancelled_count = Arc::new(AtomicU32::new(0));

        let global_start = Instant::now();
        let config = Arc::new(config);
        let mut handles = Vec::new();
        let mut request_id = 0;

        while global_start.elapsed() < duration && !cancel.is_cancelled() {
            let permit = tokio::select! {
                biased;
                _ = cancel.cancelled() => break,
                p = semaphore.clone().acquire_owned() => match p {
                    Ok(p) => p,
                    Err(_) => break,
                }
            };

            let results = Arc::clone(&results);
            let config = Arc::clone(&config);
            let client = self.client.clone();
            let callback = Arc::clone(&callback);
            let cancelled_count = Arc::clone(&cancelled_count);
            let cancel = cancel.clone();
            let id = request_id;
            request_id += 1;

            let handle = tokio::spawn(async move {
                let _permit = permit;
                let start = Instant::now();
                let now_epoch = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let mut builder = match config.method.to_uppercase().as_str() {
                    "GET" => client.get(&config.url),
                    "POST" => client.post(&config.url),
                    "PUT" => client.put(&config.url),
                    "DELETE" => client.delete(&config.url),
                    "PATCH" => client.patch(&config.url),
                    _ => client.get(&config.url),
                };
                for (key, value) in &config.headers {
                    builder = builder.header(key, value);
                }
                if let Some(body) = &config.body {
                    builder = builder.body(body.clone());
                }

                let request = match builder.build() {
                    Ok(r) => r,
                    Err(_) => return,
                };

                let result = tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {
                        cancelled_count.fetch_add(1, Ordering::Relaxed);
                        RequestResult {
                            id,
                            success: false,
                            status_code: None,
                            latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                            error: Some("Cancelled".to_string()),
                            response_size_bytes: 0,
                            timestamp_ms: now_epoch,
                            response_body: None,
                        }
                    }
                    resp = client.execute(request) => {
                        match resp {
                            Ok(response) => {
                                let status = response.status().as_u16();
                                let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
                                
                                // CANCEL-AWARE READ BODY
                                let body_bytes = tokio::select! {
                                    biased;
                                    _ = cancel.cancelled() => {
                                        cancelled_count.fetch_add(1, Ordering::Relaxed);
                                        return;
                                    }
                                    b = response.bytes() => b.unwrap_or_default()
                                };
                                
                                let success = status >= 200 && status < 300;
                                RequestResult {
                                    id,
                                    success,
                                    status_code: Some(status),
                                    latency_ms,
                                    error: if success { None } else { Some(format!("HTTP {}", status)) },
                                    response_size_bytes: body_bytes.len(),
                                    timestamp_ms: now_epoch,
                                    response_body: if body_bytes.is_empty() { None } else {
                                        let cap = body_bytes.len().min(BODY_PREVIEW_BYTES);
                                        Some(String::from_utf8_lossy(&body_bytes[..cap]).into_owned())
                                    },
                                }
                            }
                            Err(e) => {
                                RequestResult {
                                    id,
                                    success: false,
                                    status_code: None,
                                    latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                                    error: Some(e.to_string()),
                                    response_size_bytes: 0,
                                    timestamp_ms: now_epoch,
                                    response_body: None,
                                }
                            }
                        }
                    }
                };

                callback(0.0, result.clone());
                results.lock().push(result);
            });
            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await;
        }

        let total_duration_ms = global_start.elapsed().as_secs_f64() * 1000.0;
        let was_cancelled = cancel.is_cancelled();
        let raw_results = Arc::try_unwrap(results).unwrap().into_inner();
        let mut result = self.aggregate_results(raw_results, total_duration_ms);
        result.was_cancelled = was_cancelled;
        result.cancelled_count = cancelled_count.load(Ordering::Relaxed) as u64;
        result
    }

    /// ⭐ RAMP UP MODE — Tăng dần số users từ 1 -> N
    pub async fn run_ramp_up(
        &self,
        config: TestConfig,
        cancel: CancellationToken,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        let max_users = config.virtual_users as usize;
        let total_duration = Duration::from_secs(config.duration_secs.unwrap_or(10) as u64);
        let steps = 5; // Chia làm 5 giai đoạn tăng trưởng
        let step_duration = total_duration / steps;
        let users_per_step = (max_users as f32 / steps as f32).ceil() as usize;

        let results = Arc::new(Mutex::new(Vec::new()));
        let callback = Arc::new(progress_callback);
        let cancelled_count = Arc::new(AtomicU32::new(0));
        let global_start = Instant::now();
        let config = Arc::new(config);
        let mut request_id = 0;

        for step in 0..steps {
            if cancel.is_cancelled() { break; }
            let current_users = (users_per_step * (step as usize + 1)).min(max_users);
            eprintln!("📈 Ramp step {}/{}: {} concurrent users", step + 1, steps, current_users);
            
            let step_start = Instant::now();
            let semaphore = Arc::new(tokio::sync::Semaphore::new(current_users));
            let mut handles = Vec::new();

            while step_start.elapsed() < step_duration && !cancel.is_cancelled() {
                let permit = tokio::select! {
                    biased;
                    _ = cancel.cancelled() => break,
                    p = semaphore.clone().acquire_owned() => match p {
                        Ok(p) => p,
                        Err(_) => break,
                    }
                };

                let results = Arc::clone(&results);
                let config = Arc::clone(&config);
                let client = self.client.clone();
                let callback = Arc::clone(&callback);
                let cancelled_count = Arc::clone(&cancelled_count);
                let cancel = cancel.clone();
                let id = request_id;
                request_id += 1;

                let handle = tokio::spawn(async move {
                    let _permit = permit;
                    let start = Instant::now();
                    let now_epoch = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;

                    let builder = match config.method.to_uppercase().as_str() {
                        "GET" => client.get(&config.url),
                        "POST" => client.post(&config.url),
                        "PUT" => client.put(&config.url),
                        "DELETE" => client.delete(&config.url),
                        "PATCH" => client.patch(&config.url),
                        _ => client.get(&config.url),
                    };
                    let mut builder = builder;
                    for (k, v) in &config.headers {
                        builder = builder.header(k, v);
                    }
                    if let Some(b) = &config.body {
                        builder = builder.body(b.clone());
                    }

                    let request = builder.build().unwrap();
                    let result = tokio::select! {
                        biased;
                        _ = cancel.cancelled() => {
                            cancelled_count.fetch_add(1, Ordering::Relaxed);
                            return;
                        }
                        resp = client.execute(request) => match resp {
                            Ok(response) => { 
                                let status = response.status().as_u16();
                                let latency_ms = start.elapsed().as_secs_f64() * 1000.0;
                                
                                let body_bytes = tokio::select! {
                                    biased;
                                    _ = cancel.cancelled() => {
                                        cancelled_count.fetch_add(1, Ordering::Relaxed);
                                        return;
                                    }
                                    b = response.bytes() => b.unwrap_or_default()
                                };

                                let success = status >= 200 && status < 300;
                                RequestResult {
                                    id,
                                    success,
                                    status_code: Some(status),
                                    latency_ms,
                                    error: if success { None } else { Some(format!("HTTP {}", status)) },
                                    response_size_bytes: body_bytes.len(),
                                    timestamp_ms: now_epoch,
                                    response_body: if body_bytes.is_empty() { None } else {
                                        let cap = body_bytes.len().min(BODY_PREVIEW_BYTES);
                                        Some(String::from_utf8_lossy(&body_bytes[..cap]).into_owned())
                                    },
                                }
                            },
                            Err(e) => RequestResult {
                                id, success: false, status_code: None,
                                latency_ms: start.elapsed().as_secs_f64()*1000.0,
                                error: Some(e.to_string()), response_size_bytes: 0, timestamp_ms: now_epoch, response_body: None
                            }
                        }
                    };
                    callback(0.0, result.clone());
                    results.lock().push(result);
                });
                handles.push(handle);
            }
            for h in handles { let _ = h.await; }
        }

        let total_duration_ms = global_start.elapsed().as_secs_f64() * 1000.0;
        let was_cancelled = cancel.is_cancelled();
        let raw_results = Arc::try_unwrap(results).unwrap().into_inner();
        let mut result = self.aggregate_results(raw_results, total_duration_ms);
        result.was_cancelled = was_cancelled;
        result.cancelled_count = cancelled_count.load(Ordering::Relaxed) as u64;
        result
    }

    /// ⭐ STRESS TEST — Tìm ngưỡng chịu tải (doubling load)
    pub async fn run_stress_test(
        &self,
        config: TestConfig,
        cancel: CancellationToken,
        progress_callback: impl Fn(f32, RequestResult) + Send + Sync + 'static,
    ) -> TestResult {
        let mut current_users = config.virtual_users as usize;
        let duration_per_wave = Duration::from_secs(5);
        let results = Arc::new(Mutex::new(Vec::new()));
        let callback = Arc::new(progress_callback);
        let global_start = Instant::now();
        let config = Arc::new(config);
        let mut request_id = 0;

        loop {
            if cancel.is_cancelled() { break; }
            eprintln!("🔥 Stress wave: {} concurrent users", current_users);
            let wave_start = Instant::now();
            let semaphore = Arc::new(tokio::sync::Semaphore::new(current_users));
            let mut wave_results = 0;
            let mut wave_errors = 0;
            let mut handles = Vec::new();

            while wave_start.elapsed() < duration_per_wave && !cancel.is_cancelled() {
                 let permit = tokio::select! {
                    biased;
                    _ = cancel.cancelled() => break,
                    p = semaphore.clone().acquire_owned() => p.unwrap()
                };
                let results = Arc::clone(&results);
                let config = Arc::clone(&config);
                let client = self.client.clone();
                let callback = Arc::clone(&callback);
                let cancel = cancel.clone();
                let id = request_id; request_id += 1;
                
                handles.push(tokio::spawn(async move {
                    let _p = permit;
                    let start = Instant::now();
                    
                    let mut builder = match config.method.to_uppercase().as_str() {
                        "GET" => client.get(&config.url),
                        "POST" => client.post(&config.url),
                        "PUT" => client.put(&config.url),
                        "DELETE" => client.delete(&config.url),
                        "PATCH" => client.patch(&config.url),
                        _ => client.get(&config.url),
                    };
                    for (key, value) in &config.headers {
                        builder = builder.header(key, value);
                    }
                    if let Some(body) = &config.body {
                        builder = builder.body(body.clone());
                    }
                    let request = builder.build().unwrap();

                    let (success, res) = tokio::select! {
                        biased;
                        _ = cancel.cancelled() => {
                            // Cancelled instantly!
                            let res = RequestResult {
                                id, success: false, status_code: None, latency_ms: 0.0,
                                error: Some("Cancelled".to_string()), response_size_bytes: 0, timestamp_ms: 0, response_body: None
                            };
                            (false, res)
                        }
                        resp = client.execute(request) => {
                            let (is_ok, status) = match &resp {
                                Ok(r) => (r.status().is_success(), Some(r.status().as_u16())),
                                Err(_) => (false, None),
                            };
                            let mut body_len = 0;
                            let mut body_preview = None;

                            if let Ok(r) = resp {
                                let body_res = tokio::select! {
                                    biased;
                                    _ = cancel.cancelled() => None,
                                    b = r.bytes() => b.ok()
                                };
                                
                                if let Some(bytes) = body_res {
                                    body_len = bytes.len();
                                    if !bytes.is_empty() {
                                        let cap = bytes.len().min(BODY_PREVIEW_BYTES);
                                        body_preview = Some(String::from_utf8_lossy(&bytes[..cap]).into_owned());
                                    }
                                }
                            }

                            let res = RequestResult {
                                id, 
                                success: is_ok, 
                                status_code: status, 
                                latency_ms: start.elapsed().as_secs_f64()*1000.0,
                                error: if is_ok { None } else { Some("Error".to_string()) }, 
                                response_size_bytes: body_len, 
                                timestamp_ms: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64, 
                                response_body: body_preview
                            };
                            (is_ok, res)
                        }
                    };

                    callback(0.0, res.clone());
                    results.lock().push(res);
                    success
                }));
            }
            for h in handles { if let Ok(s) = h.await { wave_results += 1; if !s { wave_errors += 1; } } }
            
            // Nếu lỗi > 30% or users > 10k -> Dừng
            if wave_results > 0 && (wave_errors as f32 / wave_results as f32) > 0.3 {
                eprintln!("🛑 Stress limit reached at {} users", current_users);
                break;
            }
            if current_users >= 10000 { break; }
            current_users *= 2;
        }

        let raw_results = Arc::try_unwrap(results).unwrap().into_inner();
        let mut result = self.aggregate_results(raw_results, global_start.elapsed().as_secs_f64()*1000.0);
        result.was_cancelled = cancel.is_cancelled();
        result
    }

    /// Empty result cho cancelled/error cases
    fn empty_result(cancelled: bool) -> TestResult {
        TestResult {
            total_requests: 0,
            success_count: 0,
            error_count: 0,
            cancelled_count: 0,
            total_duration_ms: 0.0,
            requests_per_second: 0.0,
            burst_dispatch_us: 0.0,
            warmup_time_ms: 0.0,
            latency_min_ms: 0.0,
            latency_max_ms: 0.0,
            latency_avg_ms: 0.0,
            latency_p50_ms: 0.0,
            latency_p90_ms: 0.0,
            latency_p95_ms: 0.0,
            latency_p99_ms: 0.0,
            latency_p999_ms: 0.0,
            race_conditions_detected: 0,
            unique_responses: 0,
            response_consistency: 100.0,
            error_types: HashMap::new(),
            timeline: Vec::new(),
            status_distribution: HashMap::new(),
            was_cancelled: cancelled,
        }
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
        let mut unique_bodies: std::collections::HashSet<String> =
            std::collections::HashSet::new();

        for r in &results {
            // Skip cancelled requests trong metrics
            if r.error.as_deref() == Some("Cancelled") {
                continue;
            }

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
                // Also track exact status codes
                let exact_key = status.to_string();
                *status_distribution.entry(exact_key).or_insert(0) += 1;
            }

            if let Some(body) = &r.response_body {
                if !body.is_empty() {
                    let trimmed: String = body.chars().take(200).collect();
                    unique_bodies.insert(trimmed);
                }
            }
        }

        let actual_count = success_count + error_count;
        let unique_responses = unique_bodies.len() as u32;
        let body_count = results
            .iter()
            .filter(|r| {
                r.error.as_deref() != Some("Cancelled")
                    && r.response_body.as_ref().map_or(false, |b| !b.is_empty())
            })
            .count();
        let race_detected = if unique_responses > 1 {
            unique_responses - 1
        } else {
            0
        };
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
            cancelled_count: 0,
            total_duration_ms,
            requests_per_second: if total_duration_ms > 0.0 {
                actual_count as f64 / (total_duration_ms / 1000.0)
            } else {
                0.0
            },
            latency_min_ms: if min_latency == f64::MAX {
                0.0
            } else {
                min_latency
            },
            latency_max_ms: max_latency,
            latency_avg_ms: if actual_count > 0 {
                total_latency / actual_count as f64
            } else {
                0.0
            },
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
            was_cancelled: false,
        }
    }
}
