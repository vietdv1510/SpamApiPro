import { useRef, useEffect, useState, useCallback } from "react";
import { useAppStore, RequestResult } from "../store";

const MODE_LABELS: Record<string, string> = {
  burst: "Burst",
  constant: "Constant Load",
  ramp_up: "Ramp Up",
  stress_test: "Stress Test",
};

export function LiveMonitor() {
  const { runStatus, progress, liveTimeline, liveCounters, config } =
    useAppStore();
  const isRunning = runStatus === "running" || runStatus === "cancelling";
  const { done, success, errors, totalLatency } = liveCounters;
  const avgLatency = done > 0 ? totalLatency / done : 0;

  const [selectedRequest, setSelectedRequest] = useState<RequestResult | null>(
    null,
  );

  // Reset selection khi bắt đầu test mới
  useEffect(() => {
    if (runStatus === "running") {
      setSelectedRequest(null);
    }
  }, [runStatus]);

  // Auto-scroll logs
  const logsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logsRef.current && !selectedRequest) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [liveTimeline, selectedRequest]);

  // ⌨️ Keyboard navigation — Arrow Up/Down chuyển response
  const containerRef = useRef<HTMLDivElement>(null);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (liveTimeline.length === 0) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Escape")
        return;

      e.preventDefault(); // Ngăn scroll mặc định

      if (e.key === "Escape") {
        setSelectedRequest(null);
        return;
      }

      const currentIdx = selectedRequest
        ? liveTimeline.findIndex((r) => r.id === selectedRequest.id)
        : -1;

      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < liveTimeline.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : liveTimeline.length - 1;
      }

      const nextReq = liveTimeline[nextIdx];
      setSelectedRequest(nextReq);

      // Scroll entry đó vào view
      const el = logsRef.current?.children[nextIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [liveTimeline, selectedRequest],
  );

  if (runStatus === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="text-6xl opacity-20">🎯</div>
        <p className="text-gray-500 text-sm">
          Configure your test and click Fire to start
        </p>
        <p className="text-gray-600 text-xs font-mono">
          Powered by Rust + Tokio
        </p>
      </div>
    );
  }

  // Tên mode đúng
  const modeLabel = MODE_LABELS[config.mode] ?? config.mode;

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-4 h-full outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Progress Section */}
      {isRunning && (
        <div className="bg-bg-800 rounded-2xl p-4 border border-bg-600 slide-in">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full pulse-dot" />
              <span className="text-sm font-semibold text-primary">
                Live {modeLabel}
              </span>
            </div>
            <span className="text-xs font-mono text-gray-400">
              {done} done ({progress.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2 bg-bg-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full progress-bar-active transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Live Counters */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Done", value: done, color: "text-white" },
          { label: "Success", value: success, color: "text-success" },
          { label: "Errors", value: errors, color: "text-danger" },
          {
            label: "Avg ms",
            value: avgLatency.toFixed(1),
            color: "text-primary",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-bg-800 rounded-xl p-3 border border-bg-600 text-center"
          >
            <div className={`text-lg font-bold font-mono ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Response Detail Panel */}
      {selectedRequest && (
        <div className="bg-bg-800 rounded-xl border border-primary/30 overflow-hidden slide-in">
          <div className="px-4 py-2 border-b border-bg-600 flex justify-between items-center">
            <span className="text-xs font-mono text-primary">
              Response #{selectedRequest.id} —{" "}
              {selectedRequest.status_code ?? "ERR"} —{" "}
              {selectedRequest.latency_ms.toFixed(1)}ms
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600">
                ↑↓ navigate • Esc close
              </span>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-gray-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-bg-600 transition-colors"
              >
                ✕ Close
              </button>
            </div>
          </div>
          <pre className="p-4 text-xs font-mono text-gray-300 overflow-auto max-h-48 whitespace-pre-wrap break-all">
            {selectedRequest.response_body
              ? tryFormatJson(selectedRequest.response_body)
              : (selectedRequest.error ?? "No response body")}
          </pre>
        </div>
      )}

      {/* Live request log */}
      <div className="flex-1 bg-bg-800 rounded-xl border border-bg-600 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-bg-600 text-xs text-gray-500 font-mono flex justify-between">
          <span>
            LIVE REQUESTS{" "}
            {selectedRequest ? "" : "— click or ↑↓ to view response"}
          </span>
          <span>
            {done} total / {liveTimeline.length} displayed
          </span>
        </div>
        <div ref={logsRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {liveTimeline.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedRequest(r)}
              className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-colors ${
                selectedRequest?.id === r.id
                  ? "bg-primary/10 border border-primary/30"
                  : r.success
                    ? "hover:bg-bg-700"
                    : "bg-red-500/5 hover:bg-red-500/10"
              }`}
            >
              <span
                className={`w-4 text-center shrink-0 ${r.success ? "text-success" : "text-danger"}`}
              >
                {r.success ? "✓" : "✗"}
              </span>
              <span className="text-gray-400 w-12 text-center shrink-0">
                #{r.id}
              </span>
              <span
                className={`w-10 text-center font-semibold shrink-0 ${r.success ? "text-gray-300" : "text-red-400"}`}
              >
                {r.status_code ?? "ERR"}
              </span>
              <span className="text-gray-500 w-14 text-right shrink-0">
                {r.response_size_bytes > 0
                  ? `${(r.response_size_bytes / 1024).toFixed(1)}KB`
                  : "—"}
              </span>
              <span
                className={`w-20 text-right shrink-0 ${
                  r.latency_ms > 500
                    ? "text-red-400"
                    : r.latency_ms > 200
                      ? "text-amber-400"
                      : "text-success"
                }`}
              >
                {r.latency_ms.toFixed(1)}ms
              </span>
              <span className="text-gray-600 text-xs truncate ml-3 flex-1">
                {r.error
                  ? r.error
                  : r.response_body
                    ? r.response_body.substring(0, 80)
                    : ""}
              </span>
            </div>
          ))}
          {liveTimeline.length === 0 && isRunning && (
            <div className="flex items-center justify-center h-16 gap-2 text-gray-600 text-xs">
              <span className="w-3 h-3 border border-gray-600 border-t-primary rounded-full animate-spin" />
              Waiting for first response...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Try to format JSON, fallback to raw string */
function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
