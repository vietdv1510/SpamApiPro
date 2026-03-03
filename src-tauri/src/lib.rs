mod commands;
mod db;
mod engine;

use commands::{
    clear_all_history, delete_history, delete_scenario, get_history, get_scenarios, open_file,
    parse_curl, run_load_test, save_history, save_scenario, stop_test, update_scenario, AppState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Init logger — RUST_LOG=debug để xem logs, silent trong release
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();

    // 🛡️ Sentry — DSN từ compile-time env var SENTRY_DSN (không hardcode secret)
    let sentry_dsn = option_env!("SENTRY_DSN").unwrap_or("");
    let _guard = sentry::init((sentry_dsn, sentry::ClientOptions {
        release: sentry::release_name!(),
        ..Default::default()
    }));

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
            log::debug!("app data dir: {:?}", app_data_dir);

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
            open_file,
            get_scenarios,
            save_scenario,
            update_scenario,
            delete_scenario,
        ])
        .run(tauri::generate_context!())
    {
        log::error!("fatal error running tauri: {}", e);
    }
}
