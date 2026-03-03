import { useEffect, useState } from "react";
import { useAppStore, type HistoryItem } from "../store";
import { deleteHistoryEntry, clearAllHistory } from "../tauri";
import { loadHistoryFromDB } from "../hooks/useTestRunner";
import { ResultsDashboard } from "./ResultsDashboard";
import {
  exportResultJson,
  exportResultCsv,
  exportComparisonCsv,
  comparisonRows,
} from "../utils/exportResults";

// ─── Compare View ───
function CompareView({
  a,
  b,
  onClose,
}: {
  a: HistoryItem;
  b: HistoryItem;
  onClose: () => void;
}) {
  const rows = comparisonRows(a.result, b.result);

  const deltaColor = (val: string, lower = true) => {
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return "text-gray-500";
    return lower
      ? n > 0
        ? "text-red-400"
        : "text-green-400"
      : n > 0
        ? "text-green-400"
        : "text-red-400";
  };

  const isLowerBetter = (label: string) =>
    label.toLowerCase().includes("error") ||
    label.toLowerCase().includes("latency") ||
    label.toLowerCase().includes("race") ||
    label.toLowerCase().includes("duration");

  const isHigherBetter = (label: string) =>
    label.toLowerCase().includes("success") ||
    label.toLowerCase().includes("rps");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 mb-3 border-b border-bg-700 shrink-0">
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
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
        <span className="text-xs font-semibold text-gray-300">
          Compare Runs
        </span>
        <button
          onClick={() => exportComparisonCsv(a, b)}
          className="ml-auto text-[10px] px-2 py-1 rounded bg-primary/10 text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Run labels */}
      <div className="grid grid-cols-3 gap-2 mb-3 shrink-0">
        <div />
        <div className="bg-bg-700 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-600 uppercase mb-0.5">Run A</div>
          <div className="text-[10px] font-mono text-primary truncate">
            {a.url}
          </div>
          <div className="text-[9px] text-gray-500">{a.timestamp}</div>
        </div>
        <div className="bg-bg-700 rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-600 uppercase mb-0.5">Run B</div>
          <div className="text-[10px] font-mono text-primary truncate">
            {b.url}
          </div>
          <div className="text-[9px] text-gray-500">{b.timestamp}</div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-600 uppercase border-b border-bg-700">
              <th className="text-left py-1 font-medium">Metric</th>
              <th className="text-right py-1 font-medium">Run A</th>
              <th className="text-right py-1 font-medium">Run B</th>
              <th className="text-right py-1 font-medium pr-1">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, va, vb, , pct]) => (
              <tr
                key={label}
                className="border-b border-bg-700/50 hover:bg-bg-700/30 transition-colors"
              >
                <td className="py-1.5 text-gray-500 text-[11px]">{label}</td>
                <td className="py-1.5 text-right font-mono text-gray-300">
                  {va}
                </td>
                <td className="py-1.5 text-right font-mono text-gray-300">
                  {vb}
                </td>
                <td
                  className={`py-1.5 text-right font-mono font-bold pr-1 ${deltaColor(
                    pct,
                    isLowerBetter(label) && !isHigherBetter(label),
                  )}`}
                >
                  {pct}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main History Component ───

export function History() {
  const { history } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HistoryItem | null>(null);
  const [compareA, setCompareA] = useState<HistoryItem | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadHistoryFromDB().finally(() => setLoading(false));
  }, []);

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
      if (selectedEntry?.id === id) setSelectedEntry(null);
      if (compareA?.id === id) setCompareA(null);
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
      setCompareA(null);
      setCompareMode(false);
    } catch (err) {
      console.error("Clear history error:", err);
    }
  };

  const handleReuseConfig = (entry: HistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useAppStore.getState();
    store.applyParsedConfig(entry.config);
    store.setActiveSection("test");
    store.setActiveTab("test");
  };

  // ─── Compare mode: pick second run ───
  if (compareMode && compareA) {
    const candidates = history.filter((h) => h.id !== compareA.id);
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-bg-700 shrink-0">
          <button
            onClick={() => {
              setCompareMode(false);
              setCompareA(null);
            }}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
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
            Cancel
          </button>
          <span className="text-xs text-gray-400">
            Select Run B to compare with{" "}
            <span className="text-primary font-mono">
              {compareA.url.slice(0, 30)}
            </span>
          </span>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {candidates.map((entry) => (
            <div
              key={entry.id}
              onClick={() => {
                setCompareMode(false);
                setSelectedEntry({
                  ...entry,
                  _compareWith: compareA,
                } as HistoryItem & { _compareWith: HistoryItem });
              }}
              className="bg-bg-800 border border-bg-600 rounded-xl p-3 hover:border-primary/40 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {entry.method}
                </span>
                <span className="text-xs font-mono text-gray-300 truncate">
                  {entry.url}
                </span>
              </div>
              <div className="text-[10px] text-gray-600 mt-1">
                {entry.timestamp} ·{" "}
                {entry.result.requests_per_second.toFixed(0)} RPS · P95:{" "}
                {entry.result.latency_p95_ms.toFixed(1)}ms
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Detail + Compare view ───
  if (selectedEntry) {
    const compareWith = (
      selectedEntry as HistoryItem & { _compareWith?: HistoryItem }
    )._compareWith;
    if (compareWith) {
      return (
        <CompareView
          a={compareWith}
          b={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      );
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
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

          {/* Export buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => exportResultJson(selectedEntry)}
              className="text-[10px] px-2 py-1 rounded bg-bg-700 text-gray-500 hover:text-gray-300 hover:bg-bg-600 transition-colors border border-bg-500"
              title="Export as JSON"
            >
              ↓ JSON
            </button>
            <button
              onClick={() => exportResultCsv(selectedEntry)}
              className="text-[10px] px-2 py-1 rounded bg-bg-700 text-gray-500 hover:text-gray-300 hover:bg-bg-600 transition-colors border border-bg-500"
              title="Export as CSV"
            >
              ↓ CSV
            </button>
            <button
              onClick={(e) => handleReuseConfig(selectedEntry, e)}
              className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors font-medium"
            >
              🔄 Reuse
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ResultsDashboard result={selectedEntry.result} />
        </div>
      </div>
    );
  }

  // ─── List view ───
  return (
    <div className="overflow-y-auto h-full space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 font-medium">
          {history.length} test{history.length > 1 ? "s" : ""} saved
        </span>
        <div className="flex items-center gap-2">
          {compareMode && !compareA && (
            <span className="text-[10px] text-amber-400 animate-pulse">
              Select Run A…
            </span>
          )}
          <button
            onClick={() => {
              setCompareMode((v) => !v);
              setCompareA(null);
            }}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              compareMode
                ? "text-primary bg-primary/10 border border-primary/30"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            ⚖️ Compare
          </button>
          <button
            onClick={handleClearAll}
            className="text-[10px] text-gray-600 hover:text-red-400 transition-colors px-2 py-0.5 rounded hover:bg-red-500/10"
          >
            Clear all
          </button>
        </div>
      </div>

      {history.map((entry) => {
        const r = entry.result;
        const successRate =
          r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0;
        const isCompareA = compareA?.id === entry.id;

        return (
          <div
            key={entry.id}
            className={`bg-bg-800 border rounded-xl p-4 transition-all cursor-pointer group relative ${
              isCompareA
                ? "border-primary/60 bg-primary/5"
                : compareMode
                  ? "border-bg-600 hover:border-primary/40"
                  : "border-bg-600 hover:border-bg-500"
            }`}
            onClick={() => {
              if (compareMode && !compareA) {
                setCompareA(entry);
              } else if (!compareMode) {
                setSelectedEntry(entry);
              }
            }}
          >
            {/* Action buttons */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              {!compareMode && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportResultJson(entry);
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-600 text-gray-600 hover:text-gray-300 hover:bg-bg-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Export JSON"
                  >
                    ↓ JSON
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportResultCsv(entry);
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-600 text-gray-600 hover:text-gray-300 hover:bg-bg-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Export CSV"
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={(e) => handleReuseConfig(entry, e)}
                    className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors font-medium"
                    title="Load this config into the editor"
                  >
                    🔄 Reuse
                  </button>
                </>
              )}
              {compareMode && (
                <span className="text-[10px] text-primary/50">
                  {isCompareA ? "✓ Run A" : "Click to select"}
                </span>
              )}
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
