import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTauriQuery, useTauriMutation } from "@tauri-hooks/core";
import { Trash2, RefreshCw } from "lucide-react";
import Button from "../common/Button";
import type { QueueStatusResponse } from "../../types";

export default function QueuePanel() {
  const {
    data: queueStatus,
    loading,
    refresh,
  } = useTauriQuery<QueueStatusResponse>("get_queue_status");

  // Auto-refresh on queue events and poll every 3s
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const interval = setInterval(() => refreshRef.current(), 3000);

    const unlisteners = [
      "queue:job_started",
      "queue:job_completed",
      "queue:job_failed",
      "queue:job_cancelled",
    ].map((event) => listen(event, () => refreshRef.current()));

    return () => {
      clearInterval(interval);
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, []);

  const { mutate: cancelJob } = useTauriMutation<[string], void>(
    "cancel_job",
    (id) => ({ jobId: id }),
    { onSuccess: () => refresh() },
  );

  const jobs = queueStatus?.jobs ?? [];

  const statusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-400";
      case "processing":
        return "text-blue-400";
      case "completed":
        return "text-green-400";
      case "failed":
        return "text-red-400";
      case "cancelled":
        return "text-gray-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Queue</h1>
        <Button
          onClick={refresh}
          variant="secondary"
          icon={<RefreshCw size={16} />}
        >
          Refresh
        </Button>
      </div>

      {loading && <p className="text-gray-400">Loading queue status...</p>}

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg">Queue is empty</p>
          <p className="text-sm">Queued generations will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div className="flex items-center gap-4">
                <span className={`text-sm font-medium ${statusColor(job.status)}`}>
                  {job.status.toUpperCase()}
                </span>
                <span className="text-sm text-gray-400 font-mono">
                  {job.id.slice(0, 8)}...
                </span>
              </div>

              {(job.status === "pending" || job.status === "processing") && (
                <button
                  onClick={() => cancelJob(job.id)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
