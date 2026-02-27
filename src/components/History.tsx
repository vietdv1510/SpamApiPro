import { useEffect, useState } from "react";
import { useAppStore, type HistoryItem } from "../store";
import { deleteHistoryEntry, clearAllHistory } from "../tauri";
import { loadHistoryFromDB } from "../hooks/useTestRunner";
import { ResultsDashboard } from "./ResultsDashboard";

export function History() {
  const { history } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HistoryItem | null>(null);

  // Load history từ SQLite khi mount
  useEffect(() => {
    setLoading(true);
    loadHistoryFromDB().finally(() => setLoading(false));
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-gray-500 text-sm">
        <span className="w-4 h-4 border-2 border-gray-600 border-t-primary rounded-full animate-spin" />
        Loading history…
      </div>
    );
  }

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
      // Nếu đang xem entry bị xóa → đóng detail
      if (selectedEntry?.id === id) setSelectedEntry(null);
    } catch (err) {
      console.error("Delete history error:", err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all test history?")) return;
    try {
      await clearAllHistory();
      await loadHistoryFromDB();
      setSelectedEntry(null);
    } catch (err) {
      console.error("Clear history error:", err);
    }
  };

  /** Reuse Config — nạp lại config từ history vào form */
  const handleReuseConfig = (entry: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useAppStore.getState();
    store.applyParsedConfig(entry.config);
    store.setActiveSection("test");
    store.setActiveTab("test");
  };

  // ─── Detail view — khi click vào 1 entry ───
  if (selectedEntry) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Back bar */}
        <div className="flex items-center gap-3 pb-3 mb-3 border-b border-bg-700 shrink-0">
          <button
            onClick={() => setSelectedEntry(null)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
              {selectedEntry.method}
            </span>
            <span className="text-xs font-mono text-gray-400 truncate">
              {selectedEntry.url}
            </span>
          </div>
          <span className="text-[10px] text-gray-600 shrink-0">
            🕐 {selectedEntry.timestamp}
          </span>
          <button
            onClick={(e) => handleReuseConfig(selectedEntry, e)}
            className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors font-medium shrink-0"
          >
            🔄 Reuse Config
          </button>
        </div>

        {/* Inline result dashboard */}
        <div className="flex-1 overflow-hidden">
          <ResultsDashboard result={selectedEntry.result} />
        </div>
      </div>
    );
  }

  // ─── List view ───
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
            onClick={() => setSelectedEntry(entry)}
          >
            {/* Action buttons */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <button
                onClick={(e) => handleReuseConfig(entry, e)}
                className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors font-medium"
                title="Load this config into the editor"
              >
                🔄 Reuse
              </button>
              <button
                onClick={(e) => handleDelete(entry.id, e)}
                className="text-gray-700 hover:text-red-400 text-xs p-1 rounded hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                ✕
              </button>
            </div>

            <div className="flex justify-between items-start pr-20">
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
              <span>Duration: {(r.total_duration_ms / 1000).toFixed(2)}s</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
