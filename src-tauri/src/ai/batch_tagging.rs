use anyhow::Result;
use ollama_vision::{OllamaVisionConfig, TagOptions};
use std::path::Path;

pub async fn tag_single_image(
    client: &reqwest::Client,
    endpoint: &str,
    model: &str,
    image_path: &Path,
) -> Result<Vec<String>> {
    let config = OllamaVisionConfig::with_model(model);
    // Override endpoint if different from default
    let config = OllamaVisionConfig {
        endpoint: endpoint.to_string(),
        ..config
    };

    let tags = ollama_vision::tag_image(client, &config, image_path, &TagOptions::default())
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    Ok(tags)
}

pub async fn caption_single_image(
    client: &reqwest::Client,
    endpoint: &str,
    model: &str,
    image_path: &Path,
) -> Result<String> {
    use ollama_vision::CaptionOptions;

    let config = OllamaVisionConfig::with_model(model);
    let config = OllamaVisionConfig {
        endpoint: endpoint.to_string(),
        ..config
    };

    let caption =
        ollama_vision::caption_image(client, &config, image_path, &CaptionOptions::default())
            .await
            .map_err(|e| anyhow::anyhow!("{}", e))?;

    Ok(caption)
}
