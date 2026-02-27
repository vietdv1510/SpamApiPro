import { useEffect } from "react";
import { useAppStore } from "../store";
import { deleteHistoryEntry, clearAllHistory } from "../tauri";
import { loadHistoryFromDB } from "../hooks/useTestRunner";

export function History() {
  const { history } = useAppStore();

  // Load history từ SQLite khi mount
  useEffect(() => {
    loadHistoryFromDB();
  }, []);

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl opacity-20 mb-4">📋</div>
          <p className="text-gray-500 text-sm">No test history yet</p>
          <p className="text-gray-600 text-[10px] mt-1">
            Run a test to see results here
          </p>
        </div>
      </div>
    );
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteHistoryEntry(id);
      await loadHistoryFromDB();
    } catch (err) {
      console.error("Delete history error:", err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all test history?")) return;
    try {
      await clearAllHistory();
      await loadHistoryFromDB();
    } catch (err) {
      console.error("Clear history error:", err);
    }
  };

  return (
    <div className="overflow-y-auto h-full space-y-2">
      {/* Header with clear button */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 font-medium">
          {history.length} test{history.length > 1 ? "s" : ""} saved
        </span>
        <button
          onClick={handleClearAll}
          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors px-2 py-0.5 rounded hover:bg-red-500/10"
        >
          Clear all
        </button>
      </div>

      {history.map((entry) => {
        const r = entry.result;
        const successRate =
          r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0;

        return (
          <div
            key={entry.id}
            className="bg-bg-800 border border-bg-600 rounded-xl p-4 hover:border-bg-500 transition-all cursor-pointer group relative"
            onClick={() => {
              const store = useAppStore.getState();
              store.setCurrentResult(r);
              store.setActiveTab("results");
            }}
          >
            {/* Delete button */}
            <button
              onClick={(e) => handleDelete(entry.id, e)}
              className="absolute top-2 right-2 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs p-1 rounded hover:bg-red-500/10"
              title="Delete"
            >
              ✕
            </button>

            <div className="flex justify-between items-start pr-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {entry.method}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500 bg-bg-600 px-1.5 py-0.5 rounded capitalize">
                    {entry.mode.replace("_", " ")}
                  </span>
                  <span className="text-sm font-mono text-gray-300 truncate">
                    {entry.url}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>🕐 {entry.timestamp}</span>
                  <span>
                    👥 {entry.virtual_users}{" "}
                    {entry.mode === "burst" ? "reqs" : "VUs"}
                  </span>
                  <span>⚡ {r.requests_per_second.toFixed(0)} RPS</span>
                  <span>📊 {r.total_requests} total</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 ml-4">
                <span
                  className={`text-sm font-bold font-mono ${
                    successRate === 100
                      ? "text-success"
                      : successRate > 90
                        ? "text-amber-400"
                        : "text-danger"
                  }`}
                >
                  {successRate.toFixed(0)}%
                </span>
                {r.race_conditions_detected > 0 && (
                  <span className="text-xs text-danger bg-red-500/10 px-2 py-0.5 rounded">
                    ⚠️ Race
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-2 text-xs font-mono text-gray-600">
              <span>P50: {r.latency_p50_ms.toFixed(1)}ms</span>
              <span>P95: {r.latency_p95_ms.toFixed(1)}ms</span>
              <span>P99: {r.latency_p99_ms.toFixed(1)}ms</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
