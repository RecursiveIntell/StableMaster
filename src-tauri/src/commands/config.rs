use crate::config::settings::{AppConfig, UIMode};
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn get_config(config: State<'_, Mutex<AppConfig>>) -> Result<AppConfig, String> {
    let cfg = config.lock().map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn update_config(
    app: tauri::AppHandle,
    updated: AppConfig,
    config: State<'_, Mutex<AppConfig>>,
) -> Result<(), String> {
    let mut cfg = config.lock().map_err(|e| e.to_string())?;
    *cfg = updated.clone();
    crate::config::save_config(&app, &updated).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_mode(config: State<'_, Mutex<AppConfig>>) -> Result<String, String> {
    let cfg = config.lock().map_err(|e| e.to_string())?;
    match cfg.mode {
        UIMode::Standard => Ok("standard".to_string()),
        UIMode::Expert => Ok("expert".to_string()),
    }
}

#[tauri::command]
pub fn set_mode(
    app: tauri::AppHandle,
    mode: String,
    config: State<'_, Mutex<AppConfig>>,
) -> Result<(), String> {
    let mut cfg = config.lock().map_err(|e| e.to_string())?;
    cfg.mode = match mode.as_str() {
        "expert" => UIMode::Expert,
        _ => UIMode::Standard,
    };
    crate::config::save_config(&app, &cfg).map_err(|e| e.to_string())?;
    Ok(())
}
