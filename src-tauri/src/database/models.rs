use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub id: String,
    pub filename: String,
    pub width: u32,
    pub height: u32,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub checkpoint: Option<String>,
    pub sampler: Option<String>,
    pub scheduler: Option<String>,
    pub steps: Option<u32>,
    pub cfg_scale: Option<f64>,
    pub seed: Option<i64>,
    pub created_at: String,
    pub favorite: bool,
    pub rating: Option<u32>,
    pub caption: Option<String>,
    pub caption_edited: bool,
    pub parent_image_id: Option<String>,
    pub generation_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageTag {
    pub id: i64,
    pub image_id: String,
    pub tag: String,
    pub source: String,
    pub confidence: Option<f64>,
}
