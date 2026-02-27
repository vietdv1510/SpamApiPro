import type { HttpMethod, TestMode } from "../store";
import {
  IconTerminal,
  IconPlus,
  IconCopy,
  IconX,
  IconChevron,
  IconUp,
  IconDown,
} from "./ScenarioIcons";
import { parseCurl } from "../tauri";
import { showToast } from "./Dialogs";

/** Một bước trong scenario */
export interface ScenarioStep {
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
  ignore_ssl_errors: boolean;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  summary?: string;
}

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const METHOD_COLORS: Record<string, string> = {
  GET: "text-success",
  POST: "text-primary",
  PUT: "text-amber-400",
  DELETE: "text-danger",
  PATCH: "text-purple-400",
};

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

interface ScenarioStepCardProps {
  step: ScenarioStep;
  index: number;
  steps: ScenarioStep[];
  isExpanded: boolean;
  isSelectedForResult: boolean;
  hasResult: boolean;
  curlInput: string | null;
  onToggle: () => void;
  onSelectForResult: () => void;
  onUpdate: (id: string, patch: Partial<ScenarioStep>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (newSteps: ScenarioStep[]) => void;
  onCurlInput: (id: string | null) => void;
}

export function ScenarioStepCard({
  step,
  index,
  steps,
  isExpanded,
  isSelectedForResult,
  hasResult,
  curlInput,
  onToggle,
  onSelectForResult,
  onUpdate,
  onRemove,
  onDuplicate,
  onReorder,
  onCurlInput,
}: ScenarioStepCardProps) {
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

  const importCurlToStep = async (stepId: string, curl: string) => {
    try {
      const parsed = await parseCurl(curl);
      onUpdate(stepId, {
        url: parsed.url,
        method: parsed.method as HttpMethod,
        headers: parsed.headers || {},
        body: parsed.body || null,
      });
      onCurlInput(null);
      showToast("cURL imported successfully");
    } catch (err) {
      showToast(`Invalid cURL: ${err}`);
    }
  };

  return (
    <div
      className={`bg-bg-800 border ${statusBorder} rounded-xl overflow-hidden transition-all`}
    >
      {/* Step header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-700/50 transition-colors group ${
          isSelectedForResult && hasResult ? "bg-bg-700/30" : ""
        }`}
        onClick={() => {
          onToggle();
          if (hasResult) onSelectForResult();
        }}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
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
              if (index > 0) onReorder(moveItem(steps, index, index - 1));
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
                onReorder(moveItem(steps, index, index + 1));
            }}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-white hover:bg-bg-600 transition-colors opacity-0 group-hover:opacity-100"
            title="Move down"
          >
            <IconDown />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(step.id);
            }}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-white hover:bg-bg-600 transition-colors"
            title="Duplicate"
          >
            <IconCopy />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(step.id);
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
              onChange={(e) => onUpdate(step.id, { name: e.target.value })}
            />
            <button
              onClick={() =>
                onCurlInput(curlInput === step.id ? null : step.id)
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
                  onClick={() => onCurlInput(null)}
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
                onUpdate(step.id, {
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
              onChange={(e) => onUpdate(step.id, { url: e.target.value })}
            />
          </div>

          {/* SSL Toggle for Step */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                SSL Verification
              </span>
              {step.ignore_ssl_errors && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Insecure Mode
                </span>
              )}
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!step.ignore_ssl_errors}
                onChange={(e) =>
                  onUpdate(step.id, { ignore_ssl_errors: !e.target.checked })
                }
              />
              <div className="w-7 h-4 bg-bg-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-success"></div>
            </label>
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
                    onUpdate(step.id, { headers: newHeaders });
                  }}
                />
                <input
                  className="flex-1 bg-bg-700 border border-bg-500 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-primary/50"
                  value={val}
                  placeholder="Value"
                  onChange={(e) => {
                    onUpdate(step.id, {
                      headers: { ...step.headers, [key]: e.target.value },
                    });
                  }}
                />
                <button
                  onClick={() => {
                    const newHeaders = { ...step.headers };
                    delete newHeaders[key];
                    onUpdate(step.id, { headers: newHeaders });
                  }}
                  className="text-gray-600 hover:text-red-400 w-5 flex items-center justify-center"
                >
                  <IconX />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                onUpdate(step.id, {
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
                  onUpdate(step.id, {
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
                  onUpdate(step.id, {
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
                  onUpdate(step.id, {
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
                  onUpdate(step.id, {
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
}
