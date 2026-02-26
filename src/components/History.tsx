import { useAppStore } from "../store";

export function History() {
  const { history } = useAppStore();

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl opacity-20 mb-4">📋</div>
          <p className="text-gray-500 text-sm">No test history yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full space-y-2">
      {history.map((entry, i) => {
        const r = entry.result;
        const successRate =
          r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0;

        return (
          <div
            key={i}
            className="bg-bg-800 border border-bg-600 rounded-xl p-4 hover:border-bg-500 transition-all cursor-pointer group"
            onClick={() => {
              const store = useAppStore.getState();
              store.setCurrentResult(r);
              store.setActiveTab("results");
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {entry.config.method}
                  </span>
                  <span className="text-sm font-mono text-gray-300 truncate">
                    {entry.config.url}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>🕐 {entry.timestamp}</span>
                  <span>👥 {entry.config.virtual_users} VUs</span>
                  <span>⚡ {r.requests_per_second.toFixed(0)} RPS</span>
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
