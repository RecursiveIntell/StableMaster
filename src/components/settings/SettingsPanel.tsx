import { useState } from "react";
import { useTauriConfig } from "@tauri-hooks/core";
import { Save, Loader2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Button from "../common/Button";
import Input from "../common/Input";
import Select from "../common/Select";
import type { AppConfig } from "../../types";

export default function SettingsPanel() {
  const { config, loading, saving, save, update } =
    useTauriConfig<AppConfig>("get_config", "update_config", "updated");

  const [checkpoints, setCheckpoints] = useState<string[] | null>(null);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const [loadingOllama, setLoadingOllama] = useState(false);

  const refreshCheckpoints = async () => {
    setLoadingCheckpoints(true);
    try {
      const models = await invoke<string[]>("get_checkpoints");
      setCheckpoints(models);
    } catch (e) {
      console.error("Failed to fetch checkpoints:", e);
    } finally {
      setLoadingCheckpoints(false);
    }
  };

  const refreshOllamaModels = async () => {
    setLoadingOllama(true);
    try {
      const models = await invoke<string[]>("get_ollama_models");
      setOllamaModels(models);
    } catch (e) {
      console.error("Failed to fetch Ollama models:", e);
    } finally {
      setLoadingOllama(false);
    }
  };

  if (loading || !config) {
    return <p className="text-gray-400">Loading settings...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* ComfyUI */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-blue-400">ComfyUI</h2>
          <button
            onClick={refreshCheckpoints}
            disabled={loadingCheckpoints}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loadingCheckpoints ? "animate-spin" : ""}
            />
            Refresh Models
          </button>
        </div>
        {checkpoints && (
          <p className="text-sm text-gray-400">
            {checkpoints.length} model{checkpoints.length !== 1 ? "s" : ""}{" "}
            available
          </p>
        )}
        <Input
          label="Endpoint"
          value={config.comfyui.endpoint}
          onChange={(v) =>
            update({ comfyui: { ...config.comfyui, endpoint: v } })
          }
        />
      </section>

      {/* Ollama */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-blue-400">Ollama</h2>
          <button
            onClick={refreshOllamaModels}
            disabled={loadingOllama}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loadingOllama ? "animate-spin" : ""}
            />
            Refresh Models
          </button>
        </div>
        {ollamaModels && (
          <p className="text-sm text-gray-400">
            {ollamaModels.length} model{ollamaModels.length !== 1 ? "s" : ""}{" "}
            available
          </p>
        )}
        <Input
          label="Endpoint"
          value={config.ollama.endpoint}
          onChange={(v) =>
            update({ ollama: { ...config.ollama, endpoint: v } })
          }
        />
        {ollamaModels && ollamaModels.length > 0 ? (
          <Select
            label="Enhancement Model"
            value={config.ollama.enhancement_model}
            options={
              ollamaModels.includes(config.ollama.enhancement_model)
                ? ollamaModels
                : [config.ollama.enhancement_model, ...ollamaModels]
            }
            onChange={(v) =>
              update({
                ollama: { ...config.ollama, enhancement_model: v },
              })
            }
          />
        ) : (
          <Input
            label="Enhancement Model"
            value={config.ollama.enhancement_model}
            onChange={(v) =>
              update({
                ollama: { ...config.ollama, enhancement_model: v },
              })
            }
          />
        )}
        {ollamaModels && ollamaModels.length > 0 ? (
          <Select
            label="Vision Model"
            value={config.ollama.vision_model}
            options={
              ollamaModels.includes(config.ollama.vision_model)
                ? ollamaModels
                : [config.ollama.vision_model, ...ollamaModels]
            }
            onChange={(v) =>
              update({
                ollama: { ...config.ollama, vision_model: v },
              })
            }
          />
        ) : (
          <Input
            label="Vision Model"
            value={config.ollama.vision_model}
            onChange={(v) =>
              update({
                ollama: { ...config.ollama, vision_model: v },
              })
            }
          />
        )}
      </section>

      {/* Storage */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-blue-400">Storage</h2>
        <Input
          label="Image Directory"
          value={config.storage.image_directory}
          onChange={(v) =>
            update({
              storage: { ...config.storage, image_directory: v },
            })
          }
        />
      </section>

      {/* Generation Defaults */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-blue-400">
          Generation Defaults
        </h2>
        {checkpoints && checkpoints.length > 0 ? (
          <Select
            label="Default Checkpoint"
            value={config.generation.checkpoint}
            placeholder="(Auto-detect)"
            options={
              config.generation.checkpoint
                ? checkpoints.includes(config.generation.checkpoint)
                  ? ["", ...checkpoints]
                  : ["", config.generation.checkpoint, ...checkpoints]
                : ["", ...checkpoints]
            }
            onChange={(v) =>
              update({
                generation: { ...config.generation, checkpoint: v },
              })
            }
          />
        ) : (
          <Input
            label="Default Checkpoint"
            value={config.generation.checkpoint}
            onChange={(v) =>
              update({
                generation: { ...config.generation, checkpoint: v },
              })
            }
            placeholder="Leave empty for auto-detect"
          />
        )}
        <Input
          label="Default Negative Prompt"
          value={config.generation.negative_prompt}
          onChange={(v) =>
            update({
              generation: { ...config.generation, negative_prompt: v },
            })
          }
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Width"
            type="number"
            value={String(config.generation.width)}
            onChange={(v) =>
              update({
                generation: { ...config.generation, width: Number(v) },
              })
            }
          />
          <Input
            label="Height"
            type="number"
            value={String(config.generation.height)}
            onChange={(v) =>
              update({
                generation: { ...config.generation, height: Number(v) },
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Steps"
            type="number"
            value={String(config.generation.steps)}
            onChange={(v) =>
              update({
                generation: { ...config.generation, steps: Number(v) },
              })
            }
          />
          <Input
            label="CFG Scale"
            type="number"
            value={String(config.generation.cfg_scale)}
            onChange={(v) =>
              update({
                generation: { ...config.generation, cfg_scale: Number(v) },
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Sampler"
            value={config.generation.sampler}
            onChange={(v) =>
              update({
                generation: { ...config.generation, sampler: v },
              })
            }
          />
          <Input
            label="Scheduler"
            value={config.generation.scheduler}
            onChange={(v) =>
              update({
                generation: { ...config.generation, scheduler: v },
              })
            }
          />
        </div>
      </section>

      {/* Save */}
      <Button
        onClick={() => save(config)}
        disabled={saving}
        size="large"
        icon={
          saving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Save size={18} />
          )
        }
      >
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
