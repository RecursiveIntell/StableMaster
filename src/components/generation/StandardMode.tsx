import { useState, useEffect } from "react";
import { useTauriMutation, useTauriQuery } from "@tauri-hooks/core";
import { Sparkles, Loader2 } from "lucide-react";
import Button from "../common/Button";
import Select from "../common/Select";
import type { GenerationResponse } from "../../types";
import { QUALITY_PRESETS, STYLE_OPTIONS } from "../../utils/constants";
import type { Style, Quality } from "../../utils/constants";

export default function StandardMode() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<Style>("artistic");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [checkpoint, setCheckpoint] = useState("");
  const [batchCount, setBatchCount] = useState(1);
  const [batchProgress, setBatchProgress] = useState("");

  // Fetch available checkpoints from ComfyUI
  const { data: checkpoints } = useTauriQuery<string[]>("get_checkpoints");

  useEffect(() => {
    if (checkpoints && checkpoints.length > 0 && !checkpoint) {
      setCheckpoint(checkpoints[0]);
    }
  }, [checkpoints, checkpoint]);

  const { mutate: enhance, loading: enhancing } = useTauriMutation<
    [string, string, string],
    string
  >("enhance_prompt", (p, s, d) => ({
    prompt: p,
    style: s,
    detailLevel: d,
  }));

  const { mutate: generate, loading: generating } = useTauriMutation<
    [{ prompt: string; checkpoint?: string; width: number; height: number; steps: number }],
    GenerationResponse
  >("generate_image", (req) => ({ req }));

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    const detailLevel =
      quality === "best" ? "high" : quality === "balanced" ? "medium" : "low";
    try {
      const enhanced = await enhance(prompt.trim(), style, detailLevel);
      if (enhanced) setPrompt(enhanced);
    } catch (err) {
      alert(
        `Failed to enhance prompt.\n\n${err}\n\nCheck your Ollama endpoint in Settings.`
      );
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const settings = QUALITY_PRESETS[quality];
    const req = {
      prompt: prompt.trim(),
      checkpoint: checkpoint || undefined,
      ...settings,
    };

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < batchCount; i++) {
      if (batchCount > 1) setBatchProgress(`${i + 1}/${batchCount}`);
      try {
        await generate(req);
        completed++;
        window.dispatchEvent(new Event("image-generated"));
      } catch {
        failed++;
      }
    }

    setBatchProgress("");

    if (failed === 0) {
      alert(
        batchCount === 1
          ? "Image generated!"
          : `Batch complete! ${completed} image${completed !== 1 ? "s" : ""} generated.`
      );
    } else {
      alert(
        `${completed} generated, ${failed} failed.\nMake sure ComfyUI is running.`
      );
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">What do you want to create?</h1>
        <p className="text-gray-400">
          Describe your idea and let AI enhance it
        </p>
      </div>

      {/* Prompt Input */}
      <div className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type your idea here... (e.g., 'a cat sitting on a couch')"
          className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                   focus:outline-none focus:border-blue-500 resize-none text-white"
        />

        <Button
          onClick={handleEnhance}
          disabled={!prompt.trim() || enhancing}
          variant="secondary"
          icon={
            enhancing ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Sparkles size={18} />
            )
          }
        >
          {enhancing ? "Enhancing..." : "Make it Better with AI"}
        </Button>
      </div>

      {/* Model Selection */}
      {checkpoints && checkpoints.length > 0 && (
        <div className="space-y-2">
          <Select
            value={checkpoint}
            onChange={setCheckpoint}
            options={checkpoints}
            label="Model"
          />
        </div>
      )}

      {/* Style Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Style</label>
        <div className="grid grid-cols-3 gap-3">
          {STYLE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-4 py-3 rounded-lg border-2 transition-colors capitalize ${
                style === s
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Quality Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Quality</label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(QUALITY_PRESETS) as Quality[]).map((q) => {
            const preset = QUALITY_PRESETS[q];
            return (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-4 py-3 rounded-lg border-2 transition-colors capitalize ${
                  quality === q
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-700 hover:border-gray-600"
                }`}
              >
                {q}
                <div className="text-xs text-gray-400 mt-1">
                  {preset.width}x{preset.height}, {preset.steps} steps
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Batch Count */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Batch Count</label>
        <input
          type="number"
          value={batchCount}
          onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value)))}
          min={1}
          className="w-32 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={!prompt.trim() || generating}
        size="large"
        fullWidth
        icon={
          generating ? (
            <Loader2 className="animate-spin" size={20} />
          ) : undefined
        }
      >
        {generating
          ? batchProgress
            ? `Generating ${batchProgress}...`
            : "Generating..."
          : batchCount > 1
            ? `Generate ${batchCount} Images`
            : "Generate Image"}
      </Button>
    </div>
  );
}
