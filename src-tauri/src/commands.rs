use crate::engine::{LoadTestEngine, TestConfig, TestResult};
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

/// Shared application state — quản lý cancel token
pub struct AppState {
    pub cancel_token: Arc<Mutex<Option<CancellationToken>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            cancel_token: Arc::new(Mutex::new(None)),
        }
    }
}

/// Command chạy load test — hỗ trợ cancel + auto-cancel previous run
#[tauri::command]
pub async fn run_load_test(
    app: AppHandle,
    state: State<'_, AppState>,
    config: TestConfig,
) -> Result<TestResult, String> {
    eprintln!("🟢 [CMD] run_load_test called: {} VUs, mode={:?}, url={}", config.virtual_users, config.mode, config.url);

    // ⚡ CRITICAL: Cancel bất kỳ test nào đang chạy trước đó
    {
        let old_token = state.cancel_token.lock().clone();
        if let Some(old_cancel) = old_token {
            eprintln!("🔄 [CMD] Cancelling previous run...");
            old_cancel.cancel();
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }

    // Tạo cancel token mới cho run này
    let cancel = CancellationToken::new();
    {
        let mut token_lock = state.cancel_token.lock();
        *token_lock = Some(cancel.clone());
    }

    let engine = LoadTestEngine::new(config.timeout_ms)?;
    let app_clone = app.clone();
    let cancel_clone = cancel.clone();

    // ⚡ Global timeout = timeout_ms * 2 + 30s (warm-up buffer)
    let global_timeout_ms = (config.timeout_ms * 2) + 30_000;
    eprintln!("⏱️ [CMD] Global timeout: {}ms", global_timeout_ms);

    let engine_future = engine
        .run(config, cancel_clone, move |progress, req_result| {
            let _ = app_clone.emit(
                "test_progress",
                serde_json::json!({
                    "progress": progress,
                    "result": req_result,
                }),
            );
        });

    let result = match tokio::time::timeout(
        std::time::Duration::from_millis(global_timeout_ms),
        engine_future,
    ).await {
        Ok(result) => {
            eprintln!("✅ [CMD] Engine completed normally");
            result
        }
        Err(_) => {
            eprintln!("⏰ [CMD] GLOBAL TIMEOUT! Force-returning empty result");
            cancel.cancel();
            TestResult {
                total_requests: 0,
                success_count: 0,
                error_count: 0,
                cancelled_count: 0,
                total_duration_ms: global_timeout_ms as f64,
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
                response_consistency: 0.0,
                error_types: std::collections::HashMap::from([("Global timeout".to_string(), 1)]),
                timeline: vec![],
                status_distribution: std::collections::HashMap::new(),
                was_cancelled: true,
            }
        }
    };

    // Clear cancel token sau khi xong
    {
        let mut token_lock = state.cancel_token.lock();
        *token_lock = None;
    }

    eprintln!("🏁 [CMD] Returning result to frontend");
    Ok(result)
}

/// Command dừng test đang chạy
#[tauri::command]
pub async fn stop_test(state: State<'_, AppState>) -> Result<(), String> {
    let token = state.cancel_token.lock().clone();
    if let Some(cancel) = token {
        cancel.cancel();
        Ok(())
    } else {
        // Không có test nào đang chạy — vẫn trả OK để frontend không bị lỗi
        Ok(())
    }
}

/// Tokenize curl command — respects single/double quoted strings
fn tokenize_curl(cmd: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut chars = cmd.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '\'' if !in_double => {
                in_single = !in_single;
            }
            '"' if !in_single => {
                in_double = !in_double;
            }
            '\\' if !in_single && !in_double => {
                if matches!(chars.peek(), Some('\n') | Some('\r')) {
                    chars.next();
                }
            }
            ' ' | '\t' | '\n' | '\r' if !in_single && !in_double => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(ch);
            }
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/// Parse curl command thành TestConfig
#[tauri::command]
pub fn parse_curl(curl_command: String) -> Result<TestConfig, String> {
    let mut url = String::new();
    let mut method = "GET".to_string();
    let mut headers = std::collections::HashMap::new();
    let mut body: Option<String> = None;

    let tokens = tokenize_curl(&curl_command);
    let mut i = 0;

    while i < tokens.len() {
        let part = tokens[i].as_str();
        match part {
            "curl" => {}
            "-X" | "--request" => {
                i += 1;
                if i < tokens.len() {
                    method = tokens[i].to_uppercase();
                }
            }
            "-H" | "--header" => {
                i += 1;
                if i < tokens.len() {
                    let header = &tokens[i];
                    if let Some(colon_pos) = header.find(':') {
                        let key = header[..colon_pos].trim().to_lowercase();
                        let value = header[colon_pos + 1..].trim().to_string();
                        headers.insert(key, value);
                    }
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" => {
                i += 1;
                if i < tokens.len() {
                    body = Some(tokens[i].clone());
                    if method == "GET" {
                        method = "POST".to_string();
                    }
                }
            }
            p if (p.starts_with("http://") || p.starts_with("https://")) && url.is_empty() => {
                url = p.to_string();
            }
            _ => {}
        }
        i += 1;
    }

    if url.is_empty() {
        return Err("No URL found in curl command".to_string());
    }

    Ok(TestConfig {
        url,
        method,
        headers,
        body,
        virtual_users: 100,
        duration_secs: None,
        iterations: Some(1),
        mode: crate::engine::TestMode::Burst,
        timeout_ms: 10_000,
        think_time_ms: 0,
    })
}
