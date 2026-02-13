import { Zap, Settings } from "lucide-react";
import type { UIMode } from "../../types";

interface ModeToggleProps {
  mode: UIMode;
  onChange: (mode: UIMode) => void;
}

export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => onChange("standard")}
        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-colors ${
          mode === "standard"
            ? "bg-blue-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        <Zap size={16} />
        Standard
      </button>

      <button
        onClick={() => onChange("expert")}
        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-colors ${
          mode === "expert"
            ? "bg-purple-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        <Settings size={16} />
        Expert
      </button>
    </div>
  );
}
