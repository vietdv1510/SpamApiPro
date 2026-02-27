import { useState, useCallback } from "react";
import { runLoadTest } from "../tauri";
import { showToast } from "../components/Dialogs";
import type { ScenarioStep } from "../components/ScenarioStepCard";
import type { TestResult } from "../store";

export interface StepResult {
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

interface UseScenarioRunnerReturn {
  isRunning: boolean;
  scenarioStatus: "idle" | "running" | "passed" | "failed";
  runResults: StepResult[];
  stepResults: Record<string, TestResult>;
  selectedResultStepId: string | null;
  setSelectedResultStepId: (id: string | null) => void;
  clearResults: () => void;
  runScenario: (
    steps: ScenarioStep[],
    onStepUpdate: (id: string, patch: Partial<ScenarioStep>) => void,
  ) => Promise<void>;
}

export function useScenarioRunner(): UseScenarioRunnerReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [scenarioStatus, setScenarioStatus] = useState<
    "idle" | "running" | "passed" | "failed"
  >("idle");
  const [runResults, setRunResults] = useState<StepResult[]>([]);
  const [stepResults, setStepResults] = useState<Record<string, TestResult>>(
    {},
  );
  const [selectedResultStepId, setSelectedResultStepId] = useState<
    string | null
  >(null);

  const clearResults = useCallback(() => {
    setRunResults([]);
    setStepResults({});
    setSelectedResultStepId(null);
    setScenarioStatus("idle");
  }, []);

  const runScenario = useCallback(
    async (
      steps: ScenarioStep[],
      onStepUpdate: (id: string, patch: Partial<ScenarioStep>) => void,
    ) => {
      if (steps.length === 0) return;

      setIsRunning(true);
      setScenarioStatus("running");
      setStepResults({});
      setSelectedResultStepId(null);
      setRunResults(
        steps.map((s) => ({
          stepName: s.name,
          method: s.method,
          url: s.url,
          status: "running" as const,
        })),
      );

      // Reset all step statuses
      steps.forEach((s) =>
        onStepUpdate(s.id, { status: "pending", summary: undefined }),
      );

      let allPassed = true;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // Mark step as running
        onStepUpdate(step.id, { status: "running" });
        setRunResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "running" as const } : r,
          ),
        );

        // Skip steps with no URL
        if (!step.url.trim()) {
          onStepUpdate(step.id, { status: "skipped", summary: "No URL" });
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

          onStepUpdate(step.id, {
            status: passed ? "passed" : "failed",
            summary: `${successRate.toFixed(0)}% · ${result.requests_per_second.toFixed(0)} RPS · P95: ${result.latency_p95_ms.toFixed(0)}ms`,
          });

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

          setStepResults((prev) => ({ ...prev, [step.id]: result }));
          if (i === 0) setSelectedResultStepId(step.id);
        } catch (err) {
          allPassed = false;
          onStepUpdate(step.id, { status: "failed", summary: String(err) });
          setRunResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? { ...r, status: "failed" as const, error: String(err) }
                : r,
            ),
          );
        }

        // Think time delay between steps
        if (step.think_time_ms > 0 && i < steps.length - 1) {
          await new Promise((r) => setTimeout(r, step.think_time_ms));
        }
      }

      setScenarioStatus(allPassed ? "passed" : "failed");
      setIsRunning(false);
      showToast(allPassed ? "Scenario passed! ✅" : "Scenario has failures ⚠️");
    },
    [],
  );

  return {
    isRunning,
    scenarioStatus,
    runResults,
    stepResults,
    selectedResultStepId,
    setSelectedResultStepId,
    clearResults,
    runScenario,
  };
}
