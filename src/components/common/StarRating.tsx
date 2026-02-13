import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number | null;
  onChange: (rating: number | null) => void;
  size?: number;
}

export default function StarRating({
  rating,
  onChange,
  size = 20,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const display = hovered ?? rating ?? 0;

  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(rating === star ? null : star)}
          onMouseEnter={() => setHovered(star)}
          className="text-gray-500 hover:scale-110 transition-transform"
        >
          <Star
            size={size}
            className={
              star <= display ? "text-yellow-400" : "text-gray-600"
            }
            fill={star <= display ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}
