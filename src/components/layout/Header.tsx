import { Image, LayoutGrid, ListTodo, Settings } from "lucide-react";
import type { UIMode, View } from "../../types";
import ModeToggle from "./ModeToggle";

interface HeaderProps {
  mode: UIMode;
  onModeChange: (mode: UIMode) => void;
  view: View;
  onViewChange: (view: View) => void;
}

export default function Header({
  mode,
  onModeChange,
  view,
  onViewChange,
}: HeaderProps) {
  const navItems: { id: View; label: string; icon: typeof Image }[] = [
    { id: "generate", label: "Generate", icon: Image },
    { id: "gallery", label: "Gallery", icon: LayoutGrid },
    { id: "queue", label: "Queue", icon: ListTodo },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-gray-800/50 border-b border-gray-700">
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-bold text-blue-400">StableMaster</h1>

        <nav className="flex items-center gap-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                view === id
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-700/50"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {view === "generate" && (
        <ModeToggle mode={mode} onChange={onModeChange} />
      )}
    </header>
  );
}
