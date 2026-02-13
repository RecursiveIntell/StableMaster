import { useState, useEffect, useCallback } from "react";
import { X, Heart, Trash2, Copy, Sparkles, Tag } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriMutation } from "@tauri-hooks/core";
import type { ImageRecord, ImageTag } from "../../types";
import { formatDate, getImageUrl } from "../../utils/helpers";
import Button from "../common/Button";
import StarRating from "../common/StarRating";
import TagChip from "../common/TagChip";

interface ImageDetailProps {
  image: ImageRecord;
  imageDir: string;
  onClose: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onImageUpdated?: () => void;
}

export default function ImageDetail({
  image,
  imageDir,
  onClose,
  onFavorite,
  onDelete,
  onImageUpdated,
}: ImageDetailProps) {
  const [rating, setRating] = useState(image.rating);
  const [caption, setCaption] = useState(image.caption ?? "");
  const [editingCaption, setEditingCaption] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [tags, setTags] = useState<ImageTag[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      const result = await invoke<ImageTag[]>("get_image_tags", {
        imageId: image.id,
      });
      setTags(result);
    } catch (e) {
      console.error("Failed to fetch tags:", e);
    }
  }, [image.id]);

  useEffect(() => {
    setRating(image.rating);
    setCaption(image.caption ?? "");
    fetchTags();
  }, [image, fetchTags]);

  const { mutate: updateRating } = useTauriMutation<
    [string, number | null],
    void
  >("update_image_rating", (id, r) => ({ imageId: id, rating: r }), {
    onSuccess: () => onImageUpdated?.(),
  });

  const { mutate: saveCaption } = useTauriMutation<[string, string], void>(
    "update_caption",
    (id, c) => ({ imageId: id, caption: c }),
    { onSuccess: () => onImageUpdated?.() }
  );

  const handleAiCaption = async () => {
    setCaptionLoading(true);
    setError(null);
    try {
      const result = await invoke<string>("caption_single", {
        imageId: image.id,
      });
      setCaption(result);
      onImageUpdated?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Caption failed: ${msg}`);
      console.error("AI Caption error:", e);
    } finally {
      setCaptionLoading(false);
    }
  };

  const handleAiTag = async () => {
    setTagLoading(true);
    setError(null);
    try {
      const result = await invoke<ImageTag[]>("tag_single", {
        imageId: image.id,
      });
      setTags(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Tagging failed: ${msg}`);
      console.error("AI Tag error:", e);
    } finally {
      setTagLoading(false);
    }
  };

  const handleAddTag = async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    try {
      const result = await invoke<ImageTag>("add_image_tag", {
        imageId: image.id,
        tag: trimmed,
      });
      setTags((prev) => [...prev, result]);
      setNewTag("");
    } catch (e) {
      console.error("Failed to add tag:", e);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      await invoke("remove_image_tag", { tagId });
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (e) {
      console.error("Failed to remove tag:", e);
    }
  };

  const copyPrompt = () => {
    if (image.prompt) {
      navigator.clipboard.writeText(image.prompt);
    }
  };

  const handleRatingChange = (newRating: number | null) => {
    setRating(newRating);
    updateRating(image.id, newRating);
  };

  const handleCaptionBlur = () => {
    setEditingCaption(false);
    if (caption !== (image.caption ?? "")) {
      saveCaption(image.id, caption);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-xl shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Image Details</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Image Preview */}
          <img
            src={getImageUrl(imageDir, image.id)}
            alt={image.prompt || "Generated image"}
            className="bg-gray-700 rounded-lg w-full object-contain"
          />

          {/* Metadata */}
          <div className="space-y-0">
            {/* Error Banner */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 text-sm rounded-lg px-3 py-2 mb-4 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Rating */}
            <div className="border-b border-gray-700 pb-4 mb-4">
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Rating
              </label>
              <StarRating rating={rating} onChange={handleRatingChange} />
            </div>

            {/* Prompt */}
            {image.prompt && (
              <div className="border-b border-gray-700 pb-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-400">
                    Prompt
                  </label>
                  <button
                    onClick={copyPrompt}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <p className="text-sm bg-gray-900 p-3 rounded-lg">
                  {image.prompt}
                </p>
              </div>
            )}

            {image.negative_prompt && (
              <div className="border-b border-gray-700 pb-4 mb-4">
                <label className="text-sm font-medium text-gray-400 mb-2 block">
                  Negative Prompt
                </label>
                <p className="text-sm bg-gray-900 p-3 rounded-lg">
                  {image.negative_prompt}
                </p>
              </div>
            )}

            {/* Caption */}
            <div className="border-b border-gray-700 pb-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-400">
                  Caption
                </label>
                <button
                  onClick={handleAiCaption}
                  disabled={captionLoading}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {captionLoading ? "Generating..." : "AI Caption"}
                </button>
              </div>
              {editingCaption ? (
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onBlur={handleCaptionBlur}
                  autoFocus
                  rows={3}
                  className="w-full text-sm bg-gray-900 p-3 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                />
              ) : (
                <p
                  onClick={() => setEditingCaption(true)}
                  className="text-sm bg-gray-900 p-3 rounded-lg cursor-text min-h-[2.5rem]"
                >
                  {caption || (
                    <span className="text-gray-500 italic">
                      Click to add caption or use AI Caption
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Tags */}
            <div className="border-b border-gray-700 pb-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-400">
                  Tags
                </label>
                <button
                  onClick={handleAiTag}
                  disabled={tagLoading}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                >
                  <Tag size={12} />
                  {tagLoading ? "Tagging..." : "AI Tag"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      onRemove={handleRemoveTag}
                    />
                  ))
                ) : (
                  <span className="text-xs text-gray-500 italic">
                    No tags yet
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  placeholder="Add tag..."
                  className="flex-1 text-xs bg-gray-900 px-2 py-1.5 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Generation Info */}
            <div className="border-b border-gray-700 pb-4 mb-4">
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                Generation Info
              </label>
              <div className="space-y-1.5 text-sm">
                {image.checkpoint && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Checkpoint</span>
                    <span className="text-right max-w-[60%] truncate">
                      {image.checkpoint}
                    </span>
                  </div>
                )}
                {image.sampler && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sampler</span>
                    <span>{image.sampler}</span>
                  </div>
                )}
                {image.scheduler && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Scheduler</span>
                    <span>{image.scheduler}</span>
                  </div>
                )}
                {image.steps && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Steps</span>
                    <span>{image.steps}</span>
                  </div>
                )}
                {image.cfg_scale && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">CFG</span>
                    <span>{image.cfg_scale}</span>
                  </div>
                )}
                {image.seed && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Seed</span>
                    <span>{image.seed}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Size</span>
                  <span>
                    {image.width}x{image.height}
                  </span>
                </div>
              </div>
            </div>

            {/* Created */}
            <div className="border-b border-gray-700 pb-4 mb-4 text-sm text-gray-400">
              Created: {formatDate(image.created_at)}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={onFavorite}
                variant="secondary"
                icon={
                  <Heart
                    size={16}
                    fill={image.favorite ? "currentColor" : "none"}
                    className={image.favorite ? "text-red-500" : ""}
                  />
                }
              >
                {image.favorite ? "Unfavorite" : "Favorite"}
              </Button>
              <Button
                onClick={onDelete}
                variant="danger"
                icon={<Trash2 size={16} />}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
