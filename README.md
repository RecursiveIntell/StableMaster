# StableMaster

<!-- last-verified: 2026-10-24; scope: queue behavior, checkout license metadata, and HTTP status of the ComfyUI, Node.js, Rust, and Ollama links -->

A desktop application for AI image generation powered by [ComfyUI](https://github.com/comfyanonymous/ComfyUI), built with Tauri v2, React, and Rust.

## Features

- **Dual Generation Modes** — Standard mode for quick generation, Expert mode with full control over checkpoints, samplers, schedulers, CFG, and seeds
- **Inpainting editor** — Canvas mask editing with a ComfyUI-backed inpaint command; requires a compatible running ComfyUI setup
- **Image Gallery** — Browse, search, favorite, and rate generated images with full metadata retention
- **Generation Queue** — Queue generation jobs, review their status, and cancel them; queue pause/resume are not implemented
- **AI Tagging & Captioning** — Batch or single-image tagging and captioning via Ollama vision models
- **Prompt Enhancement** — AI-powered prompt refinement using local LLMs through Ollama
- **Persistent Configuration** — Per-user settings for ComfyUI endpoint, Ollama endpoint, storage paths, and generation defaults

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally or on your network
- [Ollama](https://ollama.com/) (optional, for AI tagging/captioning/prompt enhancement)

## Build status and local dependency layout

This checkout is not self-contained. Its frontend depends on `../../Libraries/Tauri-React-Hooks`, and its Rust manifest references these directories under `../../../Libraries/`:

- `Tauri-Queue`
- `AI-Batch-Queue`
- `ComfyUI-RS`
- `Ollama-Vision-RS`
- `LLM-Pipeline`

Those relative paths expect this layout:

```text
workspace/
  Libraries/                 # compatible dependency checkout
  apps/
    StableMaster/
      package.json
      src-tauri/Cargo.toml
```

The current Libraries main branch does not provide these capitalized root paths. Cloning its latest branch beside this app is therefore insufficient. Establish a compatible dependency revision or update the source manifests in a separate code change before expecting a clean install/build. Historical copies under salvage directories are not verified replacement dependencies.

Once that dependency closure and the host's Tauri system prerequisites are available:

```bash
# From the StableMaster repository root
npm ci
npm run build
npm run tauri -- dev
# Package the native application
npm run tauri -- build
```

These are the configured commands, not a claim that a fresh standalone build currently passes. There is no `test` or `lint` npm script in this checkout. `npm run dev` runs the frontend only; it does not launch the Rust backend.

## First-run configuration

Start ComfyUI and select an installed checkpoint. Check every endpoint in Settings before using AI actions: ComfyUI defaults to loopback, but the checked-in Ollama default is a machine-specific LAN address. Replace it with your intended Ollama service and choose models actually installed there. Ollama actions transmit prompts or images to that configured service.

Generated images default to `~/Pictures/StableMaster`. Verify generation, queue cancellation, gallery persistence and inpainting with disposable images before relying on a workflow.

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Shell    | Tauri v2                            |
| Frontend | React 18, TypeScript, Tailwind CSS  |
| Backend  | Rust, SQLite, reqwest               |
| AI       | ComfyUI (generation), Ollama (LLM)  |

## Project Structure

```text
src/                        # React frontend
├── components/
│   ├── common/             # Button, Input, Modal, Select, StarRating, TagChip
│   ├── editor/             # ImageEditor canvas and masks
│   ├── gallery/            # GalleryGrid, ImageDetail
│   ├── generation/         # StandardMode, ExpertMode
│   ├── layout/             # Header, Sidebar, ModeToggle
│   ├── queue/              # QueuePanel
│   └── settings/           # SettingsPanel
├── types/                  # TypeScript interfaces
└── utils/                  # Constants, helpers

src-tauri/src/              # Rust backend
├── ai/                     # Prompt enhancement, batch tagging/captioning
├── commands/               # Tauri command handlers
├── config/                 # App configuration
├── database/               # SQLite schema, models
├── gallery/                # Image storage
├── generation/             # ComfyUI integration, workflows
└── queue/                  # Job queue system
```

## License

This checkout has no standalone `LICENSE` file; `package.json` and `src-tauri/Cargo.toml` do not declare a license. Confirm reuse and redistribution terms with the maintainer before copying or redistributing the software.
