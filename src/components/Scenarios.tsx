import { useState, useCallback, useEffect } from "react";
import { useAppStore, type HttpMethod, type TestMode } from "../store";
import { runLoadTest } from "../tauri";
import { invoke } from "@tauri-apps/api/core";

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

/** Saved scenario in DB */
interface SavedScenario {
  id: number;
  name: string;
  steps: ScenarioStep[];
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

// ─── SQLite Persistence ───
async function loadScenarios(): Promise<SavedScenario[]> {
  try {
    const rows =
      await invoke<{ id: number; name: string; steps_json: string }[]>(
        "get_scenarios",
      );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      steps: JSON.parse(r.steps_json),
    }));
  } catch {
    return [];
  }
}

async function saveScenarioToDB(
  name: string,
  steps: ScenarioStep[],
): Promise<number> {
  return await invoke<number>("save_scenario", {
    name,
    stepsJson: JSON.stringify(steps),
  });
}

async function updateScenarioInDB(
  id: number,
  name: string,
  steps: ScenarioStep[],
): Promise<void> {
  await invoke("update_scenario", {
    id,
    name,
    stepsJson: JSON.stringify(steps),
  });
}

async function deleteScenarioFromDB(id: number): Promise<void> {
  await invoke("delete_scenario", { id });
}

export function Scenarios() {
  const [steps, setSteps] = useState<ScenarioStep[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [scenarioName, setScenarioName] = useState("Untitled Scenario");
  const [currentScenarioId, setCurrentScenarioId] = useState<number | null>(
    null,
  );
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Load saved scenarios on mount
  useEffect(() => {
    loadScenarios().then(setSavedScenarios);
  }, []);

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

  /** Import from current config */
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

  /** Save to DB */
  const handleSave = async () => {
    try {
      if (currentScenarioId) {
        await updateScenarioInDB(currentScenarioId, scenarioName, steps);
      } else {
        const id = await saveScenarioToDB(scenarioName, steps);
        setCurrentScenarioId(id);
      }
      const updated = await loadScenarios();
      setSavedScenarios(updated);
    } catch (err) {
      console.error("Save scenario error:", err);
    }
  };

  /** Load from saved */
  const handleLoadScenario = (s: SavedScenario) => {
    setSteps(
      s.steps.map((st) => ({
        ...st,
        status: "pending" as const,
        summary: undefined,
      })),
    );
    setScenarioName(s.name);
    setCurrentScenarioId(s.id);
    setShowSaved(false);
  };

  /** Delete saved */
  const handleDeleteScenario = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteScenarioFromDB(id);
      const updated = await loadScenarios();
      setSavedScenarios(updated);
      if (currentScenarioId === id) {
        setCurrentScenarioId(null);
      }
    } catch (err) {
      console.error("Delete scenario error:", err);
    }
  };

  /** Run all steps */
  const runScenario = useCallback(async () => {
    if (steps.length === 0) return;
    setIsRunning(true);
    setRunLog([`▶ Starting scenario with ${steps.length} step(s)...`]);

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
                  summary: `${successRate.toFixed(0)}% · ${result.requests_per_second.toFixed(0)} RPS · P95: ${result.latency_p95_ms.toFixed(0)}ms`,
                }
              : st,
          ),
        );
        setRunLog((log) => [
          ...log,
          `  ${passed ? "✅" : "❌"} ${successRate.toFixed(0)}% success, ${result.requests_per_second.toFixed(0)} RPS`,
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
        <div className="flex flex-col gap-3 w-72">
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
          {savedScenarios.length > 0 && (
            <div className="border-t border-bg-700 pt-3 mt-1">
              <p className="text-[10px] text-gray-600 mb-2">Saved Scenarios</p>
              {savedScenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleLoadScenario(s)}
                  className="w-full px-3 py-2 rounded-lg text-xs text-left bg-bg-800 border border-bg-600 hover:border-bg-500 transition-colors mb-1 flex items-center justify-between group"
                >
                  <div>
                    <span className="text-gray-300">{s.name}</span>
                    <span className="text-gray-600 ml-2">
                      {s.steps.length} steps
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteScenario(s.id, e)}
                    className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                  >
                    ✕
                  </button>
                </button>
              ))}
            </div>
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
        <div className="flex items-center gap-3">
          <input
            className="bg-transparent text-sm text-gray-300 font-medium border-b border-transparent hover:border-bg-500 focus:border-primary/50 outline-none px-1 py-0.5 w-40"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name"
          />
          <span className="text-[10px] text-gray-600">
            {steps.length} step{steps.length > 1 ? "s" : ""}
          </span>
          <button
            onClick={addStep}
            className="text-[10px] px-2 py-1 rounded bg-bg-700 text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            + Add
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Save */}
          <button
            onClick={handleSave}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-bg-700 text-gray-400 hover:text-gray-200 hover:bg-bg-600 transition-colors font-medium"
          >
            💾 Save
          </button>
          {savedScenarios.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="text-[10px] px-2 py-1.5 rounded-lg bg-bg-700 text-gray-400 hover:text-gray-200 hover:bg-bg-600 transition-colors"
              >
                📂 Load
              </button>
              {showSaved && (
                <div className="absolute right-0 top-8 w-56 bg-bg-800 border border-bg-600 rounded-xl shadow-xl z-50 p-2 space-y-1 slide-in">
                  {savedScenarios.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleLoadScenario(s)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-bg-700 transition-colors text-xs flex justify-between items-center group"
                    >
                      <span className="text-gray-300">{s.name}</span>
                      <span className="text-gray-600">{s.steps.length}s</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* New */}
          <button
            onClick={() => {
              setSteps([]);
              setScenarioName("Untitled Scenario");
              setCurrentScenarioId(null);
              setRunLog([]);
            }}
            className="text-[10px] px-2 py-1.5 rounded-lg bg-bg-700 text-gray-500 hover:text-gray-300 hover:bg-bg-600 transition-colors"
          >
            New
          </button>
          {/* Run */}
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
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {steps.map((step, index) => {
          const isExpanded = expandedId === step.id;
          const statusBorder =
            step.status === "running"
              ? "border-primary/40"
              : step.status === "passed"
                ? "border-success/40"
                : step.status === "failed"
                  ? "border-red-500/40"
                  : "border-bg-600";

          // Status indicator — colored dot, not checkbox
          const statusDot =
            step.status === "running"
              ? "bg-primary animate-pulse"
              : step.status === "passed"
                ? "bg-success"
                : step.status === "failed"
                  ? "bg-red-500"
                  : step.status === "skipped"
                    ? "bg-gray-600"
                    : "bg-bg-500";

          return (
            <div
              key={step.id}
              className={`bg-bg-800 border ${statusBorder} rounded-xl overflow-hidden transition-all`}
            >
              {/* Step header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-700/50 transition-colors group"
                onClick={() => setExpandedId(isExpanded ? null : step.id)}
              >
                {/* Status dot */}
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`}
                />

                <span className="text-xs text-gray-600 font-mono w-5 shrink-0">
                  {index + 1}.
                </span>
                <span
                  className={`text-xs font-mono font-bold shrink-0 ${METHOD_COLORS[step.method] || "text-gray-400"}`}
                >
                  {step.method}
                </span>
                <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                  {step.url || "(no URL)"}
                </span>
                {step.summary && (
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">
                    {step.summary}
                  </span>
                )}

                {/* Action icons — always visible, white */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Move up */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index > 0)
                        setSteps(moveItem(steps, index, index - 1));
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-bg-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Move up"
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  {/* Move down */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index < steps.length - 1)
                        setSteps(moveItem(steps, index, index + 1));
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-bg-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Move down"
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {/* Duplicate */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateStep(step.id);
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-bg-600 transition-colors"
                    title="Duplicate"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStep(step.id);
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  {/* Expand chevron */}
                  <svg
                    className={`w-3.5 h-3.5 text-gray-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-bg-600 px-4 py-3 space-y-3 slide-in">
                  {/* Name */}
                  <input
                    className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:border-primary/50 outline-none"
                    placeholder="Step name"
                    value={step.name}
                    onChange={(e) =>
                      updateStep(step.id, { name: e.target.value })
                    }
                  />

                  {/* Method + URL */}
                  <div className="flex gap-2">
                    <select
                      className="w-24 bg-bg-700 border border-bg-500 rounded-lg px-2 py-1.5 text-xs font-mono text-gray-200"
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

                  {/* VUs + Mode + Delay */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-600 mb-1 block">
                        Requests / VUs
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
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-2 py-1.5 text-xs text-gray-200"
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
                        Delay After (ms)
                      </label>
                      <input
                        type="number"
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-primary/50"
                        value={step.think_time_ms}
                        min={0}
                        step={100}
                        placeholder="0"
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
                          updateStep(step.id, { body: e.target.value || null })
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
