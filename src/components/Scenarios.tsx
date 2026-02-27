import { useState, useCallback, useEffect } from "react";
import { useAppStore, type HttpMethod, type TestMode } from "../store";
import { runLoadTest, parseCurl } from "../tauri";
import { invoke } from "@tauri-apps/api/core";
import { confirmDialog, showToast } from "./Dialogs";

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
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  summary?: string;
}

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

// ─── SVG Icon Components ───
function IconSave() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}
function IconImport() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IconTerminal() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconCopy() {
  return (
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
  );
}
function IconX() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function IconUp() {
  return (
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
  );
}
function IconDown() {
  return (
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
  );
}

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
  const scenariosView = useAppStore((s) => s.scenariosView);
  const scenariosDirty = useAppStore((s) => s.scenariosDirty);
  const [steps, setSteps] = useState<ScenarioStep[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [_runLog, setRunLog] = useState<string[]>([]);

  interface StepResult {
    stepName: string;
    method: string;
    url: string;
    status: "running" | "passed" | "failed" | "skipped";
    successRate?: number;
    rps?: number;
    p95?: number;
    totalReqs?: number;
    error?: string;
  }
  const [runResults, setRunResults] = useState<StepResult[]>([]);
  const [scenarioStatus, setScenarioStatus] = useState<
    "idle" | "running" | "passed" | "failed"
  >("idle");
  const [scenarioName, setScenarioName] = useState("Untitled Scenario");
  const [currentScenarioId, setCurrentScenarioId] = useState<number | null>(
    null,
  );
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [curlInput, setCurlInput] = useState<string | null>(null);

  const markDirty = () => useAppStore.getState().setScenariosDirty(true);

  useEffect(() => {
    loadScenarios().then(setSavedScenarios);
  }, []);

  const enterEditor = () => useAppStore.getState().setScenariosView("editor");
  const backToList = () => useAppStore.getState().setScenariosView("list");

  const addStep = () => {
    const step = createStep(`Step ${steps.length + 1}`);
    setSteps((s) => [...s, step]);
    setExpandedId(step.id);
    markDirty();
    enterEditor();
  };

  const removeStep = async (id: string) => {
    const ok = await confirmDialog("Delete this step?");
    if (!ok) return;
    setSteps((s) => s.filter((st) => st.id !== id));
    if (expandedId === id) setExpandedId(null);
    markDirty();
  };

  const updateStep = (id: string, patch: Partial<ScenarioStep>) => {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
    markDirty();
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
    markDirty();
  };

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
    markDirty();
    enterEditor();
  };

  /** Import from cURL command into a step */
  const importCurlToStep = async (stepId: string, curl: string) => {
    try {
      const parsed = await parseCurl(curl);
      updateStep(stepId, {
        url: parsed.url,
        method: parsed.method as HttpMethod,
        headers: parsed.headers || {},
        body: parsed.body || null,
      });
      setCurlInput(null);
      showToast("cURL imported successfully");
    } catch (err) {
      showToast(`Invalid cURL: ${err}`);
    }
  };

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
      useAppStore.getState().setScenariosDirty(false);
      showToast(`Scenario "${scenarioName}" saved!`);
    } catch (err) {
      console.error("Save scenario error:", err);
      showToast("Failed to save scenario");
    }
  };

  const handleLoadScenario = async (s: SavedScenario) => {
    if (steps.length > 0 && useAppStore.getState().scenariosDirty) {
      const ok = await confirmDialog("Discard current unsaved changes?");
      if (!ok) return;
    }
    setSteps(
      s.steps.map((st) => ({
        ...st,
        status: "pending" as const,
        summary: undefined,
      })),
    );
    setScenarioName(s.name);
    setCurrentScenarioId(s.id);
    useAppStore.getState().setScenariosDirty(false);
    enterEditor();
    showToast(`Loaded "${s.name}"`);
  };

  const handleDeleteScenario = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog("Delete this saved scenario?");
    if (!ok) return;
    try {
      await deleteScenarioFromDB(id);
      const updated = await loadScenarios();
      setSavedScenarios(updated);
      if (currentScenarioId === id) setCurrentScenarioId(null);
      showToast("Scenario deleted");
    } catch (err) {
      console.error("Delete scenario error:", err);
    }
  };

  const runScenario = useCallback(async () => {
    if (steps.length === 0) return;
    setIsRunning(true);
    setScenarioStatus("running");
    setRunLog([]);
    setRunResults(
      steps.map((s) => ({
        stepName: s.name,
        method: s.method,
        url: s.url,
        status: "running" as const,
      })),
    );
    setSteps((s) =>
      s.map((st) => ({
        ...st,
        status: "pending" as const,
        summary: undefined,
      })),
    );

    let allPassed = true;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setSteps((s) =>
        s.map((st) => (st.id === step.id ? { ...st, status: "running" } : st)),
      );
      setRunResults((prev) =>
        prev.map((r, idx) =>
          idx === i ? { ...r, status: "running" as const } : r,
        ),
      );

      if (!step.url.trim()) {
        setSteps((s) =>
          s.map((st) =>
            st.id === step.id
              ? { ...st, status: "skipped", summary: "No URL" }
              : st,
          ),
        );
        setRunResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "skipped" as const } : r,
          ),
        );
        continue;
      }

      try {
        const result = await runLoadTest(
          {
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
          },
          () => {},
        );

        const successRate =
          result.total_requests > 0
            ? (result.success_count / result.total_requests) * 100
            : 0;
        const passed = successRate >= 95;
        if (!passed) allPassed = false;

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
        setRunResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: passed
                    ? "passed"
                    : ("failed" as StepResult["status"]),
                  successRate,
                  rps: result.requests_per_second,
                  p95: result.latency_p95_ms,
                  totalReqs: result.total_requests,
                }
              : r,
          ),
        );
      } catch (err) {
        allPassed = false;
        setSteps((s) =>
          s.map((st) =>
            st.id === step.id
              ? { ...st, status: "failed", summary: String(err) }
              : st,
          ),
        );
        setRunResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "failed" as const,
                  error: String(err),
                }
              : r,
          ),
        );
      }

      if (step.think_time_ms > 0 && i < steps.length - 1) {
        await new Promise((r) => setTimeout(r, step.think_time_ms));
      }
    }
    setScenarioStatus(allPassed ? "passed" : "failed");
    setIsRunning(false);
    showToast(allPassed ? "Scenario passed! ✅" : "Scenario has failures ⚠️");
  }, [steps]);

  // ─── LIST VIEW ───
  if (scenariosView === "list") {
    const currentConfig = useAppStore.getState().config;
    const hasConfig = currentConfig.url.trim().length > 0;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
        <div className="opacity-20">
          <svg
            className="w-16 h-16 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5" cy="6" r="3" />
            <circle cx="19" cy="6" r="3" />
            <circle cx="12" cy="18" r="3" />
            <line x1="5" y1="9" x2="12" y2="15" />
            <line x1="19" y1="9" x2="12" y2="15" />
          </svg>
        </div>
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
            className="px-4 py-2.5 rounded-lg text-xs font-medium bg-bg-700 text-gray-400 border border-bg-500 hover:bg-bg-600 hover:text-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus /> Add Blank Step
          </button>
          {hasConfig && (
            <button
              onClick={importFromConfig}
              className="px-4 py-2.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <IconImport />
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
                  <span
                    onClick={(e) => handleDeleteScenario(s.id, e)}
                    className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <IconX />
                  </span>
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
      <div className="flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={async () => {
              if (scenariosDirty) {
                const ok = await confirmDialog(
                  "You have unsaved changes. Go back to list?",
                );
                if (!ok) return;
                useAppStore.getState().setScenariosDirty(false);
              }
              backToList();
            }}
            className="text-[10px] px-2 py-1 rounded text-gray-500 hover:text-white hover:bg-bg-600 transition-colors flex items-center gap-1"
            title="Back to scenario list"
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
              <polyline points="15 18 9 12 15 6" />
            </svg>
            List
          </button>
          <input
            className="bg-transparent text-sm text-gray-300 font-medium border-b border-transparent hover:border-bg-500 focus:border-primary/50 outline-none px-1 py-0.5 w-44"
            value={scenarioName}
            onChange={(e) => {
              setScenarioName(e.target.value);
              markDirty();
            }}
            placeholder="Scenario name"
          />
          <span className="text-[10px] text-gray-600 shrink-0">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={addStep}
            className="text-[10px] px-2 py-1 rounded bg-bg-700 text-gray-400 hover:text-white hover:bg-bg-600 transition-colors flex items-center gap-1"
          >
            <IconPlus /> Add
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleSave}
            className="text-[10px] px-2.5 py-1.5 rounded-lg bg-bg-700 text-gray-400 hover:text-white hover:bg-bg-600 transition-colors flex items-center gap-1.5"
            title="Save scenario"
          >
            <IconSave /> Save
          </button>
          <button
            onClick={async () => {
              if (useAppStore.getState().scenariosDirty) {
                const ok = await confirmDialog("Discard current scenario?");
                if (!ok) return;
              }
              setSteps([]);
              setScenarioName("Untitled Scenario");
              setCurrentScenarioId(null);
              setRunLog([]);
              setExpandedId(null);
              useAppStore.getState().setScenariosDirty(false);
              showToast("New scenario created");
            }}
            className="text-[10px] px-2.5 py-1.5 rounded-lg bg-bg-700 text-gray-500 hover:text-white hover:bg-bg-600 transition-colors"
          >
            New
          </button>
          <button
            onClick={runScenario}
            disabled={isRunning || steps.length === 0}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isRunning || steps.length === 0
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-primary to-secondary text-bg-900 hover:scale-105"
            }`}
          >
            {isRunning ? "Running..." : "▶ Run All"}
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
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index > 0)
                        setSteps(moveItem(steps, index, index - 1));
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-white hover:bg-bg-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Move up"
                  >
                    <IconUp />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (index < steps.length - 1)
                        setSteps(moveItem(steps, index, index + 1));
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-white hover:bg-bg-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Move down"
                  >
                    <IconDown />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateStep(step.id);
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-white hover:bg-bg-600 transition-colors"
                    title="Duplicate"
                  >
                    <IconCopy />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStep(step.id);
                    }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <IconX />
                  </button>
                  <span className="text-gray-600 ml-1">
                    <IconChevron open={isExpanded} />
                  </span>
                </div>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-bg-600 px-4 py-3 space-y-3 slide-in">
                  {/* Name + cURL import */}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:border-primary/50 outline-none"
                      placeholder="Step name"
                      value={step.name}
                      onChange={(e) =>
                        updateStep(step.id, { name: e.target.value })
                      }
                    />
                    <button
                      onClick={() =>
                        setCurlInput(curlInput === step.id ? null : step.id)
                      }
                      className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                        curlInput === step.id
                          ? "bg-primary/20 text-primary"
                          : "bg-bg-700 text-gray-500 hover:text-white hover:bg-bg-600"
                      }`}
                      title="Import from cURL"
                    >
                      <IconTerminal /> cURL
                    </button>
                  </div>

                  {/* cURL input */}
                  {curlInput === step.id && (
                    <div className="space-y-2 slide-in">
                      <textarea
                        className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 outline-none focus:border-primary/50 resize-none"
                        rows={3}
                        placeholder="curl -X POST https://api.example.com -H 'Content-Type: application/json' -d '{...}'"
                        id={`curl-${step.id}`}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const el = document.getElementById(
                              `curl-${step.id}`,
                            ) as HTMLTextAreaElement;
                            if (el?.value) importCurlToStep(step.id, el.value);
                          }}
                          className="text-[10px] px-3 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                        >
                          Parse & Apply
                        </button>
                        <button
                          onClick={() => setCurlInput(null)}
                          className="text-[10px] px-2 py-1 rounded text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

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

                  {/* Headers */}
                  <div>
                    <label className="text-[10px] text-gray-600 mb-1 block">
                      Headers
                    </label>
                    {Object.entries(step.headers).map(([key, val], hi) => (
                      <div key={hi} className="flex gap-1 mb-1">
                        <input
                          className="flex-1 bg-bg-700 border border-bg-500 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-primary/50"
                          value={key}
                          placeholder="Key"
                          onChange={(e) => {
                            const newHeaders = { ...step.headers };
                            delete newHeaders[key];
                            newHeaders[e.target.value] = val;
                            updateStep(step.id, { headers: newHeaders });
                          }}
                        />
                        <input
                          className="flex-1 bg-bg-700 border border-bg-500 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-primary/50"
                          value={val}
                          placeholder="Value"
                          onChange={(e) => {
                            updateStep(step.id, {
                              headers: {
                                ...step.headers,
                                [key]: e.target.value,
                              },
                            });
                          }}
                        />
                        <button
                          onClick={() => {
                            const newHeaders = { ...step.headers };
                            delete newHeaders[key];
                            updateStep(step.id, { headers: newHeaders });
                          }}
                          className="text-gray-600 hover:text-red-400 w-5 flex items-center justify-center"
                        >
                          <IconX />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        updateStep(step.id, {
                          headers: { ...step.headers, "": "" },
                        })
                      }
                      className="text-[10px] text-gray-600 hover:text-primary transition-colors flex items-center gap-1 mt-1"
                    >
                      <IconPlus /> Add Header
                    </button>
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

      {/* Run Results Panel */}
      {runResults.length > 0 && (
        <div className="shrink-0 bg-bg-800 border border-bg-600 rounded-xl overflow-hidden">
          {/* Header with overall status */}
          <div className="px-3 py-2 border-b border-bg-600 flex justify-between items-center">
            <div className="flex items-center gap-2">
              {scenarioStatus === "running" && (
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              )}
              {scenarioStatus === "passed" && (
                <svg
                  className="w-4 h-4 text-success"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {scenarioStatus === "failed" && (
                <svg
                  className="w-4 h-4 text-danger"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              <span
                className={`text-xs font-bold ${
                  scenarioStatus === "passed"
                    ? "text-success"
                    : scenarioStatus === "failed"
                      ? "text-danger"
                      : scenarioStatus === "running"
                        ? "text-primary"
                        : "text-gray-400"
                }`}
              >
                {scenarioStatus === "running"
                  ? "Running..."
                  : scenarioStatus === "passed"
                    ? "All Steps Passed"
                    : scenarioStatus === "failed"
                      ? "Scenario Failed"
                      : "Results"}
              </span>
              <span className="text-[10px] text-gray-600">
                {runResults.filter((r) => r.status === "passed").length}/
                {runResults.length} passed
              </span>
            </div>
            <button
              onClick={() => {
                setRunResults([]);
                setRunLog([]);
                setScenarioStatus("idle");
              }}
              className="text-[10px] text-gray-700 hover:text-gray-400"
            >
              Clear
            </button>
          </div>

          {/* Step results */}
          <div className="max-h-44 overflow-y-auto">
            {runResults.map((r, i) => (
              <div
                key={i}
                className={`px-3 py-2 flex items-center gap-3 border-b border-bg-700/50 last:border-0 ${
                  r.status === "running" ? "bg-primary/5" : ""
                }`}
              >
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    r.status === "running"
                      ? "bg-primary animate-pulse"
                      : r.status === "passed"
                        ? "bg-success"
                        : r.status === "failed"
                          ? "bg-danger"
                          : "bg-gray-600"
                  }`}
                />

                {/* Step info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600">[{i + 1}]</span>
                    <span className="text-xs text-gray-300 truncate">
                      {r.stepName}
                    </span>
                    <span className="text-[9px] font-mono text-gray-600 shrink-0">
                      {r.method}
                    </span>
                  </div>
                  {r.error && (
                    <p className="text-[10px] text-danger/70 truncate mt-0.5">
                      {r.error}
                    </p>
                  )}
                </div>

                {/* Metrics */}
                {r.successRate !== undefined && (
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-bg-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            r.successRate >= 95
                              ? "bg-success"
                              : r.successRate >= 50
                                ? "bg-warning"
                                : "bg-danger"
                          }`}
                          style={{ width: `${r.successRate}%` }}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-mono font-bold w-8 text-right ${
                          r.successRate >= 95
                            ? "text-success"
                            : r.successRate >= 50
                              ? "text-warning"
                              : "text-danger"
                        }`}
                      >
                        {r.successRate.toFixed(0)}%
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 w-14 text-right">
                      {r.rps?.toFixed(0)} RPS
                    </span>
                    <span className="text-[10px] font-mono text-gray-600 w-16 text-right">
                      P95: {r.p95?.toFixed(0)}ms
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
