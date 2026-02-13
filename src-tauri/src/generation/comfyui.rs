use anyhow::Result;
use comfyui_rs::{ComfyClient, GenerationOutcome, Txt2ImgRequest};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationParams {
    pub prompt: String,
    pub negative_prompt: String,
    pub checkpoint: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: Option<i64>,
    pub batch_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationResult {
    pub images: Vec<Vec<u8>>,
    pub seed: i64,
}

pub async fn generate_txt2img(
    endpoint: &str,
    params: &GenerationParams,
) -> Result<GenerationResult> {
    if params.checkpoint.trim().is_empty() {
        anyhow::bail!(
            "No checkpoint specified. Please select a model or configure a default checkpoint in Settings."
        );
    }

    let client = ComfyClient::new(endpoint).with_client_id("stablemaster");

    // Check health
    if !client.health().await.map_err(|e| anyhow::anyhow!("{}", e))? {
        anyhow::bail!("ComfyUI is not responding at {}", endpoint);
    }

    // Build workflow
    let mut request = Txt2ImgRequest::new(&params.prompt, &params.checkpoint)
        .negative(&params.negative_prompt)
        .size(params.width, params.height)
        .steps(params.steps)
        .cfg_scale(params.cfg_scale)
        .sampler(&params.sampler)
        .scheduler(&params.scheduler)
        .filename_prefix("StableMaster");

    if let Some(seed) = params.seed {
        request = request.seed(seed);
    }

    if let Some(batch) = params.batch_size {
        request = request.batch_size(batch);
    }

    let (workflow, actual_seed) = request.build();

    // Queue prompt
    let prompt_id = client
        .queue_prompt(&workflow)
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    // Wait for completion with WebSocket progress
    let result = client
        .wait_for_completion_ws(&prompt_id, Duration::from_secs(300), |progress| {
            let _pct = (progress.current_step as f64 / progress.total_steps as f64) * 100.0;
        })
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    match result {
        GenerationOutcome::Completed { images } => {
            let mut image_bytes = Vec::new();
            for img_ref in &images {
                let bytes = client
                    .image(img_ref)
                    .await
                    .map_err(|e| anyhow::anyhow!("{}", e))?;
                image_bytes.push(bytes);
            }
            Ok(GenerationResult {
                images: image_bytes,
                seed: actual_seed,
            })
        }
        GenerationOutcome::Failed { error } => {
            anyhow::bail!("Generation failed: {}", error)
        }
        GenerationOutcome::TimedOut => {
            anyhow::bail!("Generation timed out")
        }
    }
}

pub async fn get_checkpoints(endpoint: &str) -> Result<Vec<String>> {
    let client = ComfyClient::new(endpoint);
    client
        .checkpoints()
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub async fn get_samplers(endpoint: &str) -> Result<Vec<String>> {
    let client = ComfyClient::new(endpoint);
    client
        .samplers()
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub async fn get_schedulers(endpoint: &str) -> Result<Vec<String>> {
    let client = ComfyClient::new(endpoint);
    client
        .schedulers()
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))
}
