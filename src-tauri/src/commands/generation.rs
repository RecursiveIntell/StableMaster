use crate::config::settings::AppConfig;
use crate::database::models::ImageRecord;
use crate::database::Database;
use crate::gallery::storage;
use crate::generation::comfyui::{self, GenerationParams};
use crate::queue::jobs::GenerationJob;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;
use tauri_queue::{QueueJob, QueueManager};

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerationRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub checkpoint: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub steps: Option<u32>,
    pub cfg_scale: Option<f64>,
    pub sampler: Option<String>,
    pub scheduler: Option<String>,
    pub seed: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerationResponse {
    pub image_id: String,
    pub seed: i64,
}

#[tauri::command]
pub async fn generate_image(
    req: GenerationRequest,
    config: State<'_, Mutex<AppConfig>>,
    db: State<'_, Database>,
) -> Result<GenerationResponse, String> {
    let (endpoint, defaults, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.comfyui.endpoint.clone(),
            cfg.generation.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let mut params = GenerationParams {
        prompt: req.prompt.clone(),
        negative_prompt: req
            .negative_prompt
            .clone()
            .unwrap_or(defaults.negative_prompt),
        checkpoint: req.checkpoint.clone().unwrap_or(defaults.checkpoint),
        width: req.width.unwrap_or(defaults.width),
        height: req.height.unwrap_or(defaults.height),
        steps: req.steps.unwrap_or(defaults.steps),
        cfg_scale: req.cfg_scale.unwrap_or(defaults.cfg_scale),
        sampler: req.sampler.clone().unwrap_or(defaults.sampler),
        scheduler: req.scheduler.clone().unwrap_or(defaults.scheduler),
        seed: req.seed,
        batch_size: None,
    };

    // Auto-detect first available checkpoint if none specified
    if params.checkpoint.trim().is_empty() {
        let available = comfyui::get_checkpoints(&endpoint)
            .await
            .map_err(|e| format!("Failed to fetch checkpoints: {}", e))?;
        if let Some(first) = available.first() {
            params.checkpoint = first.clone();
        } else {
            return Err("No checkpoints found on ComfyUI. Please install at least one model.".to_string());
        }
    }

    let result = comfyui::generate_txt2img(&endpoint, &params)
        .await
        .map_err(|e| e.to_string())?;

    // Save first image
    let image_id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}.png", image_id);
    let originals_dir = format!("{}/originals", image_dir);

    std::fs::create_dir_all(&originals_dir).map_err(|e| e.to_string())?;

    let image_path = format!("{}/{}", originals_dir, filename);
    if let Some(first_image) = result.images.first() {
        std::fs::write(&image_path, first_image).map_err(|e| e.to_string())?;
    }

    // Save to database
    let record = ImageRecord {
        id: image_id.clone(),
        filename: filename.clone(),
        width: params.width,
        height: params.height,
        prompt: Some(params.prompt),
        negative_prompt: Some(params.negative_prompt),
        checkpoint: Some(params.checkpoint),
        sampler: Some(params.sampler),
        scheduler: Some(params.scheduler),
        steps: Some(params.steps),
        cfg_scale: Some(params.cfg_scale),
        seed: Some(result.seed),
        created_at: chrono::Utc::now().to_rfc3339(),
        favorite: false,
        rating: None,
        caption: None,
        caption_edited: false,
    };

    storage::save_image_record(&db, &record).map_err(|e| e.to_string())?;

    Ok(GenerationResponse {
        image_id,
        seed: result.seed,
    })
}

#[tauri::command]
pub async fn queue_generation(
    req: GenerationRequest,
    config: State<'_, Mutex<AppConfig>>,
    queue: State<'_, Arc<QueueManager>>,
) -> Result<String, String> {
    let (endpoint, defaults, image_dir) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.comfyui.endpoint.clone(),
            cfg.generation.clone(),
            cfg.storage.image_directory.clone(),
        )
    };

    let mut params = GenerationParams {
        prompt: req.prompt,
        negative_prompt: req.negative_prompt.unwrap_or(defaults.negative_prompt),
        checkpoint: req.checkpoint.unwrap_or(defaults.checkpoint),
        width: req.width.unwrap_or(defaults.width),
        height: req.height.unwrap_or(defaults.height),
        steps: req.steps.unwrap_or(defaults.steps),
        cfg_scale: req.cfg_scale.unwrap_or(defaults.cfg_scale),
        sampler: req.sampler.unwrap_or(defaults.sampler),
        scheduler: req.scheduler.unwrap_or(defaults.scheduler),
        seed: req.seed,
        batch_size: None,
    };

    // Auto-detect first available checkpoint if none specified
    if params.checkpoint.trim().is_empty() {
        let available = comfyui::get_checkpoints(&endpoint)
            .await
            .map_err(|e| format!("Failed to fetch checkpoints: {}", e))?;
        if let Some(first) = available.first() {
            params.checkpoint = first.clone();
        } else {
            return Err("No checkpoints found on ComfyUI. Please install at least one model.".to_string());
        }
    }

    let job = QueueJob::new(GenerationJob {
        params,
        output_dir: format!("{}/originals", image_dir),
        endpoint,
    });

    let job_id = queue.add(job).map_err(|e| e.to_string())?;
    Ok(job_id)
}

#[tauri::command]
pub async fn cancel_generation(
    job_id: String,
    queue: State<'_, Arc<QueueManager>>,
) -> Result<(), String> {
    queue.cancel(&job_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_checkpoints(
    config: State<'_, Mutex<AppConfig>>,
) -> Result<Vec<String>, String> {
    let endpoint = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        cfg.comfyui.endpoint.clone()
    };
    comfyui::get_checkpoints(&endpoint)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_samplers(
    config: State<'_, Mutex<AppConfig>>,
) -> Result<Vec<String>, String> {
    let endpoint = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        cfg.comfyui.endpoint.clone()
    };
    comfyui::get_samplers(&endpoint)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_schedulers(
    config: State<'_, Mutex<AppConfig>>,
) -> Result<Vec<String>, String> {
    let endpoint = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        cfg.comfyui.endpoint.clone()
    };
    comfyui::get_schedulers(&endpoint)
        .await
        .map_err(|e| e.to_string())
}
