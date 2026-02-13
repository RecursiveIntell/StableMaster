pub mod models;
pub mod schema;

use anyhow::Result;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

pub struct Database {
    pub conn: Mutex<Connection>,
}

pub fn initialize(app: &AppHandle) -> Result<()> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("stablemaster.db");
    let conn = Connection::open(db_path)?;

    schema::create_tables(&conn)?;
    schema::run_migrations(&conn)?;

    app.manage(Database {
        conn: Mutex::new(conn),
    });

    Ok(())
}
