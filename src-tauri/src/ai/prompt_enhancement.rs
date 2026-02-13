use anyhow::Result;
use llm_pipeline::{Pipeline, PipelineContext, PipelineInput, Stage};

pub async fn enhance_prompt(
    client: &reqwest::Client,
    endpoint: &str,
    model: &str,
    user_prompt: &str,
    style: &str,
    detail_level: &str,
) -> Result<String> {
    let context = PipelineContext::new()
        .insert("style", style)
        .insert("detail_level", detail_level);

    let pipeline = Pipeline::<serde_json::Value>::builder()
        .add_stage(
            Stage::new(
                "enhance",
                "You are an expert at writing Stable Diffusion prompts.\n\n\
                 User's idea: {input}\n\
                 Style preference: {style}\n\
                 Detail level: {detail_level}\n\n\
                 Transform this into a detailed, effective Stable Diffusion prompt.\n\
                 Include:\n\
                 - Subject description with visual details\n\
                 - Lighting and atmosphere\n\
                 - Art style qualifiers\n\
                 - Quality tags (8k, detailed, etc.)\n\n\
                 Keep it under 100 words. Return ONLY a JSON object with a single key \
                 \"prompt\" containing the enhanced prompt string. No explanation.",
            )
            .with_model(model)
            .with_json_mode(true)
            .with_temperature(0.7),
        )
        .with_context(context)
        .build()
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let input = PipelineInput::new(user_prompt);

    let result = pipeline
        .execute(client, endpoint, input)
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    // Extract the prompt from the JSON response
    let enhanced = result
        .final_output
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or(user_prompt)
        .trim()
        .to_string();

    Ok(enhanced)
}
