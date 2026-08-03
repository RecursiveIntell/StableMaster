# CLAUDE.md — StableMaster Inpainting Editor Implementation

You are implementing a canvas-based inpainting editor for StableMaster, a Tauri v2 + React + Rust desktop application for AI image generation. This document contains everything you need. Read the ENTIRE document before writing any code.

## PROJECT CONTEXT

StableMaster is ~4100 lines of code (2300 TypeScript, 1800 Rust). It generates images via a local ComfyUI server, stores them in a SQLite-backed gallery, and supports AI captioning/tagging via Ollama. The owner has extensive image editor experience — he built a separate 11,000-line Python image editor (Aphelion) with 21 tools, 49 effects, and command-pattern undo/redo. The canvas UI is NOT the hard part. The ComfyUI integration is.

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust (Tauri v2)
- **Database**: SQLite via `rusqlite` (bundled)
- **Image Gen**: ComfyUI server at configurable endpoint (default `http://127.0.0.1:8188`)
- **AI Services**: Ollama for captioning/tagging
- **Key Crates**: `tauri 2`, `serde`, `tokio`, `reqwest` (json + stream), `image 0.25`, `uuid`, `chrono`, `base64`, `anyhow`, `thiserror`
- **Local Libraries**: `comfyui-rs`, `ollama-vision`, `llm-pipeline`, `tauri-queue`, `ai-batch-queue` (all path dependencies in `../../../Libraries/`)

### File Structure
```
src/
├── App.tsx
├── main.tsx
├── components/
│   ├── common/          # Button, Input, Modal, Select, StarRating, TagChip, BatchStatusBar
│   ├── gallery/         # GalleryGrid.tsx, ImageDetail.tsx
│   ├── generation/      # StandardMode.tsx, ExpertMode.tsx
│   ├── layout/          # Header.tsx, Sidebar.tsx, ModeToggle.tsx
│   ├── queue/           # QueuePanel.tsx
│   └── settings/        # SettingsPanel.tsx
├── hooks/
├── types/               # index.ts
├── utils/               # constants.ts, helpers.ts
└── styles/

src-tauri/src/
├── main.rs              # 114 lines — Tauri builder + command registration
├── lib.rs               # 7 lines
├── commands/
│   ├── mod.rs
│   ├── generation.rs    # 218 lines — generate_image, get_checkpoints, get_samplers, etc.
│   ├── gallery.rs       # 97 lines — get_images, get_image_detail, search, toggle_favorite, etc.
│   ├── ai.rs            # 259 lines — batch tagging, caption, prompt enhancement
│   ├── config.rs        # 45 lines
│   └── queue.rs         # 43 lines
├── generation/
│   ├── mod.rs
│   ├── comfyui.rs       # 124 lines — THE REFERENCE FILE (see below)
│   └── workflows.rs
├── gallery/
│   ├── mod.rs
│   └── storage.rs       # 296 lines — all gallery DB operations
├── database/
│   ├── mod.rs           # 32 lines — Database struct with Mutex<Connection>
│   ├── schema.rs        # 108 lines — CREATE TABLE statements
│   └── models.rs        # 31 lines — ImageRecord, ImageTag structs
├── ai/
│   ├── mod.rs
│   ├── batch_handler.rs
│   ├── batch_tagging.rs
│   └── prompt_enhancement.rs
├── config/
│   ├── mod.rs
│   └── settings.rs      # 76 lines
└── queue/
    ├── mod.rs
    └── jobs.rs           # 76 lines
```

---

## CRITICAL: EXISTING CODE PATTERNS TO FOLLOW

You MUST match these existing patterns exactly. Do not invent your own conventions.

### Pattern 1: The ComfyUI Client (generation/comfyui.rs)

This is the most important file. Your inpaint code must follow the same pattern:

```rust
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
```

**Key observations you MUST replicate:**
- Error conversion pattern: `.map_err(|e| anyhow::anyhow!("{}", e))`
- Client ID: `"stablemaster"`
- Health check before any operation
- WebSocket-based completion waiting (not polling)
- `GenerationOutcome` match with three arms
- Image download via `client.image(&img_ref)`

### Pattern 2: Tauri Command Style (commands/generation.rs)

```rust
#[tauri::command]
pub async fn generate_image(
    state: tauri::State<'_, crate::AppState>,
    params: GenerationParams,
) -> Result<GenerationResult, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    let endpoint = &settings.comfyui_endpoint;

    generate_txt2img(endpoint, &params)
        .await
        .map_err(|e| e.to_string())
}
```

**Pattern rules:**
- Commands return `Result<T, String>` (Tauri requires `String` errors)
- State accessed via `tauri::State<'_, crate::AppState>`
- Settings accessed via `state.settings.lock()`
- ComfyUI endpoint comes from settings, not hardcoded
- Internal functions use `anyhow::Result`, commands convert to `String`

### Pattern 3: Database Operations (gallery/storage.rs)

```rust
pub fn save_image_record(db: &Database, record: &ImageRecord) -> Result<()> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| anyhow::anyhow!("DB lock: {}", e))?;
    conn.execute(
        "INSERT INTO images (id, filename, width, height, prompt, negative_prompt, \
         checkpoint, sampler, scheduler, steps, cfg_scale, seed, favorite, rating, caption, caption_edited) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            record.id, record.filename, record.width, record.height,
            record.prompt, record.negative_prompt, record.checkpoint,
            record.sampler, record.scheduler, record.steps, record.cfg_scale,
            record.seed, record.favorite, record.rating, record.caption, record.caption_edited,
        ],
    )?;
    Ok(())
}
```

**Pattern rules:**
- `db.conn.lock().map_err(|e| anyhow::anyhow!("DB lock: {}", e))?`
- Parameterized queries with `params![]` macro
- SQL strings use `\` line continuation
- Functions take `&Database` reference, not owned

### Pattern 4: ImageRecord Struct

```rust
pub struct ImageRecord {
    pub id: String,           // UUID v4
    pub filename: String,     // just the filename, not full path
    pub width: u32,
    pub height: u32,
    pub prompt: String,
    pub negative_prompt: String,
    pub checkpoint: String,
    pub sampler: String,
    pub scheduler: String,
    pub steps: u32,
    pub cfg_scale: f64,
    pub seed: i64,
    pub created_at: String,   // ISO 8601, set by DB default
    pub favorite: bool,
    pub rating: Option<u32>,
    pub caption: Option<String>,
    pub caption_edited: bool,
}
```

### Pattern 5: Images Table Schema

```sql
CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    negative_prompt TEXT NOT NULL DEFAULT '',
    checkpoint TEXT NOT NULL DEFAULT '',
    sampler TEXT NOT NULL DEFAULT '',
    scheduler TEXT NOT NULL DEFAULT '',
    steps INTEGER NOT NULL DEFAULT 20,
    cfg_scale REAL NOT NULL DEFAULT 7.0,
    seed INTEGER NOT NULL DEFAULT -1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    favorite INTEGER NOT NULL DEFAULT 0,
    rating INTEGER,
    caption TEXT,
    caption_edited INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0
);
```

---

## THE TASK: ADD INPAINTING

### What You Are Building

A canvas-based mask editor that lets the user:
1. Open any gallery image in a full-screen editor modal
2. Paint a mask over the areas they want to regenerate
3. Enter a text prompt describing what should fill those areas
4. Send image + mask + prompt to ComfyUI for inpainting
5. Get the result back in the gallery, linked to the parent image

### Implementation Order (MANDATORY — do not deviate)

You MUST implement in this exact order. The backend is the unknown; the frontend is the easy part. Discovering ComfyUI integration issues on day 1 is critical.

---

## STEP 1: Extend `comfyui-rs` Library

**Location**: `../../../Libraries/ComfyUI-RS/` (path dependency in Cargo.toml)

Add an `upload_image` method to `ComfyClient`. ComfyUI's `/upload/image` endpoint accepts `multipart/form-data`:

```
POST /upload/image
Content-Type: multipart/form-data

Fields:
  image: (binary file data, with filename)
  type: "input"          (optional, default "input")
  overwrite: "true"      (optional)
  subfolder: ""          (optional)

Response (200):
  {"name": "uploaded_filename.png", "subfolder": "", "type": "input"}
```

**Implementation sketch:**
```rust
pub async fn upload_image(
    &self,
    image_bytes: &[u8],
    filename: &str,
    overwrite: bool,
) -> Result<String, ComfyError> {
    let form = reqwest::multipart::Form::new()
        .part("image", reqwest::multipart::Part::bytes(image_bytes.to_vec())
            .file_name(filename.to_string())
            .mime_str("image/png")?)
        .text("type", "input")
        .text("overwrite", if overwrite { "true" } else { "false" });

    let resp = self.client
        .post(format!("{}/upload/image", self.base_url))
        .multipart(form)
        .send()
        .await?;

    let json: serde_json::Value = resp.json().await?;
    Ok(json["name"].as_str()
        .ok_or(ComfyError::InvalidResponse("missing name field".into()))?
        .to_string())
}
```

**IMPORTANT**: The `reqwest` dependency in `comfyui-rs` MUST have the `multipart` feature enabled. Check and add it:
```toml
reqwest = { version = "0.12", features = ["json", "stream", "multipart"] }
```

**Testing**: After implementing, verify with:
```rust
#[tokio::test]
async fn test_upload() {
    let client = ComfyClient::new("http://127.0.0.1:8188");
    let bytes = std::fs::read("test_image.png").unwrap();
    let name = client.upload_image(&bytes, "test_upload.png", true).await.unwrap();
    assert!(!name.is_empty());
}
```

Also add a `queue_prompt_raw` method if one doesn't exist — the inpaint workflow will be built as raw `serde_json::Value`, not via the typed `Txt2ImgRequest` builder:

```rust
pub async fn queue_prompt_raw(&self, workflow: &serde_json::Value) -> Result<String, ComfyError> {
    // Same as queue_prompt but accepts raw JSON
}
```

If `queue_prompt` already accepts `serde_json::Value`, you don't need this.

### STEP 1 CHECKPOINT
- [ ] `upload_image` method exists on `ComfyClient`
- [ ] Test upload succeeds, file appears in ComfyUI's `input/` directory
- [ ] Can queue a raw `serde_json::Value` workflow via the client

---

## STEP 2: Build the Inpaint Workflow Constructor

**New file**: `src-tauri/src/generation/inpaint.rs`

This builds the ComfyUI workflow JSON for inpainting. Use the **standard model + SetLatentNoiseMask** approach (works with any checkpoint, allows variable denoise).

### The Exact Node Graph

```
LoadCheckpoint (node "1")
  → MODEL, CLIP, VAE

CLIPTextEncode positive (node "2")
  inputs: clip ← ["1", 1], text ← prompt
  → CONDITIONING

CLIPTextEncode negative (node "3")
  inputs: clip ← ["1", 1], text ← negative_prompt
  → CONDITIONING

LoadImage source (node "4")
  inputs: image ← source_filename
  → IMAGE (output 0), MASK (output 1)

LoadImage mask (node "5")
  inputs: image ← mask_filename
  → IMAGE (output 0), MASK (output 1)

VAEEncode (node "6")
  inputs: pixels ← ["4", 0], vae ← ["1", 2]
  → LATENT

SetLatentNoiseMask (node "7")
  inputs: samples ← ["6", 0], mask ← ["5", 1]
  → LATENT

KSampler (node "8")
  inputs: model ← ["1", 0], positive ← ["2", 0], negative ← ["3", 0],
          latent_image ← ["7", 0]
  widgets: seed, steps, cfg, sampler_name, scheduler, denoise
  → LATENT

VAEDecode (node "9")
  inputs: samples ← ["8", 0], vae ← ["1", 2]
  → IMAGE

SaveImage (node "10")
  inputs: images ← ["9", 0]
  widgets: filename_prefix ← "StableMaster_inpaint"
```

### The Exact JSON

```rust
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
```

### CRITICAL: Mask Format

The mask uploaded to ComfyUI via the `LoadImage` node (node "5") and connected via its MASK output (slot 1) must be:

- **WHITE (255, 255, 255) = AREAS TO INPAINT** (noise will be applied here)
- **BLACK (0, 0, 0) = AREAS TO PRESERVE** (will not be modified)
- **RGB format** — NOT grayscale, NOT alpha-channel based
- **Same dimensions as the source image** — ComfyUI will error if they differ
- **PNG format** — other formats may lose precision

⚠️ THIS IS THE #1 SOURCE OF BUGS. If the mask is inverted (black=inpaint, white=keep), the entire image will be regenerated EXCEPT the masked area. If the mask uses alpha transparency instead of RGB white/black, ComfyUI may interpret it incorrectly.

### Step 2 Params Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InpaintParams {
    pub prompt: String,
    pub negative_prompt: String,
    pub checkpoint: String,
    pub source_image_name: String,  // filename in ComfyUI's input dir (after upload)
    pub mask_image_name: String,    // filename in ComfyUI's input dir (after upload)
    pub steps: u32,
    pub cfg_scale: f64,
    pub denoise: f64,               // 0.0-1.0, CRITICAL: default 0.65
    pub sampler: String,
    pub scheduler: String,
    pub seed: Option<i64>,
}
```

### STEP 2 CHECKPOINT
- [ ] `build_inpaint_workflow()` returns valid JSON
- [ ] Print the JSON, paste into ComfyUI "Load" dialog — it executes successfully with a manually-created test mask
- [ ] Verify: white areas in mask get regenerated, black areas preserved

---

## STEP 3: Rust Inpaint Command

**New file**: `src-tauri/src/commands/inpaint.rs`

```rust
use crate::generation::inpaint::{build_inpaint_workflow, InpaintParams};
use comfyui_rs::{ComfyClient, GenerationOutcome};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InpaintRequest {
    pub image_path: String,         // full filesystem path to source image
    pub mask_png_bytes: Vec<u8>,    // raw PNG bytes of the mask from the canvas
    pub prompt: String,
    pub negative_prompt: String,
    pub denoise: f64,
    pub steps: u32,
    pub cfg_scale: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: Option<i64>,
    pub parent_image_id: String,    // gallery ID of the source image
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InpaintResponse {
    pub image_id: String,
    pub seed: i64,
    pub filename: String,
}

#[tauri::command]
pub async fn inpaint_image(
    state: tauri::State<'_, crate::AppState>,
    request: InpaintRequest,
) -> Result<InpaintResponse, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    let endpoint = settings.comfyui_endpoint.clone();
    let output_dir = settings.output_directory.clone();
    let checkpoint = settings.default_checkpoint.clone();
    drop(settings);

    inpaint_impl(&endpoint, &output_dir, &checkpoint, &request, &state.db)
        .await
        .map_err(|e| e.to_string())
}
```

**The `inpaint_impl` function flow:**

```
1. Read source image from request.image_path → Vec<u8>
2. Generate unique filenames:
   - source: format!("sm_inpaint_src_{}.png", Uuid::new_v4())
   - mask:   format!("sm_inpaint_mask_{}.png", Uuid::new_v4())
3. Create ComfyClient, check health
4. Upload source image → get ComfyUI filename
5. Upload mask PNG bytes → get ComfyUI filename
6. Build InpaintParams using the ComfyUI filenames
7. build_inpaint_workflow() → (workflow_json, seed)
8. client.queue_prompt(&workflow_json) → prompt_id
9. client.wait_for_completion_ws(&prompt_id, 300s, progress_callback)
10. Match GenerationOutcome::Completed → download image bytes
11. Save image bytes to output_dir with new UUID filename
12. Create ImageRecord with parent_image_id and generation_type="inpaint"
13. save_image_record() to database
14. Return InpaintResponse
```

### Register the Command

In `main.rs`, add `commands::inpaint::inpaint_image` to the `.invoke_handler(tauri::generate_handler![...])` list.

In `commands/mod.rs`, add `pub mod inpaint;`.

### STEP 3 CHECKPOINT
- [ ] Command compiles
- [ ] Can be called from frontend with test data
- [ ] Full round-trip works: upload → queue → wait → download → save to gallery

---

## STEP 4: Database Schema Extension

Add `parent_image_id` and `generation_type` columns. Use a migration pattern that checks if the column exists first (the app may run against an existing database):

```rust
// In schema.rs, add to your init function:
conn.execute_batch("
    ALTER TABLE images ADD COLUMN parent_image_id TEXT REFERENCES images(id);
    ALTER TABLE images ADD COLUMN generation_type TEXT NOT NULL DEFAULT 'txt2img';
").ok(); // .ok() because ALTER TABLE fails silently if column already exists
```

Update `ImageRecord` struct:
```rust
pub parent_image_id: Option<String>,
pub generation_type: String,  // "txt2img", "inpaint"
```

Update `save_image_record()` INSERT to include the new columns.

Update `row_to_image()` to read the new columns. **CRITICAL**: Update `IMAGE_SELECT_COLS` constant AND the column index numbers in `row_to_image`. Off-by-one here causes runtime panics.

### STEP 4 CHECKPOINT
- [ ] App starts without error on fresh DB
- [ ] App starts without error on existing DB (migration is idempotent)
- [ ] New columns appear in images table

---

## STEP 5: Frontend — Editor Component

**New dependencies** (add to package.json):
```json
"konva": "^9.3.0",
"react-konva": "^19.2.0",
"use-image": "^1.1.0"
```

### File: `src/components/editor/ImageEditor.tsx`

This is a full-screen modal opened from `ImageDetail.tsx`.

**Props:**
```typescript
interface ImageEditorProps {
  imageRecord: ImageRecord;    // the gallery image to edit
  imageSrc: string;            // data URL or file path for display
  onClose: () => void;
  onInpaintComplete: (newImageId: string) => void;
}
```

**State:**
```typescript
interface MaskLine {
  tool: 'brush' | 'eraser';
  points: number[];       // [x1, y1, x2, y2, x3, y3, ...]
  brushSize: number;
}

const [lines, setLines] = useState<MaskLine[]>([]);
const [currentTool, setCurrentTool] = useState<'brush' | 'eraser'>('brush');
const [brushSize, setBrushSize] = useState(30);
const [isDrawing, setIsDrawing] = useState(false);
const [prompt, setPrompt] = useState('');
const [negativePrompt, setNegativePrompt] = useState('');
const [denoise, setDenoise] = useState(0.65);
const [isInpainting, setIsInpainting] = useState(false);
const [maskOpacity, setMaskOpacity] = useState(0.5);
```

### Canvas Architecture

```tsx
<Stage
  width={canvasWidth}
  height={canvasHeight}
  onMouseDown={handleMouseDown}
  onMouseMove={handleMouseMove}
  onMouseUp={handleMouseUp}
  onTouchStart={handleMouseDown}
  onTouchMove={handleMouseMove}
  onTouchEnd={handleMouseUp}
>
  {/* Layer 1: Source image (non-interactive) */}
  <Layer listening={false}>
    <Image image={loadedImage} />
  </Layer>

  {/* Layer 2: Mask visualization (red overlay) */}
  <Layer opacity={maskOpacity} listening={false}>
    {lines.map((line, i) => (
      <Line
        key={i}
        points={line.points}
        stroke={line.tool === 'brush' ? 'rgba(255, 50, 50, 0.6)' : 'transparent'}
        strokeWidth={line.brushSize}
        lineCap="round"
        lineJoin="round"
        globalCompositeOperation={
          line.tool === 'eraser' ? 'destination-out' : 'source-over'
        }
        listening={false}
      />
    ))}
  </Layer>
</Stage>
```

### Drawing Handlers

```typescript
const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
  setIsDrawing(true);
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;
  setLines([...lines, {
    tool: currentTool,
    points: [pos.x, pos.y],
    brushSize,
  }]);
};

const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
  if (!isDrawing) return;
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;
  const lastLine = lines[lines.length - 1];
  lastLine.points = [...lastLine.points, pos.x, pos.y];
  setLines([...lines.slice(0, -1), lastLine]);
};

const handleMouseUp = () => {
  setIsDrawing(false);
};
```

### CRITICAL: Mask Export Function

This is where most implementations fail. The mask must be:
1. **Black background** (areas to KEEP)
2. **White brush strokes** (areas to INPAINT)
3. **Same dimensions as source image**
4. **RGB PNG format** (not RGBA, not grayscale)

```typescript
function exportMaskAsBytes(
  lines: MaskLine[],
  width: number,
  height: number
): Uint8Array {
  // Create offscreen canvas at EXACT source image dimensions
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Fill with BLACK (= keep these areas)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  // Draw mask strokes in WHITE (= inpaint these areas)
  // Also apply eraser strokes
  for (const line of lines) {
    ctx.lineWidth = line.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (line.tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'white';
    } else {
      // Eraser: paint black to un-mask
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'black';
    }

    ctx.beginPath();
    if (line.points.length >= 2) {
      ctx.moveTo(line.points[0], line.points[1]);
      for (let i = 2; i < line.points.length; i += 2) {
        ctx.lineTo(line.points[i], line.points[i + 1]);
      }
    }
    ctx.stroke();
  }

  // Export as PNG data URL, then convert to Uint8Array
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
```

⚠️ **DO NOT** use `canvas.toBlob()` — it's async and adds unnecessary complexity.
⚠️ **DO NOT** use the Konva layer's `toDataURL()` for the mask — the visual mask is red/semi-transparent for UX, but ComfyUI needs white-on-black.
⚠️ **DO NOT** use alpha channel for mask data — ComfyUI ignores alpha on LoadImage.

### Inpaint Button Handler

```typescript
const handleInpaint = async () => {
  if (lines.length === 0) {
    alert('Please paint a mask first');
    return;
  }

  setIsInpainting(true);
  try {
    const maskBytes = exportMaskAsBytes(
      lines,
      imageRecord.width,
      imageRecord.height
    );

    const response = await invoke<InpaintResponse>('inpaint_image', {
      request: {
        image_path: imageRecord.filename,  // or full path depending on your storage
        mask_png_bytes: Array.from(maskBytes),
        prompt,
        negative_prompt: negativePrompt,
        denoise,
        steps: 20,        // pull from settings
        cfg_scale: 7.0,   // pull from settings
        sampler: 'euler',
        scheduler: 'normal',
        seed: null,
        parent_image_id: imageRecord.id,
      }
    });

    onInpaintComplete(response.image_id);
  } catch (err) {
    console.error('Inpaint failed:', err);
    alert(`Inpainting failed: ${err}`);
  } finally {
    setIsInpainting(false);
  }
};
```

### Opening the Editor from ImageDetail

In `ImageDetail.tsx`, add a button:
```tsx
<button onClick={() => setShowEditor(true)}>
  Edit / Inpaint
</button>

{showEditor && (
  <ImageEditor
    imageRecord={image}
    imageSrc={imageSrc}
    onClose={() => setShowEditor(false)}
    onInpaintComplete={(newId) => {
      setShowEditor(false);
      // Navigate to the new image or refresh gallery
    }}
  />
)}
```

### STEP 5 CHECKPOINT
- [ ] Editor opens from gallery image
- [ ] Can paint mask strokes (red overlay visible)
- [ ] Can erase mask strokes
- [ ] Brush size slider works
- [ ] "Inpaint" button sends request to backend
- [ ] Result appears in gallery
- [ ] Result is linked to parent image

---

## THINGS THAT WILL SILENTLY BREAK IF YOU GET THEM WRONG

1. **Mask color inversion**: White = inpaint, Black = keep. Not the other way around. Not alpha-based.

2. **Mask dimensions**: Must match source image exactly. If the canvas is scaled for display, the mask export must use the ORIGINAL image dimensions, not the display dimensions.

3. **`reqwest` multipart feature**: If `comfyui-rs` Cargo.toml doesn't have `features = ["multipart"]` on reqwest, upload will fail to compile. This is the most common dependency error.

4. **Node connection format**: ComfyUI expects `["node_id_string", output_slot_integer]` for connections. The node IDs are STRINGS (e.g., `"1"`, `"4"`), the output slots are INTEGERS (e.g., `0`, `1`). `serde_json::json!` will serialize `["4", 0]` correctly but `["4", "0"]` will fail silently.

5. **LoadImage mask output slot**: The MASK output on LoadImage is slot `1`, not slot `0`. Slot 0 is the IMAGE. If you connect `["5", 0]` instead of `["5", 1]` to SetLatentNoiseMask, you'll get the mask as a colored image and the inpainting will be nonsensical.

6. **Denoise value**: For SetLatentNoiseMask approach (standard model), denoise between 0.4–0.8 works. Denoise = 1.0 will completely ignore the source image content in the masked area. Default to 0.65.

7. **Tauri Vec<u8> serialization**: When passing `Vec<u8>` from JS to Rust via `invoke`, pass it as `Array.from(uint8Array)`, NOT as the raw `Uint8Array`. Tauri's JSON serialization handles arrays of numbers but may choke on typed arrays.

8. **SQLite column addition**: `ALTER TABLE ADD COLUMN` fails if the column already exists. Wrap in `.ok()` or use `IF NOT EXISTS` pattern for idempotent migrations.

9. **`IMAGE_SELECT_COLS` constant**: When you add new columns to the images table, you MUST update this constant AND the index numbers in `row_to_image()`. Missing this causes either a rusqlite column-not-found error or wrong data in the wrong fields.

10. **Konva `listening` prop**: Set `listening={false}` on ALL Line shapes in the mask layer. Without this, Konva does hit detection on every shape for every mouse event, and performance degrades rapidly after ~50 strokes.

---

## SCOPE BOUNDARIES

### DO implement:
- Single brush tool for mask painting (white)
- Single eraser tool for mask removal (black)
- Brush size slider (5–100px range)
- Clear mask button
- Mask opacity slider
- Prompt and negative prompt text inputs
- Denoise slider (0.1–1.0)
- Inpaint button that triggers the full pipeline
- Gallery linkage with parent_image_id
- Undo (remove last stroke — `lines.slice(0, -1)`)

### DO NOT implement (yet):
- Zoom/pan
- Multiple layers
- Crop/resize
- Color adjustments
- Selection tools
- Dedicated inpainting model support (VAE Encode for Inpainting workflow)
- Outpainting
- Progress bar (the existing progress pattern can be added later)
- Keyboard shortcuts beyond Ctrl+Z for undo

### DO NOT:
- Modify any existing file unnecessarily
- Add dependencies not listed above
- Create Python scripts
- Use `electron` or `wasm` approaches
- Restructure the existing module hierarchy
- Change the ComfyUI client ID from "stablemaster"
- Add complex state management (Redux, Zustand) — React useState is sufficient
- Build a separate "editor" page/route — this is a modal over the existing gallery

---

## TESTING STRATEGY

### Manual Test Sequence (follow in order):

1. **Upload test**: Call `client.upload_image()` with a test PNG. Verify file appears in ComfyUI `input/` dir.

2. **Workflow test**: Build workflow JSON, paste into ComfyUI web UI "Load" button. Should execute with no missing nodes.

3. **Mask format test**: Create a 512×512 PNG that is all black with a white circle in the center. Upload both a source image and this mask. Queue the inpaint workflow. The circle area should be regenerated, the rest preserved.

4. **Full pipeline test**: From the Rust command, use a hardcoded test image path and mask bytes. Verify the entire upload → queue → wait → download → save flow works.

5. **Frontend test**: Open editor, paint a mask, enter "a red rose" as the prompt, click Inpaint. Verify the masked area gets a rose-like image and the rest is unchanged.

6. **Edge cases**:
   - Empty mask (no strokes) → should show user-facing error, not crash
   - Very large brush size on small image → should still work
   - ComfyUI not running → should show "not responding" error
   - Empty prompt → should work (defaults to general inpainting)

---

## QUALITY CHECKLIST (verify before declaring done)

- [ ] All new Rust code compiles with `cargo build` (no warnings)
- [ ] All new TypeScript compiles with `npm run build` (no errors)
- [ ] Editor modal opens and closes cleanly
- [ ] Mask painting is smooth (no lag on mouse move)
- [ ] Mask export produces correct white-on-black PNG at source image dimensions
- [ ] ComfyUI receives image and mask files
- [ ] Inpaint workflow executes successfully
- [ ] Result image appears in gallery
- [ ] Result image has correct parent_image_id
- [ ] Existing txt2img generation still works (no regressions)
- [ ] App starts cleanly on fresh database
- [ ] App starts cleanly on existing database (migration is safe)
- [ ] Undo removes last stroke
- [ ] Clear removes all strokes
- [ ] Eraser tool removes previously painted mask areas
