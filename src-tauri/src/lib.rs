mod commands;
mod db;
mod engine;

use commands::{
    clear_all_history, delete_history, get_history, parse_curl, run_load_test, save_history,
    stop_test, AppState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Lấy app data dir — nơi lưu DB an toàn theo OS
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_path = app_data_dir.join("spamapi.db");
            eprintln!("📂 [APP] Data dir: {:?}", app_data_dir);

            let state = AppState::new(db_path)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_load_test,
            parse_curl,
            stop_test,
            get_history,
            save_history,
            delete_history,
            clear_all_history,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("🛑 Fatal error while running tauri application: {}", e);
    }
}
