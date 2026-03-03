use crate::db::{Database, HistoryEntry, ScenarioEntry};
use crate::engine::{LoadTestEngine, TestConfig, TestResult};
use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

/// Shared application state — quản lý cancel token
pub struct AppState {
    pub cancel_token: Arc<Mutex<Option<CancellationToken>>>,
    pub db: Database,
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        Ok(Self {
            cancel_token: Arc::new(Mutex::new(None)),
            db: Database::open(db_path)?,
        })
    }
}

/// Command chạy load test — hỗ trợ cancel + auto-cancel previous run
#[tauri::command]
pub async fn run_load_test(
    app: AppHandle,
    state: State<'_, AppState>,
    config: TestConfig,
) -> Result<TestResult, String> {
    log::debug!("🟢 [CMD] run_load_test called: {} VUs, mode={:?}, url={}", config.virtual_users, config.mode, config.url);

    // ── Input validation ──
    if config.virtual_users == 0 || config.virtual_users > 10_000 {
        return Err("virtual_users must be between 1 and 10,000".to_string());
    }
    if !config.url.starts_with("http://") && !config.url.starts_with("https://") {
        return Err("Only HTTP/HTTPS URLs are supported".to_string());
    }
    if config.url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }
    if config.timeout_ms < 100 || config.timeout_ms > 300_000 {
        return Err("timeout_ms must be between 100ms and 300,000ms (5 min)".to_string());
    }


    // ⚡ CRITICAL: Cancel bất kỳ test nào đang chạy — giữ lock liên tục để tránh race condition
    // Nếu 2 requests đến đồng thời không thể cả 2 cùng cancel + ghi token mới
    let cancel = {
        let mut token_lock = state.cancel_token.lock();
        if let Some(old_cancel) = token_lock.take() {
            log::debug!("🔄 [CMD] Cancelling previous run...");
            old_cancel.cancel();
            let _ = app.emit("test_force_cancelled", serde_json::json!({ "reason": "New test started" }));
        }
        let new_cancel = CancellationToken::new();
        *token_lock = Some(new_cancel.clone());
        new_cancel
    };
    // Brief yield để cancel signal propagate trước khi start engine mới
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let engine = LoadTestEngine::new(config.timeout_ms, config.ignore_ssl_errors)?;
    let app_clone = app.clone();
    let cancel_clone = cancel.clone();

    // ⚡ Per-mode global timeout — Stress Test cần nhiều phút, Burst chỉ vài giây
    let global_timeout_ms: u64 = match config.mode {
        crate::engine::TestMode::StressTest => 30 * 60_000, // 30 phút
        crate::engine::TestMode::Constant | crate::engine::TestMode::RampUp => {
            let dur_ms = config.duration_secs.unwrap_or(60) as u64 * 1_000;
            dur_ms + config.timeout_ms + 30_000 // duration + 1 req timeout + buffer
        }
        crate::engine::TestMode::Burst => config.timeout_ms * 3 + 30_000,
    };
    log::debug!("⏱️ [CMD] Global timeout: {}ms (mode={:?})", global_timeout_ms, config.mode);

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
            log::debug!("✅ [CMD] Engine completed normally");
            result
        }
        Err(_) => {
            log::debug!("⏰ [CMD] GLOBAL TIMEOUT! Force-returning empty result");
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

    log::debug!("🏁 [CMD] Returning result to frontend");
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
        Ok(())
    }
}

// ─── SQLite History Commands ───

#[derive(serde::Deserialize)]
pub struct SaveHistoryPayload {
    pub timestamp: String,
    pub url: String,
    pub method: String,
    pub mode: String,
    pub virtual_users: u32,
    pub config_json: String,
    pub result_json: String,
}

#[tauri::command]
pub async fn get_history(state: State<'_, AppState>, limit: Option<u32>) -> Result<Vec<HistoryEntry>, String> {
    state.db.async_get_history(limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn save_history(state: State<'_, AppState>, payload: SaveHistoryPayload) -> Result<i64, String> {
    // Validate payload sizes để tránh DB bloat
    if payload.result_json.len() > 10 * 1024 * 1024 {
        return Err("result_json exceeds 10MB limit".to_string());
    }
    if payload.config_json.len() > 512 * 1024 {
        return Err("config_json exceeds 512KB limit".to_string());
    }
    state.db.async_save_history(
        payload.timestamp,
        payload.url,
        payload.method,
        payload.mode,
        payload.virtual_users,
        payload.config_json,
        payload.result_json,
    ).await
}

#[tauri::command]
pub fn delete_history(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.db.delete_history(id)
}

#[tauri::command]
pub fn clear_all_history(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_history()
}

/// Mở file bằng ứng dụng mặc định của hệ thống (macOS: open, Linux: xdg-open, Windows: start)
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    use std::path::Path;

    let p = Path::new(&path);

    // Validate: phải là absolute path
    if !p.is_absolute() {
        return Err("Only absolute paths are allowed".to_string());
    }

    // Validate: file phải tồn tại
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Block path traversal sequences
    let path_str = path.replace('\\', "/");
    if path_str.contains("../") || path_str.contains("/./") {
        return Err("Path traversal not allowed".to_string());
    }

    // Chỉ mở file (không mở directory)
    if p.is_dir() {
        return Err("Cannot open directories".to_string());
    }

    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(target_os = "linux")]
    let cmd = "xdg-open";
    #[cfg(target_os = "windows")]
    let cmd = "cmd";

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new(cmd).args(["/C", "start", "", &path]).spawn();
    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new(cmd).arg(&path).spawn();

    result.map_err(|e| format!("Cannot open file: {}", e))?;
    Ok(())
}

// ─── Scenario Commands ───

#[tauri::command]
pub fn get_scenarios(state: State<'_, AppState>) -> Result<Vec<ScenarioEntry>, String> {
    state.db.get_scenarios()
}

#[tauri::command]
pub fn save_scenario(
    state: State<'_, AppState>,
    name: String,
    steps_json: String,
) -> Result<i64, String> {
    // Validate
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Scenario name cannot be empty".to_string());
    }
    if steps_json.len() > 512 * 1024 {
        return Err("steps_json exceeds 512KB limit".to_string());
    }
    serde_json::from_str::<serde_json::Value>(&steps_json)
        .map_err(|e| format!("steps_json is not valid JSON: {}", e))?;

    state.db.save_scenario(&name, &steps_json)
}

#[tauri::command]
pub fn update_scenario(
    state: State<'_, AppState>,
    id: i64,
    name: String,
    steps_json: String,
) -> Result<(), String> {
    // Validate
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Scenario name cannot be empty".to_string());
    }
    if steps_json.len() > 512 * 1024 {
        return Err("steps_json exceeds 512KB limit".to_string());
    }
    serde_json::from_str::<serde_json::Value>(&steps_json)
        .map_err(|e| format!("steps_json is not valid JSON: {}", e))?;

    state.db.update_scenario(id, &name, &steps_json)
}

#[tauri::command]
pub fn delete_scenario(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.db.delete_scenario(id)
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
                match chars.peek() {
                    Some('\n') | Some('\r') => { chars.next(); } // line continuation
                    _ => current.push('\\'), // H-3: keep backslash, don't drop silently
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
    // C-1: Limit curl input để tránh OOM khi tokenize chuỗi cực dài
    if curl_command.len() > 64 * 1024 {
        return Err("curl command too long (max 64KB)".to_string());
    }
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
                        let key = header[..colon_pos].trim().to_string(); // preserve original case
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
        ignore_ssl_errors: false,
    })
}
