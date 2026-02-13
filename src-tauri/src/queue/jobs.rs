use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_queue::{JobContext, JobHandler, JobResult, QueueError};

use crate::database::models::ImageRecord;
use crate::database::Database;
use crate::gallery::storage;
use crate::generation::comfyui::{self, GenerationParams};

fn default_endpoint() -> String {
    "http://127.0.0.1:8188".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationJob {
    pub params: GenerationParams,
    pub output_dir: String,
    #[serde(default = "default_endpoint")]
    pub endpoint: String,
}

impl JobHandler for GenerationJob {
    async fn execute(&self, ctx: &JobContext) -> Result<JobResult, QueueError> {
        ctx.emit_progress(0, 100)?;

        let result = comfyui::generate_txt2img(&self.endpoint, &self.params)
            .await
            .map_err(|e| QueueError::Other(e.to_string()))?;

        // Save images to disk and database
        std::fs::create_dir_all(&self.output_dir)
            .map_err(|e| QueueError::Other(e.to_string()))?;

        let db = ctx.app_handle.state::<Database>();

        for image_bytes in &result.images {
            let image_id = uuid::Uuid::new_v4().to_string();
            let filename = format!("{}.png", image_id);
            let filepath = format!("{}/{}", self.output_dir, filename);

            std::fs::write(&filepath, image_bytes)
                .map_err(|e| QueueError::Other(e.to_string()))?;

            let record = ImageRecord {
                id: image_id,
                filename,
                width: self.params.width,
                height: self.params.height,
                prompt: Some(self.params.prompt.clone()),
                negative_prompt: Some(self.params.negative_prompt.clone()),
                checkpoint: Some(self.params.checkpoint.clone()),
                sampler: Some(self.params.sampler.clone()),
                scheduler: Some(self.params.scheduler.clone()),
                steps: Some(self.params.steps),
                cfg_scale: Some(self.params.cfg_scale),
                seed: Some(result.seed),
                created_at: chrono::Utc::now().to_rfc3339(),
                favorite: false,
                rating: None,
                caption: None,
                caption_edited: false,
            };

            storage::save_image_record(&db, &record)
                .map_err(|e| QueueError::Other(e.to_string()))?;
        }

        ctx.emit_progress(100, 100)?;

        Ok(JobResult::success_with_output(format!(
            "Generated {} image(s) with seed {}",
            result.images.len(),
            result.seed
        )))
    }
}
