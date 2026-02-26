import { useRef, useEffect } from "react";
import { useAppStore } from "../store";
import { useTestRunner } from "../hooks/useTestRunner";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
const MODES = [
  { value: "burst", label: "⚡ Burst", desc: "All at once" },
  { value: "constant", label: "📊 Constant", desc: "Sustained load" },
  { value: "ramp_up", label: "📈 Ramp Up", desc: "Gradual increase" },
  { value: "stress_test", label: "💥 Stress", desc: "Find the limit" },
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

  const { run, importCurl, error } = useTestRunner();
  const isRunning = runStatus === "running";
  const curlRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showCurlImport && curlRef.current) curlRef.current.focus();
  }, [showCurlImport]);

  const handleHeaderChange = (
    index: number,
    field: "key" | "value" | "enabled",
    value: string | boolean,
  ) => {
    const updated = [...headerRows];
    (updated[index] as any)[field] = value;
    // Auto-add row when typing in last row
    if (index === headerRows.length - 1 && field !== "enabled" && value) {
      updated.push({ key: "", value: "", enabled: true });
    }
    setHeaderRows(updated);
  };

  const removeHeader = (index: number) => {
    if (headerRows.length <= 1) return;
    setHeaderRows(headerRows.filter((_, i) => i !== index));
  };

  const handleCurlImport = async () => {
    const ok = await importCurl(curlImportText);
    if (!ok) alert("Could not parse curl command. Please check the format.");
  };

  const methodColors: Record<string, string> = {
    GET: "text-emerald-400",
    POST: "text-blue-400",
    PUT: "text-amber-400",
    DELETE: "text-red-400",
    PATCH: "text-purple-400",
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* URL Bar */}
      <div className="flex gap-2">
        <select
          value={config.method}
          onChange={(e) => setConfig({ method: e.target.value as any })}
          className={`bg-bg-700 border border-bg-500 rounded-lg px-3 py-2.5 text-sm font-semibold font-mono focus:outline-none focus:border-primary ${methodColors[config.method]} cursor-pointer`}
          style={{ minWidth: "95px" }}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <input
          type="url"
          value={config.url}
          onChange={(e) => setConfig({ url: e.target.value })}
          placeholder="https://api.example.com/endpoint"
          className="flex-1 bg-bg-700 border border-bg-500 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:glow-primary focus:border-primary transition-all placeholder-gray-600"
        />

        <button
          onClick={() => setShowCurlImport(!showCurlImport)}
          title="Import from cURL"
          className="bg-bg-700 border border-bg-500 rounded-lg px-3 py-2.5 text-xs text-gray-400 hover:text-primary hover:border-primary transition-all"
        >
          curl
        </button>
      </div>

      {/* cURL Import */}
      {showCurlImport && (
        <div className="bg-bg-800 border border-bg-500 rounded-xl p-4 slide-in">
          <p className="text-xs text-gray-400 mb-2 font-mono">
            Paste your curl command:
          </p>
          <textarea
            ref={curlRef}
            value={curlImportText}
            onChange={(e) => setCurlImportText(e.target.value)}
            className="w-full bg-bg-700 border border-bg-600 rounded-lg p-3 text-xs font-mono text-gray-200 h-24 resize-none focus:outline-none focus:border-primary"
            placeholder={`curl -X POST https://api.example.com \\
  -H "Authorization: Bearer token" \\
  -d '{"key": "value"}'`}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setShowCurlImport(false)}
              className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleCurlImport}
              className="bg-primary/20 border border-primary/40 text-primary text-xs px-4 py-1.5 rounded-lg hover:bg-primary/30 transition-all"
            >
              Import →
            </button>
          </div>
        </div>
      )}

      {/* Headers */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
          Headers
        </h3>
        <div className="space-y-1.5">
          {headerRows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) =>
                  handleHeaderChange(i, "enabled", e.target.checked)
                }
                className="accent-primary rounded"
              />
              <input
                value={row.key}
                onChange={(e) => handleHeaderChange(i, "key", e.target.value)}
                placeholder="Header-Name"
                className="flex-1 bg-bg-700 border border-bg-500 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/60 placeholder-gray-700"
              />
              <input
                value={row.value}
                onChange={(e) => handleHeaderChange(i, "value", e.target.value)}
                placeholder="value"
                className="flex-1 bg-bg-700 border border-bg-500 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/60 placeholder-gray-700"
              />
              <button
                onClick={() => removeHeader(i)}
                className="text-gray-700 hover:text-red-400 text-base w-5 text-center transition-colors"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      {["POST", "PUT", "PATCH"].includes(config.method) && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
            Request Body
          </h3>
          <textarea
            value={config.body || ""}
            onChange={(e) => setConfig({ body: e.target.value || null })}
            placeholder={'{\n  "key": "value"\n}'}
            className="w-full bg-bg-700 border border-bg-500 rounded-xl px-4 py-3 text-xs font-mono text-gray-200 h-32 resize-none focus:outline-none focus:border-primary/60 placeholder-gray-700"
          />
        </div>
      )}

      {/* Test Settings */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 font-semibold">
          Load Settings
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg-700 rounded-xl p-3 border border-bg-500">
            <label className="text-xs text-gray-500 mb-1 block">
              Virtual Users
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="1000"
                value={config.virtual_users}
                onChange={(e) =>
                  setConfig({ virtual_users: Number(e.target.value) })
                }
                className="flex-1 accent-primary"
              />
              <span className="text-primary font-mono font-bold text-sm w-12 text-right">
                {config.virtual_users}
              </span>
            </div>
          </div>
          <div className="bg-bg-700 rounded-xl p-3 border border-bg-500">
            <label className="text-xs text-gray-500 mb-1 block">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={config.timeout_ms}
              onChange={(e) =>
                setConfig({ timeout_ms: Number(e.target.value) })
              }
              className="w-full bg-transparent text-primary font-mono font-bold text-sm focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Mode Selector */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
          Test Mode
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setConfig({ mode: m.value as any })}
              className={`p-3 rounded-xl border text-left transition-all ${
                config.mode === m.value
                  ? "border-primary bg-primary/10 glow-primary"
                  : "border-bg-500 bg-bg-700 hover:border-bg-400"
              }`}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="text-xs text-gray-500">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={run}
        disabled={isRunning || !config.url}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
          isRunning
            ? "bg-bg-600 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 active:scale-95 shadow-lg"
        }`}
        style={
          isRunning
            ? {}
            : {
                boxShadow:
                  "0 0 30px rgba(0,212,255,0.3), 0 0 60px rgba(124,58,237,0.2)",
              }
        }
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
            Running...
          </span>
        ) : (
          `🚀 Fire ${config.virtual_users} Requests`
        )}
      </button>
    </div>
  );
}
