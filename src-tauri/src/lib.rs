mod commands;
mod engine;

use commands::{parse_curl, run_load_test, stop_test, AppState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            run_load_test,
            parse_curl,
            stop_test,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
