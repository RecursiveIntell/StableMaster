import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { X, Loader2 } from "lucide-react";
import type { BatchItemProgress, BatchJobStarted, BatchCompletionSummary } from "../../types";

interface BatchState {
  active: boolean;
  jobId: string | null;
  operation: string;
  completed: number;
  total: number;
  etaMs: number | null;
  summary: BatchCompletionSummary | null;
}

export default function BatchStatusBar() {
  const [state, setState] = useState<BatchState>({
    active: false,
    jobId: null,
    operation: "",
    completed: 0,
    total: 0,
    etaMs: null,
    summary: null,
  });

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<BatchJobStarted>("ai_batch:job_started", (event) => {
        setState({
          active: true,
          jobId: event.payload.jobId,
          operation: event.payload.operation,
          completed: 0,
          total: event.payload.totalItems,
          etaMs: null,
          summary: null,
        });
      })
    );

    unlisteners.push(
      listen<BatchItemProgress>("ai_batch:item_progress", (event) => {
        setState((prev) => ({
          ...prev,
          completed: event.payload.completed,
          total: event.payload.total,
          etaMs: event.payload.etaRemainingMs,
        }));
      })
    );

    unlisteners.push(
      listen<{ summary: BatchCompletionSummary }>(
        "ai_batch:job_completed",
        (event) => {
          setState((prev) => ({
            ...prev,
            active: false,
            summary: event.payload.summary,
          }));

          // Auto-hide after 5 seconds
          setTimeout(() => {
            setState((prev) =>
              prev.summary?.jobId === event.payload.summary.jobId
                ? { ...prev, jobId: null }
                : prev
            );
          }, 5000);
        }
      )
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  if (!state.jobId) return null;

  const progress =
    state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;

  const formatEta = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const handleCancel = () => {
    if (state.jobId) {
      invoke("cancel_batch_job", { jobId: state.jobId });
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-gray-700 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        {state.active ? (
          <>
            <Loader2 size={16} className="animate-spin text-blue-400 shrink-0" />
            <span className="text-sm text-gray-300 capitalize">
              {state.operation}ing images...
            </span>
            <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-400 shrink-0">
              {state.completed}/{state.total}
            </span>
            {state.etaMs != null && (
              <span className="text-xs text-gray-500 shrink-0">
                ~{formatEta(state.etaMs)}
              </span>
            )}
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </>
        ) : state.summary ? (
          <>
            <span className="text-sm text-green-400">
              Batch {state.summary.operation} complete:
            </span>
            <span className="text-sm text-gray-300">
              {state.summary.succeeded} succeeded
              {state.summary.failed > 0 && `, ${state.summary.failed} failed`}
              {state.summary.skipped > 0 &&
                `, ${state.summary.skipped} skipped`}
            </span>
            <button
              onClick={() => setState((prev) => ({ ...prev, jobId: null }))}
              className="ml-auto text-gray-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
