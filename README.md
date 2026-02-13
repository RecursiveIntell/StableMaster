# StableMaster

A desktop application for AI image generation powered by [ComfyUI](https://github.com/comfyanonymous/ComfyUI), built with Tauri v2, React, and Rust.

## Features

- **Dual Generation Modes** — Standard mode for quick generation, Expert mode with full control over checkpoints, samplers, schedulers, CFG, and seeds
- **Image Gallery** — Browse, search, favorite, and rate generated images with full metadata retention
- **Generation Queue** — Queue multiple generation jobs with pause/resume/cancel support
- **AI Tagging & Captioning** — Batch or single-image tagging and captioning via Ollama vision models
- **Prompt Enhancement** — AI-powered prompt refinement using local LLMs through Ollama
- **Persistent Configuration** — Per-user settings for ComfyUI endpoint, Ollama endpoint, storage paths, and generation defaults

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally or on your network
- [Ollama](https://ollama.com/) (optional, for AI tagging/captioning/prompt enhancement)

## Getting Started

```bash
# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Shell    | Tauri v2                            |
| Frontend | React 18, TypeScript, Tailwind CSS  |
| Backend  | Rust, SQLite, reqwest               |
| AI       | ComfyUI (generation), Ollama (LLM)  |

## Project Structure

```
src/                        # React frontend
├── components/
│   ├── common/             # Button, Input, Modal, Select, StarRating, TagChip
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

MIT
