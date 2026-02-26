import { useRef, useEffect, useState } from "react";
import {
  useAppStore,
  type HttpMethod,
  type TestMode,
  type Header,
} from "../store";
import { useTestRunner } from "../hooks/useTestRunner";

const METHODS: { value: HttpMethod; color: string }[] = [
  { value: "GET", color: "#34d399" },
  { value: "POST", color: "#60a5fa" },
  { value: "PUT", color: "#fbbf24" },
  { value: "DELETE", color: "#f87171" },
  { value: "PATCH", color: "#a78bfa" },
];

const MODES = [
  { value: "burst" as TestMode, label: "Burst", sub: "All at once" },
  { value: "constant" as TestMode, label: "Constant", sub: "Sustained" },
  { value: "ramp_up" as TestMode, label: "Ramp Up", sub: "Gradual" },
  { value: "stress_test" as TestMode, label: "Stress", sub: "Find limit" },
];

export function TestConfig() {
  const {
    config,
    setConfig,
    headerRows,
    setHeaderRows,
    showCurlImport,
    setShowCurlImport,
    curlImportText,
    setCurlImportText,
    runStatus,
  } = useAppStore();

  const { run, stop, importCurl } = useTestRunner();
  const isRunning = runStatus === "running" || runStatus === "cancelling";
  const curlRef = useRef<HTMLTextAreaElement>(null);
  const [editingUsers, setEditingUsers] = useState(false);
  const [usersInput, setUsersInput] = useState(String(config.virtual_users));
  const [runError, setRunError] = useState<string | null>(null);
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  useEffect(() => {
    if (showCurlImport && curlRef.current) curlRef.current.focus();
  }, [showCurlImport]);

  useEffect(() => {
    if (!editingUsers) setUsersInput(String(config.virtual_users));
  }, [config.virtual_users, editingUsers]);

  // Close method picker on outside click
  useEffect(() => {
    if (!showMethodPicker) return;
    const handler = () => setShowMethodPicker(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showMethodPicker]);

  const currentMethod =
    METHODS.find((m) => m.value === config.method) ?? METHODS[0];

  const handleHeaderChange = (
    index: number,
    field: keyof Header,
    value: string | boolean,
  ) => {
    const updated = [...headerRows];
    if (field === "enabled") {
      updated[index] = { ...updated[index], enabled: value as boolean };
    } else {
      updated[index] = { ...updated[index], [field]: value as string };
    }
    if (index === headerRows.length - 1 && field !== "enabled" && value) {
      updated.push({ key: "", value: "", enabled: true });
    }
    setHeaderRows(updated);
  };

  const removeHeader = (index: number) => {
    if (headerRows.length <= 1) return;
    setHeaderRows(headerRows.filter((_, i) => i !== index));
  };

  const addHeader = () => {
    const last = headerRows[headerRows.length - 1];
    if (last && !last.key && !last.value) return;
    setHeaderRows([...headerRows, { key: "", value: "", enabled: true }]);
  };

  const handleCurlImport = async () => {
    const ok = await importCurl(curlImportText);
    if (!ok) alert("Could not parse curl command. Please check the format.");
  };

  const commitUsersInput = () => {
    const val = Math.max(1, Math.min(1_000_000, Number(usersInput) || 1));
    setConfig({ virtual_users: val });
    setUsersInput(String(val));
    setEditingUsers(false);
  };

  const handleRun = async () => {
    setRunError(null);
    const result = await run();
    if (result.error) setRunError(result.error);
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* ─── SCROLLABLE AREA ─── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-4 pb-3">
        {/* ─── URL Bar ─── */}
        <div className="space-y-2">
          {/* Method pills — px-1 to avoid edge clipping */}
          <div className="flex gap-1 px-1">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setConfig({ method: m.value })}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all border ${
                  config.method === m.value
                    ? "border-opacity-60 scale-105"
                    : "border-transparent bg-bg-700 opacity-40 hover:opacity-70"
                }`}
                style={
                  config.method === m.value
                    ? {
                        color: m.color,
                        backgroundColor: `${m.color}15`,
                        borderColor: `${m.color}50`,
                      }
                    : { color: m.color }
                }
              >
                {m.value}
              </button>
            ))}
          </div>

          {/* URL input + curl */}
          <div className="flex gap-2 min-w-0">
            <div className="flex-1 min-w-0 relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono pointer-events-none"
                style={{ color: currentMethod.color }}
              >
                {config.method}
              </span>
              <input
                type="url"
                value={config.url}
                onChange={(e) => setConfig({ url: e.target.value })}
                placeholder="https://api.example.com/endpoint"
                className="w-full bg-bg-700 border border-bg-500 rounded-lg pl-16 pr-3 py-2.5 text-xs font-mono focus:outline-none focus:border-primary transition-all placeholder-gray-600"
              />
            </div>
            <button
              onClick={() => setShowCurlImport(!showCurlImport)}
              title="Import from cURL"
              className={`border rounded-lg px-3 py-2.5 text-xs font-mono transition-all shrink-0 ${
                showCurlImport
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-bg-700 border-bg-500 text-gray-500 hover:text-primary hover:border-primary"
              }`}
            >
              cURL
            </button>
          </div>
        </div>

        {/* cURL Import — fixed panel */}
        {showCurlImport && (
          <div className="bg-bg-800 border border-primary/20 rounded-xl p-4 slide-in">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-primary font-medium font-mono">
                📋 Paste cURL command
              </p>
              <button
                onClick={() => setShowCurlImport(false)}
                className="text-gray-600 hover:text-gray-300 text-xs px-1.5 py-0.5 rounded hover:bg-bg-600 transition-colors"
              >
                ✕
              </button>
            </div>
            <textarea
              ref={curlRef}
              value={curlImportText}
              onChange={(e) => setCurlImportText(e.target.value)}
              className="w-full bg-bg-700 border border-bg-600 rounded-lg p-3 text-xs font-mono text-gray-200 h-24 resize-none focus:outline-none focus:border-primary"
              placeholder={`curl -X POST https://api.example.com \\
  -H "Authorization: Bearer token" \\
  -d '{"key": "value"}'`}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleCurlImport}
                disabled={!curlImportText.trim()}
                className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-all ${
                  curlImportText.trim()
                    ? "bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30"
                    : "bg-bg-600 text-gray-600 border border-bg-500 cursor-not-allowed"
                }`}
              >
                Import →
              </button>
            </div>
          </div>
        )}

        {/* Headers */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              Headers
            </h3>
            <button
              onClick={addHeader}
              className="text-xs text-gray-600 hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-primary/10"
              title="Add header"
            >
              + Add
            </button>
          </div>
          <div className="space-y-1.5">
            {headerRows.map((row, i) => (
              <div key={i} className="flex gap-1.5 items-center min-w-0">
                <label className="custom-checkbox shrink-0">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      handleHeaderChange(i, "enabled", e.target.checked)
                    }
                  />
                  <span className="checkmark" />
                </label>
                <input
                  value={row.key}
                  onChange={(e) => handleHeaderChange(i, "key", e.target.value)}
                  placeholder="Key"
                  className={`min-w-0 bg-bg-700 border border-bg-500 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60 placeholder-gray-700 transition-opacity ${
                    !row.enabled ? "opacity-40" : ""
                  }`}
                  style={{ flex: "0 1 120px" }}
                  disabled={!row.enabled}
                />
                <input
                  value={row.value}
                  onChange={(e) =>
                    handleHeaderChange(i, "value", e.target.value)
                  }
                  placeholder="Value"
                  className={`flex-1 min-w-0 bg-bg-700 border border-bg-500 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60 placeholder-gray-700 transition-opacity ${
                    !row.enabled ? "opacity-40" : ""
                  }`}
                  disabled={!row.enabled}
                />
                <button
                  onClick={() => removeHeader(i)}
                  className="text-gray-700 hover:text-red-400 text-sm w-4 text-center transition-colors shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        {(["POST", "PUT", "PATCH"] as HttpMethod[]).includes(config.method) && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
              Request Body
            </h3>
            <textarea
              value={config.body || ""}
              onChange={(e) => setConfig({ body: e.target.value || null })}
              placeholder={'{\n  "key": "value"\n}'}
              className="w-full bg-bg-700 border border-bg-500 rounded-xl px-4 py-3 text-xs font-mono text-gray-200 h-28 resize-none focus:outline-none focus:border-primary/60 placeholder-gray-700"
            />
          </div>
        )}
      </div>

      {/* ─── PINNED BOTTOM ─── */}
      <div className="shrink-0 border-t border-bg-700 pt-3 space-y-3">
        <div className="space-y-2">
          {/* Requests */}
          <div
            className={`bg-bg-700 rounded-xl p-3 border transition-colors ${
              config.virtual_users > 100000
                ? "border-red-500/50"
                : config.virtual_users > 10000
                  ? "border-amber-500/40"
                  : "border-bg-500"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-medium">
                Requests
              </label>
              {editingUsers ? (
                <input
                  type="number"
                  value={usersInput}
                  onChange={(e) => setUsersInput(e.target.value)}
                  onBlur={commitUsersInput}
                  onKeyDown={(e) => e.key === "Enter" && commitUsersInput()}
                  autoFocus
                  min={1}
                  max={1000000}
                  className="w-20 bg-bg-600 border border-primary rounded px-1.5 py-0.5 text-primary font-mono font-bold text-sm text-center focus:outline-none"
                />
              ) : (
                <span
                  onClick={() => setEditingUsers(true)}
                  className={`font-mono font-bold text-sm cursor-pointer hover:underline tabular-nums ${
                    config.virtual_users > 100000
                      ? "text-red-400"
                      : config.virtual_users > 10000
                        ? "text-amber-400"
                        : "text-primary"
                  }`}
                  title="Click to edit — type any value up to 1,000,000"
                >
                  {config.virtual_users.toLocaleString()}
                </span>
              )}
            </div>
            <input
              type="range"
              min="0"
              max="100000"
              step={
                config.virtual_users <= 100
                  ? 1
                  : config.virtual_users <= 1000
                    ? 10
                    : config.virtual_users <= 10000
                      ? 100
                      : 1000
              }
              value={config.virtual_users}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConfig({ virtual_users: Math.max(1, v) });
              }}
              className="w-full custom-range"
            />
            <div className="flex gap-1 mt-2">
              {[100, 500, 1000, 5000, 10000, 50000, 100000].map((v) => (
                <button
                  key={v}
                  onClick={() => setConfig({ virtual_users: v })}
                  className={`flex-1 text-[10px] py-0.5 rounded font-mono transition-all ${
                    config.virtual_users === v
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "bg-bg-600 text-gray-600 border border-transparent hover:text-gray-400"
                  }`}
                >
                  {v >= 1000 ? `${v / 1000}K` : v}
                </button>
              ))}
            </div>
            {config.virtual_users > 100000 && (
              <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                ⚠️ {">"}100K — Risk of OOM. ~
                {((config.virtual_users * 500) / 1024 / 1024).toFixed(0)}MB
                estimated.
              </div>
            )}
            {config.virtual_users > 10000 && config.virtual_users <= 100000 && (
              <div className="mt-2 text-[10px] text-amber-400 bg-amber-500/10 rounded px-2 py-1">
                ⚡ Heavy load — ~
                {((config.virtual_users * 500) / 1024 / 1024).toFixed(0)}MB
                estimated RAM.
              </div>
            )}
          </div>

          {/* Timeout */}
          <div className="bg-bg-700 rounded-xl p-3 border border-bg-500">
            <label className="text-xs text-gray-500 font-medium block mb-1">
              Timeout (ms)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={config.timeout_ms}
                onChange={(e) =>
                  setConfig({ timeout_ms: Number(e.target.value) })
                }
                min={100}
                max={120000}
                step={100}
                className="flex-1 bg-bg-600 border border-bg-500 rounded-lg px-3 py-1.5 text-primary font-mono font-bold text-sm focus:outline-none focus:border-primary/60"
              />
              <div className="flex gap-1">
                {[5000, 10000, 30000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setConfig({ timeout_ms: v })}
                    className={`text-[10px] px-2 py-1 rounded font-mono transition-all ${
                      config.timeout_ms === v
                        ? "bg-primary/20 text-primary border border-primary/40"
                        : "bg-bg-600 text-gray-600 border border-transparent hover:text-gray-400"
                    }`}
                  >
                    {v / 1000}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mode Selector — clean text-only design */}
        <div className="grid grid-cols-4 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => {
                setConfig({ mode: m.value });
                if (m.value !== "burst" && !config.duration_secs) {
                  setConfig({ duration_secs: 10 });
                }
              }}
              className={`py-2 px-1 rounded-lg border text-center transition-all ${
                config.mode === m.value
                  ? "border-primary bg-primary/10"
                  : "border-bg-500 bg-bg-700 hover:border-bg-400"
              }`}
            >
              <div
                className={`text-[11px] font-semibold ${
                  config.mode === m.value ? "text-primary" : "text-gray-400"
                }`}
              >
                {m.label}
              </div>
              <div className="text-[9px] text-gray-600 mt-0.5">{m.sub}</div>
            </button>
          ))}
        </div>

        {config.mode !== "burst" && (
          <div className="bg-bg-700/50 rounded-xl p-3 border border-bg-500/50 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-300">
                Duration (seconds)
              </div>
              <div className="text-[10px] text-gray-500">
                Run test for a specific time
              </div>
            </div>
            <input
              type="number"
              value={config.duration_secs || 10}
              onChange={(e) =>
                setConfig({ duration_secs: Number(e.target.value) })
              }
              min={1}
              max={3600}
              className="w-20 bg-bg-800 border border-bg-600 rounded-lg px-3 py-1.5 text-primary font-mono font-bold text-sm text-right focus:outline-none focus:border-primary/60"
            />
          </div>
        )}

        {runError && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2 text-red-400 text-xs">
            ⚠️ {runError}
          </div>
        )}

        {/* Run / Stop Buttons */}
        {isRunning ? (
          <button
            onClick={runStatus === "cancelling" ? undefined : stop}
            disabled={runStatus === "cancelling"}
            className={`w-full py-3 rounded-2xl font-bold text-sm text-white transition-all shadow-lg ${
              runStatus === "cancelling"
                ? "bg-amber-600 hover:opacity-100 cursor-not-allowed"
                : "bg-gradient-to-r from-red-600 to-red-500 hover:opacity-90 active:scale-95"
            }`}
            style={{
              boxShadow:
                runStatus === "cancelling"
                  ? "0 0 20px rgba(217,119,6,0.3)"
                  : "0 0 30px rgba(239,68,68,0.3), 0 0 60px rgba(239,68,68,0.15)",
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <span
                className={`w-4 h-4 border-2 rounded-full animate-spin ${
                  runStatus === "cancelling"
                    ? "border-amber-300 border-t-white"
                    : "border-red-300 border-t-white"
                }`}
              />
              {runStatus === "cancelling" ? "⏹ Stopping..." : "⏹ Stop Test"}
            </span>
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!config.url}
            className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${
              !config.url
                ? "bg-bg-600 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 active:scale-95 shadow-lg"
            }`}
            style={
              !config.url
                ? {}
                : {
                    boxShadow:
                      "0 0 30px rgba(0,212,255,0.3), 0 0 60px rgba(124,58,237,0.2)",
                  }
            }
          >
            🚀{" "}
            {config.mode === "burst"
              ? `Fire ${config.virtual_users.toLocaleString()} Requests`
              : `Start Test (${config.duration_secs || 10}s) - ${config.virtual_users.toLocaleString()} VUs`}
          </button>
        )}
      </div>
    </div>
  );
}
