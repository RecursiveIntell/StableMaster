use crate::ai::batch_handler::AiBatchItemData;
use crate::ai::{batch_tagging, prompt_enhancement};
use crate::config::settings::AppConfig;
use crate::database::models::ImageTag;
use crate::database::Database;
use crate::gallery::storage as gallery_storage;
use ai_batch_queue::{BatchJob, BatchQueue, OverwritePolicy, SizeBucket};
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub async fn enhance_prompt(
    prompt: String,
    style: String,
    detail_level: String,
    config: State<'_, Mutex<AppConfig>>,
) -> Result<String, String> {
    let (endpoint, model) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (cfg.ollama.endpoint.clone(), cfg.ollama.enhancement_model.clone())
    };

    let client = reqwest::Client::new();
    let enhanced = prompt_enhancement::enhance_prompt(
        &client,
        &endpoint,
        &model,
        &prompt,
        &style,
        &detail_level,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(enhanced)
}

#[tauri::command]
pub async fn batch_tag_images(
    image_ids: Vec<String>,
    config: State<'_, Mutex<AppConfig>>,
    db: State<'_, Database>,
) -> Result<u32, String> {
    let (endpoint, model, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.ollama.endpoint.clone(),
            cfg.ollama.vision_model.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let client = reqwest::Client::new();
    let mut tagged_count = 0u32;

    for image_id in &image_ids {
        let image_path =
            std::path::PathBuf::from(format!("{}/originals/{}.png", image_dir, image_id));

        if !image_path.exists() {
            continue;
        }

        match batch_tagging::tag_single_image(&client, &endpoint, &model, &image_path).await {
            Ok(tags) => {
                gallery_storage::save_tags(&db, image_id, &tags).map_err(|e| e.to_string())?;
                tagged_count += 1;
            }
            Err(e) => {
                eprintln!("Failed to tag image {}: {}", image_id, e);
            }
        }
    }

    Ok(tagged_count)
}

#[tauri::command]
pub async fn caption_single(
    image_id: String,
    config: State<'_, Mutex<AppConfig>>,
    db: State<'_, Database>,
) -> Result<String, String> {
    let (endpoint, model, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.ollama.endpoint.clone(),
            cfg.ollama.vision_model.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let image_path =
        std::path::PathBuf::from(format!("{}/originals/{}.png", image_dir, image_id));

    if !image_path.exists() {
        return Err(format!("Image file not found: {}", image_path.display()));
    }

    let client = reqwest::Client::new();
    let caption = batch_tagging::caption_single_image(&client, &endpoint, &model, &image_path)
        .await
        .map_err(|e| e.to_string())?;

    gallery_storage::update_caption(&db, &image_id, &caption, false)
        .map_err(|e| e.to_string())?;

    Ok(caption)
}

#[tauri::command]
pub async fn tag_single(
    image_id: String,
    config: State<'_, Mutex<AppConfig>>,
    db: State<'_, Database>,
) -> Result<Vec<ImageTag>, String> {
    let (endpoint, model, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.ollama.endpoint.clone(),
            cfg.ollama.vision_model.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let image_path =
        std::path::PathBuf::from(format!("{}/originals/{}.png", image_dir, image_id));

    if !image_path.exists() {
        return Err(format!("Image file not found: {}", image_path.display()));
    }

    // Clear existing AI tags
    gallery_storage::clear_ai_tags(&db, &image_id).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let tags = batch_tagging::tag_single_image(&client, &endpoint, &model, &image_path)
        .await
        .map_err(|e| e.to_string())?;

    gallery_storage::save_tags_with_source(&db, &image_id, &tags, "ai", None)
        .map_err(|e| e.to_string())?;

    // Return all tags for this image
    gallery_storage::get_tags(&db, &image_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_ollama_models(
    config: State<'_, Mutex<AppConfig>>,
) -> Result<Vec<String>, String> {
    let endpoint = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        cfg.ollama.endpoint.clone()
    };

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/tags", endpoint))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let models = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

#[tauri::command]
pub async fn start_batch_tag(
    image_ids: Vec<String>,
    config: State<'_, Mutex<AppConfig>>,
    queue: State<'_, BatchQueue<AiBatchItemData>>,
) -> Result<String, String> {
    let (model, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.ollama.vision_model.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let items: Vec<(String, AiBatchItemData, SizeBucket)> = image_ids
        .into_iter()
        .map(|id| {
            let path = format!("{}/originals/{}.png", image_dir, id);
            (
                id.clone(),
                AiBatchItemData {
                    image_id: id,
                    image_path: path,
                },
                SizeBucket::Medium,
            )
        })
        .collect();

    let job = ai_batch_queue::build_job(&model, "tag", OverwritePolicy::Overwrite, items);
    let job_id = queue.enqueue(job).map_err(|e| e.to_string())?;
    Ok(job_id)
}

#[tauri::command]
pub async fn start_batch_caption(
    image_ids: Vec<String>,
    config: State<'_, Mutex<AppConfig>>,
    queue: State<'_, BatchQueue<AiBatchItemData>>,
) -> Result<String, String> {
    let (model, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.ollama.vision_model.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let items: Vec<(String, AiBatchItemData, SizeBucket)> = image_ids
        .into_iter()
        .map(|id| {
            let path = format!("{}/originals/{}.png", image_dir, id);
            (
                id.clone(),
                AiBatchItemData {
                    image_id: id,
                    image_path: path,
                },
                SizeBucket::Medium,
            )
        })
        .collect();

    let job = ai_batch_queue::build_job(&model, "caption", OverwritePolicy::Overwrite, items);
    let job_id = queue.enqueue(job).map_err(|e| e.to_string())?;
    Ok(job_id)
}

#[tauri::command]
pub fn get_batch_jobs(
    queue: State<'_, BatchQueue<AiBatchItemData>>,
) -> Result<Vec<BatchJob<AiBatchItemData>>, String> {
    Ok(queue.list_jobs())
}

#[tauri::command]
pub fn cancel_batch_job(
    job_id: String,
    queue: State<'_, BatchQueue<AiBatchItemData>>,
) -> Result<(), String> {
    queue.cancel_job(&job_id).map_err(|e| e.to_string())
}
