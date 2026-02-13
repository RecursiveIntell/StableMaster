import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Header from "./components/layout/Header";
import StandardMode from "./components/generation/StandardMode";
import ExpertMode from "./components/generation/ExpertMode";
import GalleryGrid from "./components/gallery/GalleryGrid";
import QueuePanel from "./components/queue/QueuePanel";
import SettingsPanel from "./components/settings/SettingsPanel";
import BatchStatusBar from "./components/common/BatchStatusBar";
import type { UIMode, View } from "./types";

type Page = "standard" | "expert" | "gallery" | "queue" | "settings";

const allPages: Page[] = ["standard", "expert", "gallery", "queue", "settings"];

const pageComponents: Record<Page, () => JSX.Element> = {
  standard: () => <StandardMode />,
  expert: () => <ExpertMode />,
  gallery: () => <GalleryGrid />,
  queue: () => <QueuePanel />,
  settings: () => <SettingsPanel />,
};

function App() {
  const [mode, setMode] = useState<UIMode>("standard");
  const [view, setView] = useState<View>("generate");
  const [loading, setLoading] = useState(true);
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(
    () => new Set(["standard"])
  );

  // Derive the active page from view + mode
  const activePage: Page = view === "generate" ? mode : (view as Page);

  useEffect(() => {
    invoke<string>("get_mode")
      .then((savedMode) => {
        const m = savedMode as UIMode;
        setMode(m);
        setVisitedPages(new Set([m]));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Track visited pages whenever activePage changes
  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(activePage)) return prev;
      const next = new Set(prev);
      next.add(activePage);
      return next;
    });
  }, [activePage]);

  const toggleMode = async (newMode: UIMode) => {
    try {
      await invoke("set_mode", { mode: newMode });
      setMode(newMode);
    } catch (error) {
      console.error("Failed to change mode:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-xl">Loading StableMaster...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <Header
        mode={mode}
        onModeChange={toggleMode}
        view={view}
        onViewChange={setView}
      />

      <main className="flex-1 relative overflow-hidden">
        {allPages.map((page) => {
          if (!visitedPages.has(page)) return null;
          return (
            <div
              key={page}
              className={`absolute inset-0 overflow-auto p-6 ${
                activePage === page ? "visible z-10" : "invisible z-0"
              }`}
              aria-hidden={activePage !== page}
            >
              {pageComponents[page]()}
            </div>
          );
        })}
      </main>

      <BatchStatusBar />
    </div>
  );
}

export default App;
