import { useState, useCallback } from "react";
import { runLoadTest, stopTest } from "../tauri";
import { showToast } from "../components/Dialogs";
import type { ScenarioStep, Assertion } from "../components/ScenarioStepCard";
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

// ─── Variable Injection Context ───
interface StepContext {
  status: number | null;
  body: string;
  bodyJson: Record<string, unknown> | null;
}

/**
 * Resolve {{stepName.field}} variables in a string.
 * Supported patterns:
 *   {{stepName.status}}       → HTTP status code (e.g. "200")
 *   {{stepName.body}}         → raw response body text
 *   {{stepName.body.field}}   → JSON field from body (dot notation)
 */
function resolveVariables(
  text: string,
  ctx: Record<string, StepContext>,
): string {
  return text.replace(/\{\{(\w+)\.([^}]+)\}\}/g, (match, stepName, path) => {
    const stepCtx = ctx[stepName];
    if (!stepCtx) return match; // leave unresolved

    if (path === "status") {
      return stepCtx.status !== null ? String(stepCtx.status) : match;
    }
    if (path === "body") {
      return stepCtx.body || match;
    }
    // body.field.nested.path
    if (path.startsWith("body.")) {
      const jsonPath = path.slice(5); // remove "body."
      if (!stepCtx.bodyJson) return match;
      const value = getNestedValue(stepCtx.bodyJson, jsonPath);
      return value !== undefined ? String(value) : match;
    }
    return match;
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    )
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Inject variables into step config (URL, headers, body)
 */
function injectVariables(
  step: ScenarioStep,
  ctx: Record<string, StepContext>,
): { url: string; headers: Record<string, string>; body: string | null } {
  const url = resolveVariables(step.url, ctx);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(step.headers)) {
    headers[resolveVariables(k, ctx)] = resolveVariables(v, ctx);
  }
  const body = step.body ? resolveVariables(step.body, ctx) : null;
  return { url, headers, body };
}

// ─── Assertion Evaluator ───

function evaluateAssertions(
  assertions: Assertion[],
  result: TestResult,
): Assertion[] {
  return assertions.map((a) => {
    let passed = false;
    switch (a.type) {
      case "status_code_equals": {
        // Check if the most common status code matches
        const target = a.value.trim();
        const exactKey = target;
        passed =
          (result.status_distribution[exactKey] ?? 0) > 0 &&
          (result.status_distribution[exactKey] ?? 0) >=
            result.total_requests * 0.95;
        break;
      }
      case "body_contains": {
        // Check if any response body in timeline contains the value
        const needle = a.value.trim();
        passed = result.timeline.some(
          (r) => r.response_body && r.response_body.includes(needle),
        );
        break;
      }
      case "latency_p95_lt": {
        const threshold = parseFloat(a.value);
        passed = !isNaN(threshold) && result.latency_p95_ms < threshold;
        break;
      }
      case "response_time_lt": {
        const threshold = parseFloat(a.value);
        passed = !isNaN(threshold) && result.latency_avg_ms < threshold;
        break;
      }
    }
    return { ...a, passed };
  });
}

// ─── Hook ───

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

      // Reset all step statuses + assertion results
      steps.forEach((s) =>
        onStepUpdate(s.id, {
          status: "pending",
          summary: undefined,
          assertions: s.assertions.map((a) => ({ ...a, passed: undefined })),
        }),
      );

      let allPassed = true;
      // Variable injection context: stepName -> response data
      const varContext: Record<string, StepContext> = {};

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
          // 🔗 Variable Injection — resolve {{stepName.field}} in URL/headers/body
          const injected = injectVariables(step, varContext);

          // ⚠️ Cảnh báo Stress Test trong Flows — sẽ rất lâu
          if (step.mode === "stress_test") {
            showToast(
              "⚠️ Stress Test in Flows may take a long time. Use Burst for quick checks.",
            );
          }

          // ⏱️ Per-step timeout: Burst=30s, others=60s — tránh treo mãi mãi
          const STEP_TIMEOUT_MS = step.mode === "burst" ? 30_000 : 60_000;

          const stepConfig = {
            url: injected.url,
            method: step.method,
            headers: injected.headers,
            body: injected.body?.trim() || null,
            virtual_users: step.virtual_users,
            mode: step.mode,
            timeout_ms: step.timeout_ms,
            think_time_ms: step.think_time_ms,
            ignore_ssl_errors: step.ignore_ssl_errors,
            duration_secs: step.duration_secs,
            iterations: step.iterations,
          };

          // Race between test completion and step hard timeout
          let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(async () => {
              await stopTest().catch(() => {});
              reject(
                new Error(
                  `Step timed out after ${STEP_TIMEOUT_MS / 1000}s — use Burst mode for Flows`,
                ),
              );
            }, STEP_TIMEOUT_MS);
          });

          let result: Awaited<ReturnType<typeof runLoadTest>>;
          try {
            result = await Promise.race([
              runLoadTest(stepConfig, () => {}),
              timeoutPromise,
            ]);
          } finally {
            // ✅ Luôn clear timeout — tránh stopTest() gọi nhầm vào step tiếp theo
            if (timeoutHandle !== null) clearTimeout(timeoutHandle);
          }

          // 🔗 Store result context for variable injection in later steps
          const firstSuccess = result.timeline.find((r) => r.success);
          varContext[step.name] = {
            status: firstSuccess?.status_code ?? null,
            body: firstSuccess?.response_body ?? "",
            bodyJson: (() => {
              try {
                return JSON.parse(firstSuccess?.response_body ?? "");
              } catch {
                return null;
              }
            })(),
          };

          const successRate =
            result.total_requests > 0
              ? (result.success_count / result.total_requests) * 100
              : 0;

          // ✅ Evaluate assertions
          let passed: boolean;
          let evaluatedAssertions: Assertion[] = [];

          if (step.assertions.length > 0) {
            evaluatedAssertions = evaluateAssertions(step.assertions, result);
            passed = evaluatedAssertions.every((a) => a.passed);
          } else {
            // Default: pass if success rate >= 95%
            passed = successRate >= 95;
          }

          if (!passed) allPassed = false;

          const assertionSummary =
            step.assertions.length > 0
              ? ` · ${evaluatedAssertions.filter((a) => a.passed).length}/${evaluatedAssertions.length} assertions`
              : "";

          onStepUpdate(step.id, {
            status: passed ? "passed" : "failed",
            summary: `${successRate.toFixed(0)}% · ${result.requests_per_second.toFixed(0)} RPS · P95: ${result.latency_p95_ms.toFixed(0)}ms${assertionSummary}`,
            assertions: evaluatedAssertions,
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
