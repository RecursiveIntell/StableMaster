import { X } from "lucide-react";
import type { ImageTag } from "../../types";

interface TagChipProps {
  tag: ImageTag;
  onRemove?: (tagId: number) => void;
}

export default function TagChip({ tag, onRemove }: TagChipProps) {
  const isAi = tag.source === "ai";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
        isAi
          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
          : "bg-zinc-700 text-zinc-300 border border-zinc-600"
      }`}
    >
      {tag.tag}
      {onRemove && (
        <button
          onClick={() => onRemove(tag.id)}
          className="hover:text-white transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
