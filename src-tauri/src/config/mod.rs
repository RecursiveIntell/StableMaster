pub mod settings;

use anyhow::Result;
use settings::AppConfig;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

pub fn load_or_create_default(app: &AppHandle) -> Result<()> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&app_dir)?;

    let config_path = app_dir.join("config.json");

    let config = if config_path.exists() {
        let data = std::fs::read_to_string(&config_path)?;
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        let default_config = AppConfig::default();
        let json = serde_json::to_string_pretty(&default_config)?;
        std::fs::write(&config_path, json)?;
        default_config
    };

    app.manage(Mutex::new(config));
    Ok(())
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<()> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    let config_path = app_dir.join("config.json");
    let json = serde_json::to_string_pretty(config)?;
    std::fs::write(config_path, json)?;
    Ok(())
}
