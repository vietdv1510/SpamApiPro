import { useState, useCallback } from "react";
import { useAppStore, type HttpMethod, type TestMode } from "../store";
import { runLoadTest } from "../tauri";

/** Một bước trong scenario */
interface ScenarioStep {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
  virtual_users: number;
  mode: TestMode;
  timeout_ms: number;
  think_time_ms: number;
  duration_secs: number | null;
  iterations: number | null;
  /** Trạng thái chạy */
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  /** Kết quả tóm tắt */
  summary?: string;
}

function createStep(name?: string): ScenarioStep {
  return {
    id: crypto.randomUUID(),
    name: name || `Step ${Date.now() % 1000}`,
    url: "",
    method: "GET",
    headers: {},
    body: null,
    virtual_users: 10,
    mode: "burst",
    timeout_ms: 10000,
    think_time_ms: 0,
    duration_secs: null,
    iterations: 1,
    status: "pending",
  };
}

/** Kéo thả step thay đổi thứ tự */
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const METHOD_COLORS: Record<string, string> = {
  GET: "text-success",
  POST: "text-primary",
  PUT: "text-amber-400",
  DELETE: "text-danger",
  PATCH: "text-purple-400",
};

export function Scenarios() {
  const [steps, setSteps] = useState<ScenarioStep[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);

  const addStep = () => {
    const step = createStep(`Step ${steps.length + 1}`);
    setSteps((s) => [...s, step]);
    setExpandedId(step.id);
  };

  const removeStep = (id: string) => {
    setSteps((s) => s.filter((st) => st.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateStep = (id: string, patch: Partial<ScenarioStep>) => {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
  };

  const duplicateStep = (id: string) => {
    const original = steps.find((s) => s.id === id);
    if (!original) return;
    const copy = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      status: "pending" as const,
      summary: undefined,
    };
    setSteps((s) => {
      const idx = s.findIndex((st) => st.id === id);
      const arr = [...s];
      arr.splice(idx + 1, 0, copy);
      return arr;
    });
  };

  /** Load từ current config */
  const importFromConfig = () => {
    const config = useAppStore.getState().config;
    const headers = useAppStore.getState().getEffectiveHeaders();
    const step: ScenarioStep = {
      ...createStep(`Step ${steps.length + 1}`),
      url: config.url,
      method: config.method,
      headers,
      body: config.body,
      virtual_users: config.virtual_users,
      mode: config.mode,
      timeout_ms: config.timeout_ms,
    };
    setSteps((s) => [...s, step]);
    setExpandedId(step.id);
  };

  /** Chạy tất cả steps tuần tự */
  const runScenario = useCallback(async () => {
    if (steps.length === 0) return;
    setIsRunning(true);
    setRunLog([`▶ Starting scenario with ${steps.length} step(s)...`]);

    // Reset all statuses
    setSteps((s) =>
      s.map((st) => ({
        ...st,
        status: "pending" as const,
        summary: undefined,
      })),
    );

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setSteps((s) =>
        s.map((st) => (st.id === step.id ? { ...st, status: "running" } : st)),
      );
      setRunLog((log) => [
        ...log,
        `[${i + 1}/${steps.length}] Running "${step.name}" → ${step.method} ${step.url}`,
      ]);

      if (!step.url.trim()) {
        setSteps((s) =>
          s.map((st) =>
            st.id === step.id
              ? { ...st, status: "skipped", summary: "No URL configured" }
              : st,
          ),
        );
        setRunLog((log) => [...log, `  ⏭ Skipped — no URL`]);
        continue;
      }

      try {
        const config = {
          url: step.url,
          method: step.method,
          headers: step.headers,
          body: step.body?.trim() || null,
          virtual_users: step.virtual_users,
          mode: step.mode,
          timeout_ms: step.timeout_ms,
          think_time_ms: step.think_time_ms,
          duration_secs: step.duration_secs,
          iterations: step.iterations,
        };

        const result = await runLoadTest(config, () => {});

        const successRate =
          result.total_requests > 0
            ? (result.success_count / result.total_requests) * 100
            : 0;
        const passed = successRate >= 95;

        setSteps((s) =>
          s.map((st) =>
            st.id === step.id
              ? {
                  ...st,
                  status: passed ? "passed" : "failed",
                  summary: `${successRate.toFixed(0)}% ok · ${result.requests_per_second.toFixed(0)} RPS · P95: ${result.latency_p95_ms.toFixed(0)}ms`,
                }
              : st,
          ),
        );
        setRunLog((log) => [
          ...log,
          `  ${passed ? "✅" : "❌"} ${successRate.toFixed(0)}% success, ${result.requests_per_second.toFixed(0)} RPS, P95=${result.latency_p95_ms.toFixed(0)}ms`,
        ]);
      } catch (err) {
        setSteps((s) =>
          s.map((st) =>
            st.id === step.id
              ? { ...st, status: "failed", summary: String(err) }
              : st,
          ),
        );
        setRunLog((log) => [...log, `  💥 Error: ${err}`]);
      }

      // Think time between steps
      if (step.think_time_ms > 0 && i < steps.length - 1) {
        setRunLog((log) => [...log, `  ⏳ Wait ${step.think_time_ms}ms...`]);
        await new Promise((r) => setTimeout(r, step.think_time_ms));
      }
    }

    setRunLog((log) => [...log, `✅ Scenario complete!`]);
    setIsRunning(false);
  }, [steps]);

  // ─── Empty state ───
  if (steps.length === 0) {
    const currentConfig = useAppStore.getState().config;
    const hasConfig = currentConfig.url.trim().length > 0;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
        <div className="text-6xl opacity-20">🔗</div>
        <div>
          <p className="text-gray-400 text-sm font-medium">
            Multi-Step Scenarios
          </p>
          <p className="text-gray-600 text-xs mt-1 max-w-xs">
            Chain multiple API calls in sequence. Each step runs after the
            previous one completes.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-64">
          <button
            onClick={addStep}
            className="px-4 py-2.5 rounded-lg text-xs font-medium bg-bg-700 text-gray-400 border border-bg-500 hover:bg-bg-600 hover:text-gray-200 transition-colors"
          >
            + Add Blank Step
          </button>
          {hasConfig && (
            <button
              onClick={importFromConfig}
              className="px-4 py-2.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <span>📥</span>
                <span className="font-bold">Import from Test Config</span>
              </div>
              <div className="text-[10px] text-primary/60 font-mono truncate pl-5">
                {currentConfig.method} {currentConfig.url}
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Main UI ───
  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">
            {steps.length} step{steps.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={addStep}
            className="text-[10px] px-2 py-1 rounded bg-bg-700 text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            + Blank
          </button>
          <button
            onClick={importFromConfig}
            className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary/70 hover:text-primary hover:bg-primary/20 transition-colors font-medium"
            title={`Import: ${useAppStore.getState().config.method} ${useAppStore.getState().config.url}`}
          >
            📥 Import Config
          </button>
        </div>
        <button
          onClick={runScenario}
          disabled={isRunning}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
            isRunning
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-primary to-secondary text-bg-900 hover:scale-105"
          }`}
        >
          {isRunning ? "⏳ Running..." : "▶ Run All"}
        </button>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {steps.map((step, index) => {
          const isExpanded = expandedId === step.id;
          const statusIcon =
            step.status === "running"
              ? "⏳"
              : step.status === "passed"
                ? "✅"
                : step.status === "failed"
                  ? "❌"
                  : step.status === "skipped"
                    ? "⏭"
                    : "⬜";
          const statusBorder =
            step.status === "running"
              ? "border-primary/40"
              : step.status === "passed"
                ? "border-success/40"
                : step.status === "failed"
                  ? "border-red-500/40"
                  : "border-bg-600";

          return (
            <div
              key={step.id}
              className={`bg-bg-800 border ${statusBorder} rounded-xl overflow-hidden transition-all`}
            >
              {/* Step header */}
              <div
                className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-bg-700/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : step.id)}
              >
                <span className="text-sm">{statusIcon}</span>
                <span className="text-xs text-gray-600 font-mono w-6">
                  {index + 1}.
                </span>
                <span
                  className={`text-xs font-mono font-bold ${METHOD_COLORS[step.method] || "text-gray-400"}`}
                >
                  {step.method}
                </span>
                <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                  {step.url || "(no URL)"}
                </span>
                {step.summary && (
                  <span className="text-[10px] text-gray-500 font-mono">
                    {step.summary}
                  </span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index > 0)
                        setSteps(moveItem(steps, index, index - 1));
                    }}
                    className="text-gray-600 hover:text-gray-300 text-[10px] px-1"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index < steps.length - 1)
                        setSteps(moveItem(steps, index, index + 1));
                    }}
                    className="text-gray-600 hover:text-gray-300 text-[10px] px-1"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateStep(step.id);
                  }}
                  className="text-gray-700 hover:text-primary text-[10px] px-1"
                  title="Duplicate"
                >
                  ⧉
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeStep(step.id);
                  }}
                  className="text-gray-700 hover:text-red-400 text-xs px-1"
                  title="Delete"
                >
                  ✕
                </button>
                <span className="text-gray-700 text-xs">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-bg-600 px-4 py-3 space-y-3 slide-in">
                  {/* Name */}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:border-primary/50 outline-none"
                      placeholder="Step name"
                      value={step.name}
                      onChange={(e) =>
                        updateStep(step.id, { name: e.target.value })
                      }
                    />
                  </div>

                  {/* Method + URL */}
                  <div className="flex gap-2">
                    <select
                      className="w-24 bg-bg-700 border border-bg-500 rounded-lg px-2 py-1.5 text-xs font-mono text-gray-200 focus:border-primary/50 outline-none"
                      value={step.method}
                      onChange={(e) =>
                        updateStep(step.id, {
                          method: e.target.value as HttpMethod,
                        })
                      }
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <input
                      className="flex-1 bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:border-primary/50 outline-none"
                      placeholder="https://api.example.com/endpoint"
                      value={step.url}
                      onChange={(e) =>
                        updateStep(step.id, { url: e.target.value })
                      }
                    />
                  </div>

                  {/* VUs + Mode */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-600 mb-1 block">
                        Virtual Users / Requests
                      </label>
                      <input
                        type="number"
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-primary/50"
                        value={step.virtual_users}
                        min={1}
                        onChange={(e) =>
                          updateStep(step.id, {
                            virtual_users: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-600 mb-1 block">
                        Mode
                      </label>
                      <select
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-primary/50"
                        value={step.mode}
                        onChange={(e) =>
                          updateStep(step.id, {
                            mode: e.target.value as TestMode,
                          })
                        }
                      >
                        <option value="burst">Burst</option>
                        <option value="constant">Constant</option>
                        <option value="ramp_up">Ramp Up</option>
                        <option value="stress_test">Stress Test</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-600 mb-1 block">
                        Think Time (ms)
                      </label>
                      <input
                        type="number"
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-primary/50"
                        value={step.think_time_ms}
                        min={0}
                        onChange={(e) =>
                          updateStep(step.id, {
                            think_time_ms: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Body */}
                  {(step.method === "POST" ||
                    step.method === "PUT" ||
                    step.method === "PATCH") && (
                    <div>
                      <label className="text-[10px] text-gray-600 mb-1 block">
                        Request Body (JSON)
                      </label>
                      <textarea
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 outline-none focus:border-primary/50 resize-none"
                        rows={3}
                        placeholder='{"key": "value"}'
                        value={step.body || ""}
                        onChange={(e) =>
                          updateStep(step.id, {
                            body: e.target.value || null,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Run Log */}
      {runLog.length > 0 && (
        <div className="shrink-0 max-h-40 bg-bg-800 border border-bg-600 rounded-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-bg-600 flex justify-between items-center">
            <span className="text-[10px] text-gray-500 font-mono uppercase">
              Run Log
            </span>
            <button
              onClick={() => setRunLog([])}
              className="text-[10px] text-gray-700 hover:text-gray-400"
            >
              Clear
            </button>
          </div>
          <div className="p-3 overflow-y-auto max-h-28 space-y-0.5">
            {runLog.map((line, i) => (
              <div key={i} className="text-[11px] font-mono text-gray-400">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
