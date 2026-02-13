export const SAMPLERS = [
  "euler",
  "euler_ancestral",
  "heun",
  "dpmpp_2m",
  "dpmpp_sde",
  "dpmpp_2m_sde",
  "dpmpp_3m_sde",
  "ddim",
  "uni_pc",
];

export const SCHEDULERS = [
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
];

export const QUALITY_PRESETS = {
  fast: { width: 512, height: 512, steps: 15 },
  balanced: { width: 768, height: 768, steps: 25 },
  best: { width: 1024, height: 1024, steps: 35 },
} as const;

export const STYLE_OPTIONS = ["realistic", "artistic", "anime"] as const;
export type Style = (typeof STYLE_OPTIONS)[number];
export type Quality = keyof typeof QUALITY_PRESETS;
