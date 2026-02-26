import { useRef, useEffect } from "react";
import { useAppStore } from "../store";

export function LiveMonitor() {
  const { runStatus, progress, liveTimeline, config } = useAppStore();
  const isRunning = runStatus === "running";
  const total = config.virtual_users;
  const done = liveTimeline.length;
  const success = liveTimeline.filter((r) => r.success).length;
  const errors = liveTimeline.filter((r) => !r.success).length;
  const avgLatency =
    done > 0 ? liveTimeline.reduce((s, r) => s + r.latency_ms, 0) / done : 0;

  const logsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [liveTimeline]);

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

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Progress Section */}
      {isRunning && (
        <div className="bg-bg-800 rounded-2xl p-4 border border-bg-600 slide-in">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full pulse-dot" />
              <span className="text-sm font-semibold text-primary">
                Live Burst
              </span>
            </div>
            <span className="text-xs font-mono text-gray-400">
              {done}/{total} ({progress.toFixed(1)}%)
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

      {/* Live request log */}
      <div className="flex-1 bg-bg-800 rounded-xl border border-bg-600 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-bg-600 text-xs text-gray-500 font-mono flex justify-between">
          <span>LIVE REQUESTS</span>
          <span>{liveTimeline.length} captured</span>
        </div>
        <div
          ref={logsRef}
          className="flex-1 overflow-y-auto p-2 space-y-0.5"
          style={{ maxHeight: "280px" }}
        >
          {liveTimeline.slice(-100).map((r) => (
            <div
              key={r.id}
              className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-xs font-mono ${
                r.success
                  ? "hover:bg-bg-700"
                  : "bg-red-500/5 hover:bg-red-500/10"
              }`}
            >
              <span
                className={`w-4 text-center ${r.success ? "text-success" : "text-danger"}`}
              >
                {r.success ? "✓" : "✗"}
              </span>
              <span className="text-gray-400 w-6 text-center">#{r.id}</span>
              <span
                className={`w-12 text-center font-semibold ${r.success ? "text-gray-300" : "text-red-400"}`}
              >
                {r.status_code ?? "ERR"}
              </span>
              <span
                className={`w-20 text-right ${
                  r.latency_ms > 500
                    ? "text-red-400"
                    : r.latency_ms > 200
                      ? "text-amber-400"
                      : "text-success"
                }`}
              >
                {r.latency_ms.toFixed(1)}ms
              </span>
              {r.error && (
                <span className="text-red-400 text-xs truncate ml-2 flex-1">
                  {r.error}
                </span>
              )}
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
