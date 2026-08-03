use crate::config::settings::AppConfig;
use crate::database::models::ImageRecord;
use crate::database::Database;
use crate::gallery::storage;
use crate::generation::inpaint::{build_inpaint_workflow, InpaintParams};
use comfyui_rs::{ComfyClient, GenerationOutcome};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InpaintRequest {
    pub image_path: String,
    pub mask_png_bytes: Vec<u8>,
    pub prompt: String,
    pub negative_prompt: String,
    pub denoise: f64,
    pub steps: u32,
    pub cfg_scale: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: Option<i64>,
    pub parent_image_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InpaintResponse {
    pub image_id: String,
    pub seed: i64,
    pub filename: String,
}

#[tauri::command]
pub async fn inpaint_image(
    request: InpaintRequest,
    config: State<'_, Mutex<AppConfig>>,
    db: State<'_, Database>,
) -> Result<InpaintResponse, String> {
    let (endpoint, image_dir, checkpoint) = {
        let cfg = config.lock().map_err(|e| e.to_string())?;
        (
            cfg.comfyui.endpoint.clone(),
            cfg.storage.image_directory.clone(),
            cfg.generation.checkpoint.clone(),
        )
    };

    inpaint_impl(&endpoint, &image_dir, &checkpoint, &request, &db)
        .await
        .map_err(|e| e.to_string())
}

async fn inpaint_impl(
    endpoint: &str,
    image_dir: &str,
    default_checkpoint: &str,
    request: &InpaintRequest,
    db: &Database,
) -> anyhow::Result<InpaintResponse> {
    eprintln!("[inpaint] Starting inpaint for parent image {}", request.parent_image_id);
    eprintln!("[inpaint] Source path: {}", request.image_path);
    eprintln!("[inpaint] Mask size: {} bytes", request.mask_png_bytes.len());

    // Read source image from filesystem
    let source_bytes = std::fs::read(&request.image_path)
        .map_err(|e| anyhow::anyhow!("Failed to read source image '{}': {}", request.image_path, e))?;
    eprintln!("[inpaint] Source image read: {} bytes", source_bytes.len());

    // Generate unique filenames for ComfyUI upload
    let src_filename = format!("sm_inpaint_src_{}.png", uuid::Uuid::new_v4());
    let mask_filename = format!("sm_inpaint_mask_{}.png", uuid::Uuid::new_v4());

    let client = ComfyClient::new(endpoint).with_client_id("stablemaster");

    // Check health
    eprintln!("[inpaint] Checking ComfyUI health at {}", endpoint);
    if !client
        .health()
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?
    {
        anyhow::bail!("ComfyUI is not responding at {}", endpoint);
    }
    eprintln!("[inpaint] ComfyUI is healthy");

    // Upload source image
    eprintln!("[inpaint] Uploading source image as {}", src_filename);
    let comfyui_src_name = client
        .upload_image(&source_bytes, &src_filename, true)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to upload source image: {}", e))?;
    eprintln!("[inpaint] Source uploaded as: {}", comfyui_src_name);

    // Upload mask
    eprintln!("[inpaint] Uploading mask as {}", mask_filename);
    let comfyui_mask_name = client
        .upload_image(&request.mask_png_bytes, &mask_filename, true)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to upload mask: {}", e))?;
    eprintln!("[inpaint] Mask uploaded as: {}", comfyui_mask_name);

    // Determine checkpoint
    let checkpoint = if default_checkpoint.trim().is_empty() {
        eprintln!("[inpaint] No default checkpoint, auto-detecting...");
        let available = client
            .checkpoints()
            .await
            .map_err(|e| anyhow::anyhow!("{}", e))?;
        let ckpt = available
            .first()
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("No checkpoints found on ComfyUI"))?;
        eprintln!("[inpaint] Auto-detected checkpoint: {}", ckpt);
        ckpt
    } else {
        eprintln!("[inpaint] Using checkpoint: {}", default_checkpoint);
        default_checkpoint.to_string()
    };

    // Build inpaint params
    let params = InpaintParams {
        prompt: request.prompt.clone(),
        negative_prompt: request.negative_prompt.clone(),
        checkpoint,
        source_image_name: comfyui_src_name,
        mask_image_name: comfyui_mask_name,
        steps: request.steps,
        cfg_scale: request.cfg_scale,
        denoise: request.denoise,
        sampler: request.sampler.clone(),
        scheduler: request.scheduler.clone(),
        seed: request.seed,
    };

    let (workflow, seed) = build_inpaint_workflow(&params);

    // Queue prompt
    eprintln!("[inpaint] Queuing inpaint workflow...");
    let prompt_id = client
        .queue_prompt(&workflow)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to queue inpaint workflow: {}", e))?;
    eprintln!("[inpaint] Queued with prompt_id: {}", prompt_id);

    // Wait for completion with WebSocket progress
    eprintln!("[inpaint] Waiting for completion...");
    let result = client
        .wait_for_completion_ws(&prompt_id, Duration::from_secs(300), |progress| {
            let pct = (progress.current_step as f64 / progress.total_steps as f64) * 100.0;
            eprintln!("[inpaint] Progress: {:.0}% ({}/{})", pct, progress.current_step, progress.total_steps);
        })
        .await
        .map_err(|e| anyhow::anyhow!("Inpaint generation failed: {}", e))?;

    match result {
        GenerationOutcome::Completed { images } => {
            eprintln!("[inpaint] Generation completed, {} image(s) returned", images.len());

            let img_ref = images
                .first()
                .ok_or_else(|| anyhow::anyhow!("No images returned from inpainting"))?;

            eprintln!("[inpaint] Downloading result image: {}", img_ref.filename);
            let image_bytes = client
                .image(img_ref)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to download result image: {}", e))?;
            eprintln!("[inpaint] Downloaded {} bytes", image_bytes.len());

            // Save to output directory
            let image_id = uuid::Uuid::new_v4().to_string();
            let filename = format!("{}.png", image_id);
            let originals_dir = format!("{}/originals", image_dir);

            std::fs::create_dir_all(&originals_dir)
                .map_err(|e| anyhow::anyhow!("Failed to create output dir: {}", e))?;

            let image_path = format!("{}/{}", originals_dir, filename);
            std::fs::write(&image_path, &image_bytes)
                .map_err(|e| anyhow::anyhow!("Failed to write output image: {}", e))?;

            // Get image dimensions
            let img = image::load_from_memory(&image_bytes)
                .map_err(|e| anyhow::anyhow!("Failed to decode image: {}", e))?;

            // Save to database
            let record = ImageRecord {
                id: image_id.clone(),
                filename: filename.clone(),
                width: img.width(),
                height: img.height(),
                prompt: Some(request.prompt.clone()),
                negative_prompt: Some(request.negative_prompt.clone()),
                checkpoint: Some(params.checkpoint.clone()),
                sampler: Some(request.sampler.clone()),
                scheduler: Some(request.scheduler.clone()),
                steps: Some(request.steps),
                cfg_scale: Some(request.cfg_scale),
                seed: Some(seed),
                created_at: chrono::Utc::now().to_rfc3339(),
                favorite: false,
                rating: None,
                caption: None,
                caption_edited: false,
                parent_image_id: Some(request.parent_image_id.clone()),
                generation_type: "inpaint".to_string(),
            };

            storage::save_image_record(db, &record)?;
            eprintln!("[inpaint] Saved to gallery: id={}, file={}", image_id, filename);

            Ok(InpaintResponse {
                image_id,
                seed,
                filename,
            })
        }
        GenerationOutcome::Failed { error } => {
            eprintln!("[inpaint] Generation failed: {}", error);
            anyhow::bail!("Inpainting failed: {}", error)
        }
        GenerationOutcome::TimedOut => {
            eprintln!("[inpaint] Generation timed out");
            anyhow::bail!("Inpainting timed out")
        }
    }
}
