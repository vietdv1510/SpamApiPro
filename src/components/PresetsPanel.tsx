import { useState, useEffect } from "react";
import {
  loadPresets,
  savePreset,
  deletePreset,
  type Preset,
} from "../utils/presets";
import { useAppStore } from "../store";

interface PresetsProps {
  onClose: () => void;
}

export function PresetsPanel({ onClose }: PresetsProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDesc, setPresetDesc] = useState("");

  const { config, headerRows, applyParsedConfig, setHeaderRows } =
    useAppStore();

  const refresh = () => setPresets(loadPresets());

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = () => {
    if (!presetName.trim()) return;
    savePreset(
      presetName.trim(),
      config,
      headerRows,
      presetDesc.trim() || undefined,
    );
    setPresetName("");
    setPresetDesc("");
    setSaving(false);
    refresh();
  };

  const handleLoad = (preset: Preset) => {
    applyParsedConfig(preset.config);
    // Restore header rows including empty sentinel
    setHeaderRows([...preset.headers, { key: "", value: "", enabled: true }]);
    onClose();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deletePreset(id);
    refresh();
  };

  const modeLabel = (mode: string) =>
    ({
      burst: "Burst",
      constant: "Constant",
      ramp_up: "Ramp Up",
      stress_test: "Stress",
    })[mode] ?? mode;

  return (
    <div className="bg-bg-800 border border-bg-600 rounded-xl p-4 space-y-3 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          📦 Presets
        </h3>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-xs px-1.5 py-0.5 rounded"
        >
          ✕
        </button>
      </div>

      {/* Preset list */}
      {presets.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-2">
          No presets saved yet
        </p>
      )}

      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {presets.map((p) => (
          <div
            key={p.id}
            onClick={() => handleLoad(p)}
            className="flex items-center gap-2 bg-bg-700 rounded-lg px-3 py-2 cursor-pointer hover:bg-bg-600 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-200 font-medium truncate">
                {p.name}
              </div>
              {p.description && (
                <div className="text-[10px] text-gray-600 truncate">
                  {p.description}
                </div>
              )}
              <div className="flex gap-2 mt-0.5">
                <span className="text-[9px] font-mono text-primary/70 bg-primary/10 px-1.5 rounded">
                  {p.config.method}
                </span>
                <span className="text-[9px] text-gray-600 font-mono truncate max-w-28">
                  {p.config.url}
                </span>
                <span className="text-[9px] text-gray-600">
                  {modeLabel(p.config.mode)} ·{" "}
                  {p.config.virtual_users.toLocaleString()} VUs
                </span>
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(p.id, e)}
              className="text-gray-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all shrink-0"
              title="Delete preset"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Save current config */}
      {saving ? (
        <div className="border-t border-bg-600 pt-3 space-y-2">
          <input
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Preset name (e.g. Auth API — 1K Burst)"
            className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder-gray-600"
          />
          <input
            value={presetDesc}
            onChange={(e) => setPresetDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder-gray-600"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setSaving(false)}
              className="text-xs px-3 py-1 rounded-lg bg-bg-600 text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!presetName.trim()}
              className="text-xs px-3 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setSaving(true)}
          className="w-full text-xs py-1.5 rounded-lg border border-dashed border-bg-500 text-gray-600 hover:text-gray-400 hover:border-bg-400 transition-colors"
        >
          💾 Save Current Config as Preset
        </button>
      )}
    </div>
  );
}
