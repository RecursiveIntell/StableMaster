use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InpaintParams {
    pub prompt: String,
    pub negative_prompt: String,
    pub checkpoint: String,
    pub source_image_name: String,
    pub mask_image_name: String,
    pub steps: u32,
    pub cfg_scale: f64,
    pub denoise: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: Option<i64>,
}

pub fn build_inpaint_workflow(params: &InpaintParams) -> (serde_json::Value, i64) {
    let seed = params.seed.unwrap_or_else(|| rand::random::<i64>().abs());

    let workflow = serde_json::json!({
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": params.checkpoint
            }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["1", 1],
                "text": params.prompt
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["1", 1],
                "text": params.negative_prompt
            }
        },
        "4": {
            "class_type": "LoadImage",
            "inputs": {
                "image": params.source_image_name
            }
        },
        "5": {
            "class_type": "LoadImage",
            "inputs": {
                "image": params.mask_image_name
            }
        },
        "6": {
            "class_type": "VAEEncode",
            "inputs": {
                "pixels": ["4", 0],
                "vae": ["1", 2]
            }
        },
        "7": {
            "class_type": "SetLatentNoiseMask",
            "inputs": {
                "samples": ["6", 0],
                "mask": ["5", 1]
            }
        },
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["7", 0],
                "seed": seed,
                "steps": params.steps,
                "cfg": params.cfg_scale,
                "sampler_name": params.sampler,
                "scheduler": params.scheduler,
                "denoise": params.denoise
            }
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["8", 0],
                "vae": ["1", 2]
            }
        },
        "10": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["9", 0],
                "filename_prefix": "StableMaster_inpaint"
            }
        }
    });

    (workflow, seed)
}
