use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;

/// Một entry trong bảng test_history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub timestamp: String,
    pub url: String,
    pub method: String,
    pub mode: String,
    pub virtual_users: u32,
    pub config_json: String,
    pub result_json: String,
}

/// Một scenario đã lưu
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioEntry {
    pub id: i64,
    pub name: String,
    pub steps_json: String,
}

/// Database wrapper — thread-safe
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Mở hoặc tạo database tại đường dẫn chỉ định
    pub fn open(db_path: PathBuf) -> Result<Self, String> {
        // Tạo thư mục cha nếu chưa có
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create DB directory: {}", e))?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Cannot open SQLite DB: {}", e))?;

        // WAL mode — tăng performance cho concurrent reads
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("PRAGMA error: {}", e))?;

        // Tạo bảng nếu chưa có
        conn.execute(
            "CREATE TABLE IF NOT EXISTS test_history (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp     TEXT NOT NULL,
                url           TEXT NOT NULL,
                method        TEXT NOT NULL,
                mode          TEXT NOT NULL,
                virtual_users INTEGER NOT NULL,
                config_json   TEXT NOT NULL,
                result_json   TEXT NOT NULL,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .map_err(|e| format!("Cannot create table: {}", e))?;

        // Bảng scenarios
        conn.execute(
            "CREATE TABLE IF NOT EXISTS scenarios (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                steps_json  TEXT NOT NULL,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .map_err(|e| format!("Cannot create scenarios table: {}", e))?;

        // ⚡ Fix 3.2: VACUUM khi khởi động để thu hồi dung lượng từ các row đã xoá
        let _ = conn.execute_batch("VACUUM;");

        log::debug!("📦 [DB] SQLite opened at {:?}", db_path);
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Lưu một kết quả test vào history
    pub fn save_history(
        &self,
        timestamp: &str,
        url: &str,
        method: &str,
        mode: &str,
        virtual_users: u32,
        config_json: &str,
        result_json: &str,
    ) -> Result<i64, String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO test_history (timestamp, url, method, mode, virtual_users, config_json, result_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![timestamp, url, method, mode, virtual_users, config_json, result_json],
        )
        .map_err(|e| format!("Insert error: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    /// Lấy toàn bộ history (mới nhất trước)
    pub fn get_history(&self, limit: u32) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, timestamp, url, method, mode, virtual_users, config_json, result_json
                 FROM test_history
                 ORDER BY id DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(HistoryEntry {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    url: row.get(2)?,
                    method: row.get(3)?,
                    mode: row.get(4)?,
                    virtual_users: row.get(5)?,
                    config_json: row.get(6)?,
                    result_json: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(entries)
    }

    /// Xóa một entry theo ID
    pub fn delete_history(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM test_history WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete error: {}", e))?;
        Ok(())
    }

    /// Xóa toàn bộ history
    pub fn clear_history(&self) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM test_history", [])
            .map_err(|e| format!("Clear error: {}", e))?;
        Ok(())
    }

    // ─── Scenarios CRUD ───

    pub fn save_scenario(&self, name: &str, steps_json: &str) -> Result<i64, String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO scenarios (name, steps_json) VALUES (?1, ?2)",
            params![name, steps_json],
        )
        .map_err(|e| format!("Insert scenario error: {}", e))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_scenario(&self, id: i64, name: &str, steps_json: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE scenarios SET name = ?1, steps_json = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
            params![name, steps_json, id],
        )
        .map_err(|e| format!("Update scenario error: {}", e))?;
        Ok(())
    }

    pub fn get_scenarios(&self) -> Result<Vec<ScenarioEntry>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT id, name, steps_json FROM scenarios ORDER BY updated_at DESC")
            .map_err(|e| format!("Prepare error: {}", e))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ScenarioEntry {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    steps_json: row.get(2)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(entries)
    }

    pub fn delete_scenario(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM scenarios WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete scenario error: {}", e))?;
        Ok(())
    }
}
