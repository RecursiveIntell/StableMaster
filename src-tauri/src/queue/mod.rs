pub mod jobs;

use anyhow::Result;
use tauri::AppHandle;
use tauri::Manager;
use tauri_queue::QueueManager;

pub fn initialize(app: &AppHandle) -> Result<()> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("queue.db");

    let config = tauri_queue::QueueConfig::builder()
        .with_db_path(db_path)
        .with_max_consecutive(10)
        .with_cooldown(std::time::Duration::from_secs(5))
        .build();

    let queue = QueueManager::new(config)?;
    let queue = queue.spawn::<jobs::GenerationJob>(app.clone());
    app.manage(queue);

    Ok(())
}
