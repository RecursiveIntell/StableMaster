use ai_batch_queue::{BatchItemHandler, ItemResult};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::ai::batch_tagging;
use crate::database::Database;
use crate::gallery::storage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiBatchItemData {
    pub image_id: String,
    pub image_path: String,
}

pub struct AiBatchHandler {
    pub app_handle: tauri::AppHandle,
    pub ollama_endpoint: String,
    pub vision_model: String,
}

impl BatchItemHandler<AiBatchItemData> for AiBatchHandler {
    async fn process(
        &self,
        data: &AiBatchItemData,
        _resource_key: &str,
        operation: &str,
    ) -> anyhow::Result<ItemResult> {
        let client = reqwest::Client::new();
        let image_path = std::path::PathBuf::from(&data.image_path);

        if !image_path.exists() {
            return Ok(ItemResult::failure(format!(
                "Image file not found: {}",
                data.image_path
            )));
        }

        let db = self.app_handle.state::<Database>();

        match operation {
            "tag" => {
                // Clear existing AI tags first
                storage::clear_ai_tags(&db, &data.image_id)?;

                match batch_tagging::tag_single_image(
                    &client,
                    &self.ollama_endpoint,
                    &self.vision_model,
                    &image_path,
                )
                .await
                {
                    Ok(tags) => {
                        storage::save_tags_with_source(
                            &db,
                            &data.image_id,
                            &tags,
                            "ai",
                            None,
                        )?;
                        Ok(ItemResult::success_with_output(tags.join(", ")))
                    }
                    Err(e) => Ok(ItemResult::failure(e.to_string())),
                }
            }
            "caption" => {
                match batch_tagging::caption_single_image(
                    &client,
                    &self.ollama_endpoint,
                    &self.vision_model,
                    &image_path,
                )
                .await
                {
                    Ok(caption) => {
                        storage::update_caption(&db, &data.image_id, &caption, false)?;
                        Ok(ItemResult::success_with_output(caption))
                    }
                    Err(e) => Ok(ItemResult::failure(e.to_string())),
                }
            }
            _ => Ok(ItemResult::failure(format!(
                "Unknown operation: {}",
                operation
            ))),
        }
    }
}
