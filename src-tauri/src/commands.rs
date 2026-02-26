use crate::engine::{LoadTestEngine, TestConfig, TestResult};
use tauri::{AppHandle, Emitter};

/// Command chạy load test — được gọi từ Frontend
#[tauri::command]
pub async fn run_load_test(
    app: AppHandle,
    config: TestConfig,
) -> Result<TestResult, String> {
    let timeout_ms = config.timeout_ms;
    let engine = LoadTestEngine::new(timeout_ms);
    let app_clone = app.clone();

    let result = engine
        .run_burst(config, move |progress, req_result| {
            let _ = app_clone.emit(
                "test_progress",
                serde_json::json!({
                    "progress": progress,
                    "result": req_result,
                }),
            );
        })
        .await;

    Ok(result)
}

/// Parse curl command thành TestConfig
#[tauri::command]
pub fn parse_curl(curl_command: String) -> Result<TestConfig, String> {
    let mut url = String::new();
    let mut method = "GET".to_string();
    let mut headers = std::collections::HashMap::new();
    let mut body = None;

    let parts: Vec<&str> = curl_command.split_whitespace().collect();
    let mut i = 0;

    while i < parts.len() {
        match parts[i] {
            "curl" => {}
            "-X" | "--request" => {
                i += 1;
                if i < parts.len() {
                    method = parts[i].to_uppercase();
                }
            }
            "-H" | "--header" => {
                i += 1;
                if i < parts.len() {
                    let header = parts[i].trim_matches('\'').trim_matches('"');
                    if let Some(colon_pos) = header.find(':') {
                        let key = header[..colon_pos].trim().to_string();
                        let value = header[colon_pos + 1..].trim().to_string();
                        headers.insert(key, value);
                    }
                }
            }
            "-d" | "--data" | "--data-raw" => {
                i += 1;
                if i < parts.len() {
                    body = Some(parts[i].trim_matches('\'').trim_matches('"').to_string());
                    if method == "GET" {
                        method = "POST".to_string();
                    }
                }
            }
            p if p.starts_with("http://") || p.starts_with("https://") => {
                url = p.trim_matches('\'').trim_matches('"').to_string();
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
