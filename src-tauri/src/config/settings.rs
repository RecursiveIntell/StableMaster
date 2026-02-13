use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub mode: UIMode,
    pub comfyui: ComfyUIConfig,
    pub ollama: OllamaConfig,
    pub storage: StorageConfig,
    pub generation: GenerationDefaults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UIMode {
    Standard,
    Expert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComfyUIConfig {
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaConfig {
    pub endpoint: String,
    pub enhancement_model: String,
    pub vision_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub image_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationDefaults {
    pub checkpoint: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f64,
    pub sampler: String,
    pub scheduler: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        Self {
            mode: UIMode::Standard,
            comfyui: ComfyUIConfig {
                endpoint: "http://127.0.0.1:8188".to_string(),
            },
            ollama: OllamaConfig {
                endpoint: "http://192.168.50.69:11434".to_string(),
                enhancement_model: "qwen2.5:14b".to_string(),
                vision_model: "llava:13b".to_string(),
            },
            storage: StorageConfig {
                image_directory: format!("{}/Pictures/StableMaster", home),
            },
            generation: GenerationDefaults {
                checkpoint: String::new(),
                negative_prompt: "blurry, low quality, watermark, text".to_string(),
                width: 512,
                height: 768,
                steps: 25,
                cfg_scale: 7.5,
                sampler: "dpmpp_2m".to_string(),
                scheduler: "karras".to_string(),
            },
        }
    }
}
