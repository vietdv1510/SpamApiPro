import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { confirmDialog, showToast } from "./Dialogs";
import { ResultsDashboard } from "./ResultsDashboard";
import { ScenarioStepCard } from "./ScenarioStepCard";
import type { ScenarioStep } from "./ScenarioStepCard";
import { useScenarioRunner } from "../hooks/useScenarioRunner";
import { IconSave, IconImport, IconPlus } from "./ScenarioIcons";
import type { HttpMethod, TestMode } from "../store";

// ─── Types ───

interface SavedScenario {
  id: number;
  name: string;
  steps: ScenarioStep[];
}

// ─── Helpers ───

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

// ─── Main Component ───

export function Scenarios() {
  const scenariosView = useAppStore((s) => s.scenariosView);
  const scenariosDirty = useAppStore((s) => s.scenariosDirty);

  const [steps, setSteps] = useState<ScenarioStep[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("Untitled Scenario");
  const [currentScenarioId, setCurrentScenarioId] = useState<number | null>(
    null,
  );
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [curlInput, setCurlInput] = useState<string | null>(null);

  const {
    isRunning,
    scenarioStatus,
    runResults,
    stepResults,
    selectedResultStepId,
    setSelectedResultStepId,
    clearResults,
    runScenario,
  } = useScenarioRunner();

  const markDirty = () => useAppStore.getState().setScenariosDirty(true);
  const enterEditor = () => useAppStore.getState().setScenariosView("editor");
  const backToList = () => useAppStore.getState().setScenariosView("list");

  useEffect(() => {
    loadScenarios().then(setSavedScenarios);
  }, []);

  // ─── Step Operations ───

  const updateStep = (id: string, patch: Partial<ScenarioStep>) => {
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));
    markDirty();
  };

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

  const duplicateStep = (id: string) => {
    const original = steps.find((s) => s.id === id);
    if (!original) return;
    const copy: ScenarioStep = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      status: "pending",
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
      method: config.method as HttpMethod,
      headers,
      body: config.body,
      virtual_users: config.virtual_users,
      mode: config.mode as TestMode,
      timeout_ms: config.timeout_ms,
    };
    setSteps((s) => [...s, step]);
    setExpandedId(step.id);
    markDirty();
    enterEditor();
  };

  // ─── Scenario Persistence ───

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

  const handleNewScenario = async () => {
    if (useAppStore.getState().scenariosDirty) {
      const ok = await confirmDialog("Discard current scenario?");
      if (!ok) return;
    }
    setSteps([]);
    setScenarioName("Untitled Scenario");
    setCurrentScenarioId(null);
    setExpandedId(null);
    clearResults();
    useAppStore.getState().setScenariosDirty(false);
    showToast("New scenario created");
  };

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
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── EDITOR VIEW ───

  const hasResults = Object.keys(stepResults).length > 0;

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
            onClick={handleNewScenario}
            className="text-[10px] px-2.5 py-1.5 rounded-lg bg-bg-700 text-gray-500 hover:text-white hover:bg-bg-600 transition-colors"
          >
            New
          </button>
          <button
            onClick={() => runScenario(steps, updateStep)}
            disabled={isRunning || steps.length === 0}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isRunning || steps.length === 0
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-primary to-secondary text-bg-900 hover:scale-105"
            }`}
          >
            {isRunning ? "Running..." : "▶ Run All"}
          </button>
          {hasResults && (
            <button
              onClick={clearResults}
              className="text-[10px] px-2 py-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-bg-600 transition-colors"
            >
              ✕ Results
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={`flex-1 overflow-hidden ${hasResults ? "flex gap-3" : "flex flex-col"}`}
      >
        {/* Steps list */}
        <div
          className={`overflow-y-auto space-y-2 ${hasResults ? "w-1/2 shrink-0" : "flex-1"}`}
        >
          {steps.map((step, index) => (
            <ScenarioStepCard
              key={step.id}
              step={step}
              index={index}
              steps={steps}
              isExpanded={expandedId === step.id}
              isSelectedForResult={selectedResultStepId === step.id}
              hasResult={!!stepResults[step.id]}
              curlInput={curlInput}
              onToggle={() =>
                setExpandedId(expandedId === step.id ? null : step.id)
              }
              onSelectForResult={() => setSelectedResultStepId(step.id)}
              onUpdate={updateStep}
              onRemove={removeStep}
              onDuplicate={duplicateStep}
              onReorder={setSteps}
              onCurlInput={setCurlInput}
            />
          ))}
        </div>

        {/* Summary bar (only when no split panel) */}
        {scenarioStatus !== "idle" && !hasResults && (
          <div
            className={`shrink-0 px-4 py-2 rounded-xl flex items-center justify-between ${
              scenarioStatus === "passed"
                ? "bg-success/10 border border-success/20"
                : scenarioStatus === "failed"
                  ? "bg-danger/10 border border-danger/20"
                  : "bg-primary/10 border border-primary/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {scenarioStatus === "running" && (
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              )}
              {scenarioStatus === "passed" && (
                <span className="text-success text-sm">✓</span>
              )}
              {scenarioStatus === "failed" && (
                <span className="text-danger text-sm">✗</span>
              )}
              <span
                className={`text-xs font-semibold ${
                  scenarioStatus === "passed"
                    ? "text-success"
                    : scenarioStatus === "failed"
                      ? "text-danger"
                      : "text-primary"
                }`}
              >
                {scenarioStatus === "running"
                  ? "Running scenario..."
                  : scenarioStatus === "passed"
                    ? "All Steps Passed"
                    : "Scenario Failed"}
              </span>
              <span className="text-[10px] text-gray-500">
                {runResults.filter((r) => r.status === "passed").length}/
                {runResults.length} passed
              </span>
            </div>
            <button
              onClick={clearResults}
              className="text-[10px] text-gray-600 hover:text-gray-400"
            >
              ✕
            </button>
          </div>
        )}

        {/* Right: ResultsDashboard (split mode) */}
        {hasResults && (
          <div className="flex-1 overflow-y-auto rounded-xl border border-bg-600 bg-bg-800">
            {selectedResultStepId && stepResults[selectedResultStepId] ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-bg-600">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      steps.find((s) => s.id === selectedResultStepId)
                        ?.status === "passed"
                        ? "bg-success"
                        : "bg-danger"
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-200">
                    {steps.find((s) => s.id === selectedResultStepId)?.name}
                  </span>
                  <span className="text-[10px] text-gray-600 font-mono ml-auto">
                    {steps.find((s) => s.id === selectedResultStepId)?.method}{" "}
                    {steps.find((s) => s.id === selectedResultStepId)?.url}
                  </span>
                </div>
                <ResultsDashboard result={stepResults[selectedResultStepId]} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                ← Select a completed step to view results
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
