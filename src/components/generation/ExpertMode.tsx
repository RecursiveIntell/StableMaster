import { useState, useEffect } from "react";
import { useTauriMutation, useTauriQuery } from "@tauri-hooks/core";
import { Loader2 } from "lucide-react";
import Button from "../common/Button";
import Select from "../common/Select";
import type { GenerationResponse } from "../../types";
import { SAMPLERS, SCHEDULERS } from "../../utils/constants";

export default function ExpertMode() {
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(
    "blurry, low quality, watermark, text"
  );
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(768);
  const [steps, setSteps] = useState(25);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [sampler, setSampler] = useState("dpmpp_2m");
  const [scheduler, setScheduler] = useState("karras");
  const [seed, setSeed] = useState(-1);
  const [checkpoint, setCheckpoint] = useState("");
  const [batchCount, setBatchCount] = useState(1);
  const [batchProgress, setBatchProgress] = useState("");

  // Fetch available options from ComfyUI
  const { data: checkpoints } = useTauriQuery<string[]>("get_checkpoints");
  const { data: samplerList } = useTauriQuery<string[]>("get_samplers");
  const { data: schedulerList } = useTauriQuery<string[]>("get_schedulers");

  useEffect(() => {
    if (checkpoints && checkpoints.length > 0 && !checkpoint) {
      setCheckpoint(checkpoints[0]);
    }
  }, [checkpoints, checkpoint]);

  useEffect(() => {
    if (samplerList && samplerList.length > 0 && !samplerList.includes(sampler)) {
      setSampler(samplerList[0]);
    }
  }, [samplerList, sampler]);

  useEffect(() => {
    if (schedulerList && schedulerList.length > 0 && !schedulerList.includes(scheduler)) {
      setScheduler(schedulerList[0]);
    }
  }, [schedulerList, scheduler]);

  const { mutate: generate, loading: generating } = useTauriMutation<
    [Record<string, unknown>],
    GenerationResponse
  >("generate_image", (req) => ({ req }));

  const handleGenerate = async () => {
    if (!positivePrompt.trim()) return;
    const req = {
      prompt: positivePrompt,
      negative_prompt: negativePrompt,
      checkpoint: checkpoint || undefined,
      width,
      height,
      steps,
      cfg_scale: cfgScale,
      sampler,
      scheduler,
      seed: seed >= 0 ? seed : undefined,
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
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Expert Mode</h1>

      {/* Checkpoint */}
      {!checkpoints ? (
        <div className="text-sm text-gray-400">Loading models...</div>
      ) : checkpoints.length > 0 ? (
        <Select
          value={checkpoint}
          onChange={setCheckpoint}
          options={checkpoints}
          label="Checkpoint"
        />
      ) : (
        <div className="text-sm text-red-400">
          No checkpoints found. Make sure ComfyUI is running and has models installed.
        </div>
      )}

      {/* Positive Prompt */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Positive Prompt</label>
        <textarea
          value={positivePrompt}
          onChange={(e) => setPositivePrompt(e.target.value)}
          placeholder="Describe what you want to see..."
          className="w-full h-24 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg resize-none text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Negative Prompt */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Negative Prompt</label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          className="w-full h-20 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg resize-none text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Size Controls */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Width</label>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            step={64}
            min={64}
            max={2048}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Height</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            step={64}
            min={64}
            max={2048}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Steps & CFG */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Steps: {steps}</label>
          <input
            type="range"
            min={1}
            max={150}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            CFG Scale: {cfgScale}
          </label>
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={cfgScale}
            onChange={(e) => setCfgScale(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* Sampler & Scheduler */}
      <div className="grid grid-cols-2 gap-4">
        <Select
          value={sampler}
          onChange={setSampler}
          options={samplerList ?? SAMPLERS}
          label="Sampler"
        />
        <Select
          value={scheduler}
          onChange={setScheduler}
          options={schedulerList ?? SCHEDULERS}
          label="Scheduler"
        />
      </div>

      {/* Seed & Batch Count */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Seed (-1 for random)
          </label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Batch Count</label>
          <input
            type="number"
            value={batchCount}
            onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value)))}
            min={1}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <Button
        onClick={handleGenerate}
        disabled={!positivePrompt.trim() || generating || !checkpoint}
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
            : "Generate"}
      </Button>
    </div>
  );
}
