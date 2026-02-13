use crate::config::settings::AppConfig;
use crate::database::models::{ImageRecord, ImageTag};
use crate::database::Database;
use crate::gallery::storage;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn get_images(
    limit: Option<u32>,
    offset: Option<u32>,
    favorites_only: Option<bool>,
    db: State<'_, Database>,
) -> Result<Vec<ImageRecord>, String> {
    storage::get_images(
        &db,
        limit.unwrap_or(50),
        offset.unwrap_or(0),
        favorites_only.unwrap_or(false),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_image_detail(
    image_id: String,
    db: State<'_, Database>,
) -> Result<Option<ImageRecord>, String> {
    storage::get_image_detail(&db, &image_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_image(image_id: String, db: State<'_, Database>) -> Result<(), String> {
    storage::soft_delete_image(&db, &image_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn favorite_image(image_id: String, db: State<'_, Database>) -> Result<bool, String> {
    storage::toggle_favorite(&db, &image_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_images(query: String, db: State<'_, Database>) -> Result<Vec<ImageRecord>, String> {
    storage::search_images(&db, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_image_path(
    image_id: String,
    config: State<'_, Mutex<AppConfig>>,
) -> Result<String, String> {
    let image_dir = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        cfg.storage.image_directory.clone()
    };
    Ok(format!("{}/originals/{}.png", image_dir, image_id))
}

#[tauri::command]
pub fn update_image_rating(
    image_id: String,
    rating: Option<u32>,
    db: State<'_, Database>,
) -> Result<(), String> {
    storage::update_rating(&db, &image_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_caption(
    image_id: String,
    caption: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    storage::update_caption(&db, &image_id, &caption, true).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_image_tags(
    image_id: String,
    db: State<'_, Database>,
) -> Result<Vec<ImageTag>, String> {
    storage::get_tags(&db, &image_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_image_tag(
    image_id: String,
    tag: String,
    db: State<'_, Database>,
) -> Result<ImageTag, String> {
    storage::add_single_tag(&db, &image_id, &tag, "user").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_image_tag(tag_id: i64, db: State<'_, Database>) -> Result<(), String> {
    storage::delete_tag(&db, tag_id).map_err(|e| e.to_string())
}
