export type UIMode = "standard" | "expert";
export type View = "generate" | "gallery" | "queue" | "settings";

export interface AppConfig {
  [key: string]: unknown;
  mode: UIMode;
  comfyui: ComfyUIConfig;
  ollama: OllamaConfig;
  storage: StorageConfig;
  generation: GenerationDefaults;
}

export interface ComfyUIConfig {
  endpoint: string;
}

export interface OllamaConfig {
  endpoint: string;
  enhancement_model: string;
  vision_model: string;
}

export interface StorageConfig {
  image_directory: string;
}

export interface GenerationDefaults {
  checkpoint: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler: string;
  scheduler: string;
}

export interface GenerationRequest {
  prompt: string;
  negative_prompt?: string;
  checkpoint?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  sampler?: string;
  scheduler?: string;
  seed?: number;
}

export interface GenerationResponse {
  image_id: string;
  seed: number;
}

export interface ImageRecord {
  id: string;
  filename: string;
  width: number;
  height: number;
  prompt: string | null;
  negative_prompt: string | null;
  checkpoint: string | null;
  sampler: string | null;
  scheduler: string | null;
  steps: number | null;
  cfg_scale: number | null;
  seed: number | null;
  created_at: string;
  favorite: boolean;
  rating: number | null;
  caption: string | null;
  caption_edited: boolean;
  parent_image_id: string | null;
  generation_type: string;
}

export interface InpaintResponse {
  image_id: string;
  seed: number;
  filename: string;
}

export interface ImageTag {
  id: number;
  image_id: string;
  tag: string;
  source: string;
  confidence: number | null;
}

export interface QueueJobInfo {
  id: string;
  status: string;
}

export interface QueueStatusResponse {
  jobs: QueueJobInfo[];
}

export interface BatchItemProgress {
  jobId: string;
  itemId: string;
  status: string;
  completed: number;
  total: number;
  error: string | null;
  durationMs: number | null;
  etaRemainingMs: number | null;
}

export interface BatchJobStarted {
  jobId: string;
  operation: string;
  resourceKey: string;
  totalItems: number;
}

export interface BatchCompletionSummary {
  jobId: string;
  operation: string;
  resourceKey: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  avgDurationMs: number;
}
