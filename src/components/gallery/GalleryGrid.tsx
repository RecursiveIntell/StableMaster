import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTauriQuery, useTauriMutation } from "@tauri-hooks/core";
import { Search, Heart, Star, Tag, Sparkles, X, CheckSquare } from "lucide-react";
import type { AppConfig, ImageRecord } from "../../types";
import ImageDetail from "./ImageDetail";
import { getImageUrl } from "../../utils/helpers";

export default function GalleryGrid() {
  const [searchQuery, setSearchQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  const { data: config } = useTauriQuery<AppConfig>("get_config");
  const imageDir = config?.storage.image_directory ?? "";

  const { data: images, refresh } = useTauriQuery<ImageRecord[]>(
    searchQuery ? "search_images" : "get_images",
    searchQuery
      ? { query: searchQuery }
      : { limit: 100, offset: 0, favoritesOnly },
  );

  useEffect(() => {
    const onGenerated = () => refresh();
    window.addEventListener("image-generated", onGenerated);
    const unlisten = listen("queue:job_completed", onGenerated);
    return () => {
      window.removeEventListener("image-generated", onGenerated);
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const { mutate: toggleFavorite } = useTauriMutation<[string], boolean>(
    "favorite_image",
    (id) => ({ imageId: id }),
    { onSuccess: () => refresh() },
  );

  const { mutate: deleteImage } = useTauriMutation<[string], void>(
    "delete_image",
    (id) => ({ imageId: id }),
    {
      onSuccess: () => {
        refresh();
        setSelectedImage(null);
      },
    },
  );

  const { mutate: startBatchTag, loading: batchTagLoading } = useTauriMutation<
    [string[]],
    string
  >("start_batch_tag", (ids) => ({ imageIds: ids }), {
    onSuccess: () => {
      setSelectedIds(new Set());
      setSelectMode(false);
    },
  });

  const { mutate: startBatchCaption, loading: batchCaptionLoading } =
    useTauriMutation<[string[]], string>(
      "start_batch_caption",
      (ids) => ({ imageIds: ids }),
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setSelectMode(false);
        },
      },
    );

  const handleImageClick = useCallback(
    (img: ImageRecord, index: number, e: React.MouseEvent) => {
      if (!selectMode) {
        setSelectedImage(img);
        return;
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (e.shiftKey && lastClickedIndex !== null && images) {
          const start = Math.min(lastClickedIndex, index);
          const end = Math.max(lastClickedIndex, index);
          for (let i = start; i <= end; i++) {
            next.add(images[i].id);
          }
        } else {
          if (next.has(img.id)) {
            next.delete(img.id);
          } else {
            next.add(img.id);
          }
        }
        return next;
      });
      setLastClickedIndex(index);
    },
    [selectMode, lastClickedIndex, images],
  );

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setLastClickedIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">Gallery</h1>

        {/* Search */}
        <div className="flex-1 relative max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Favorites Filter */}
        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            favoritesOnly
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
              : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white"
          }`}
        >
          <Star size={16} fill={favoritesOnly ? "currentColor" : "none"} />
          Favorites
        </button>

        {/* Select Mode Toggle */}
        <button
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            selectMode
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
              : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white"
          }`}
        >
          <CheckSquare size={16} />
          Select
        </button>
      </div>

      {/* Batch Action Bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-300">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => startBatchTag(Array.from(selectedIds))}
            disabled={batchTagLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-sm transition-colors disabled:opacity-50"
          >
            <Tag size={14} />
            {batchTagLoading ? "Queuing..." : "Tag Selected"}
          </button>
          <button
            onClick={() => startBatchCaption(Array.from(selectedIds))}
            disabled={batchCaptionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-sm transition-colors disabled:opacity-50"
          >
            <Sparkles size={14} />
            {batchCaptionLoading ? "Queuing..." : "Caption Selected"}
          </button>
          <button
            onClick={exitSelectMode}
            className="ml-auto text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Grid */}
      {images && images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {images.map((img, index) => (
            <div
              key={img.id}
              onClick={(e) => handleImageClick(img, index, e)}
              className={`relative group cursor-pointer rounded-lg overflow-hidden bg-gray-800 border transition-colors ${
                selectedIds.has(img.id)
                  ? "border-blue-500 ring-2 ring-blue-500/40"
                  : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <img
                src={getImageUrl(imageDir, img.id)}
                alt={img.prompt || "Generated image"}
                className="aspect-square object-cover w-full bg-gray-700"
                loading="lazy"
              />

              {/* Select checkbox overlay */}
              {selectMode && (
                <div className="absolute top-2 left-2 z-10">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedIds.has(img.id)
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-400 bg-black/40"
                    }`}
                  >
                    {selectedIds.has(img.id) && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                <p className="text-sm text-white line-clamp-2">
                  {img.prompt || "No prompt"}
                </p>
              </div>

              {/* Favorite badge */}
              {img.favorite && (
                <div className="absolute top-2 right-2">
                  <Heart
                    size={16}
                    className="text-red-500"
                    fill="currentColor"
                  />
                </div>
              )}

              {/* Rating badge */}
              {img.rating && (
                <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-black/60 px-1.5 py-0.5 rounded">
                  <Star
                    size={12}
                    className="text-yellow-400"
                    fill="currentColor"
                  />
                  <span className="text-xs text-yellow-400">{img.rating}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg">No images yet</p>
          <p className="text-sm">Generate some images to see them here</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedImage && (
        <ImageDetail
          image={selectedImage}
          imageDir={imageDir}
          onClose={() => setSelectedImage(null)}
          onFavorite={() => toggleFavorite(selectedImage.id)}
          onDelete={() => deleteImage(selectedImage.id)}
          onImageUpdated={refresh}
        />
      )}
    </div>
  );
}
