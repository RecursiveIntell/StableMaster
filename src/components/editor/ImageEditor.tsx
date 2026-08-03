import { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer, Line, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import { invoke } from "@tauri-apps/api/core";
import { X, Paintbrush, Eraser, Undo2, Trash2 } from "lucide-react";
import type { ImageRecord, InpaintResponse } from "../../types";
import { getImageUrl } from "../../utils/helpers";
import type { KonvaEventObject } from "konva/lib/Node";

interface ImageEditorProps {
  imageRecord: ImageRecord;
  imageDir: string;
  onClose: () => void;
  onInpaintComplete: (newImageId: string) => void;
}

interface MaskLine {
  tool: "brush" | "eraser";
  points: number[];
  brushSize: number;
}

function exportMaskAsBytes(
  lines: MaskLine[],
  width: number,
  height: number,
  scaleX: number,
  scaleY: number
): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Fill with BLACK (= keep these areas)
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);

  // Draw mask strokes in WHITE (= inpaint these areas)
  for (const line of lines) {
    ctx.lineWidth = line.brushSize / scaleX;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (line.tool === "brush") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "white";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "black";
    }

    ctx.beginPath();
    if (line.points.length >= 2) {
      ctx.moveTo(line.points[0] / scaleX, line.points[1] / scaleY);
      for (let i = 2; i < line.points.length; i += 2) {
        ctx.lineTo(line.points[i] / scaleX, line.points[i + 1] / scaleY);
      }
    }
    ctx.stroke();
  }

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export default function ImageEditor({
  imageRecord,
  imageDir,
  onClose,
  onInpaintComplete,
}: ImageEditorProps) {
  const [lines, setLines] = useState<MaskLine[]>([]);
  const [currentTool, setCurrentTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [denoise, setDenoise] = useState(0.65);
  const [isInpainting, setIsInpainting] = useState(false);
  const [inpaintStatus, setInpaintStatus] = useState("");
  const [maskOpacity, setMaskOpacity] = useState(0.5);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const imageSrc = getImageUrl(imageDir, imageRecord.id);
  const [loadedImage] = useImage(imageSrc, "anonymous");

  // Calculate scale to fit image in available space
  const scaleX = loadedImage
    ? canvasSize.width / loadedImage.width
    : 1;
  const scaleY = loadedImage
    ? canvasSize.height / loadedImage.height
    : 1;
  const scale = Math.min(scaleX, scaleY);

  const displayWidth = loadedImage ? loadedImage.width * scale : canvasSize.width;
  const displayHeight = loadedImage ? loadedImage.height * scale : canvasSize.height;

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({
          width: rect.width,
          height: rect.height,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Keyboard shortcuts: Ctrl+Z undo, Escape close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        setLines((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Global mouseup to fix isDrawing leak when mouse released outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDrawing(false);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("mouseleave", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mouseleave", handleGlobalMouseUp);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      setIsDrawing(true);
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      setLines((prev) => [
        ...prev,
        {
          tool: currentTool,
          points: [pos.x, pos.y],
          brushSize,
        },
      ]);
    },
    [currentTool, brushSize]
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawing) return;
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      setLines((prev) => {
        const updated = [...prev];
        const lastLine = { ...updated[updated.length - 1] };
        lastLine.points = [...lastLine.points, pos.x, pos.y];
        updated[updated.length - 1] = lastLine;
        return updated;
      });
    },
    [isDrawing]
  );

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleInpaint = async () => {
    if (lines.length === 0) {
      setError("Please paint a mask first");
      return;
    }

    setIsInpainting(true);
    setInpaintStatus("Preparing mask...");
    setError(null);
    try {
      const maskBytes = exportMaskAsBytes(
        lines,
        imageRecord.width,
        imageRecord.height,
        scale,
        scale
      );

      const imagePath = `${imageDir}/originals/${imageRecord.filename}`;

      setInpaintStatus("Sending to ComfyUI...");

      const response = await invoke<InpaintResponse>("inpaint_image", {
        request: {
          image_path: imagePath,
          mask_png_bytes: Array.from(maskBytes),
          prompt,
          negative_prompt: negativePrompt,
          denoise,
          steps: 20,
          cfg_scale: 7.0,
          sampler: "dpmpp_2m",
          scheduler: "karras",
          seed: null,
          parent_image_id: imageRecord.id,
        },
      });

      setInpaintStatus("Complete!");
      onInpaintComplete(response.image_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Inpainting failed: ${msg}`);
      console.error("Inpaint failed:", err);
    } finally {
      setIsInpainting(false);
      setInpaintStatus("");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h2 className="text-lg font-semibold">Inpaint Editor</h2>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden"
        >
          <Stage
            width={displayWidth}
            height={displayHeight}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            style={{ cursor: "crosshair" }}
          >
            {/* Layer 1: Source image */}
            <Layer listening={false}>
              {loadedImage && (
                <KonvaImage
                  image={loadedImage}
                  width={displayWidth}
                  height={displayHeight}
                />
              )}
            </Layer>

            {/* Layer 2: Mask visualization (red overlay) */}
            <Layer opacity={maskOpacity} listening={false}>
              {lines.map((line, i) => (
                <Line
                  key={i}
                  points={line.points}
                  stroke="rgba(255, 50, 50, 0.6)"
                  strokeWidth={line.brushSize}
                  lineCap="round"
                  lineJoin="round"
                  globalCompositeOperation={
                    line.tool === "eraser" ? "destination-out" : "source-over"
                  }
                  listening={false}
                />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* Right Panel */}
        <div className="w-72 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Tools */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Tool
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentTool("brush")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentTool === "brush"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <Paintbrush size={16} />
                  Brush
                </button>
                <button
                  onClick={() => setCurrentTool("eraser")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentTool === "eraser"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <Eraser size={16} />
                  Eraser
                </button>
              </div>
            </div>

            {/* Brush Size */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Brush Size: {brushSize}px
              </label>
              <input
                type="range"
                min={5}
                max={100}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Mask Opacity */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Mask Opacity: {Math.round(maskOpacity * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(maskOpacity * 100)}
                onChange={(e) => setMaskOpacity(Number(e.target.value) / 100)}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Mask Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setLines((prev) => prev.slice(0, -1))}
                disabled={lines.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Undo2 size={14} />
                Undo
              </button>
              <button
                onClick={() => setLines([])}
                disabled={lines.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>

            <hr className="border-gray-700" />

            {/* Prompt */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should fill the masked area..."
                rows={3}
                className="w-full text-sm bg-gray-900 px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {/* Negative Prompt */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Negative Prompt
              </label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="What to avoid..."
                rows={2}
                className="w-full text-sm bg-gray-900 px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {/* Denoise */}
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Denoise: {denoise.toFixed(2)}
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(denoise * 100)}
                onChange={(e) => setDenoise(Number(e.target.value) / 100)}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Subtle (0.1)</span>
                <span>Full (1.0)</span>
              </div>
            </div>

          </div>

          {/* Sticky footer — always visible */}
          <div className="border-t border-gray-700 p-4 space-y-3">
            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 text-sm rounded-lg px-3 py-2 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Status */}
            {isInpainting && inpaintStatus && (
              <div className="text-sm text-blue-300 text-center animate-pulse">
                {inpaintStatus}
              </div>
            )}

            {/* Inpaint Button */}
            <button
              onClick={handleInpaint}
              disabled={isInpainting || lines.length === 0}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInpainting ? "Inpainting..." : "Inpaint"}
            </button>

            {/* Cancel Button */}
            <button
              onClick={onClose}
              disabled={isInpainting}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
