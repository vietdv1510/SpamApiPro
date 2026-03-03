import { useState, useEffect } from "react";
import {
  loadProfiles,
  saveProfile,
  deleteProfile,
  profileToHeader,
  type AuthProfile,
  type AuthType,
} from "../utils/authProfiles";
import { useAppStore } from "../store";

interface AuthProfilesProps {
  onClose: () => void;
}

export function AuthProfilesPanel({ onClose }: AuthProfilesProps) {
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "bearer" as AuthType,
    value: "",
    headerName: "X-API-Key",
  });

  const { headerRows, setHeaderRows } = useAppStore();

  const refresh = () => setProfiles(loadProfiles());

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = () => {
    if (!form.name.trim() || !form.value.trim()) return;
    saveProfile({
      name: form.name.trim(),
      type: form.type,
      value: form.value.trim(),
      headerName: form.type === "api_key" ? form.headerName : undefined,
    });
    setForm({ name: "", type: "bearer", value: "", headerName: "X-API-Key" });
    setShowForm(false);
    refresh();
  };

  const handleApply = (profile: AuthProfile) => {
    const { key, value } = profileToHeader(profile);
    // Replace existing auth header or prepend
    const existing = headerRows.filter(
      (h) => h.key.toLowerCase() !== key.toLowerCase(),
    );
    setHeaderRows([{ key, value, enabled: true }, ...existing]);
    onClose();
  };

  const handleDelete = (id: string) => {
    deleteProfile(id);
    refresh();
  };

  return (
    <div className="bg-bg-800 border border-bg-600 rounded-xl p-4 space-y-3 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          🔐 Auth Profiles
        </h3>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-xs px-1.5 py-0.5 rounded"
        >
          ✕
        </button>
      </div>

      {/* Profile list */}
      {profiles.length === 0 && !showForm && (
        <p className="text-xs text-gray-600 text-center py-2">
          No profiles saved yet
        </p>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 bg-bg-700 rounded-lg px-3 py-2 group"
          >
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono uppercase shrink-0">
              {p.type === "bearer"
                ? "🔑 Bearer"
                : p.type === "api_key"
                  ? "🗝 API Key"
                  : "👤 Basic"}
            </span>
            <span className="flex-1 text-xs text-gray-300 font-medium truncate">
              {p.name}
            </span>
            <span className="text-[10px] text-gray-600 font-mono truncate max-w-24">
              {p.value.slice(0, 12)}…
            </span>
            <button
              onClick={() => handleApply(p)}
              className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
            >
              Apply
            </button>
            <button
              onClick={() => handleDelete(p.id)}
              className="text-gray-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="space-y-2 border-t border-bg-600 pt-3">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Profile name (e.g. Production API)"
            className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder-gray-600"
          />
          <div className="flex gap-2">
            <select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as AuthType }))
              }
              className="bg-bg-700 border border-bg-500 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary text-gray-300"
            >
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
            </select>
            {form.type === "api_key" && (
              <input
                value={form.headerName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, headerName: e.target.value }))
                }
                placeholder="Header name"
                className="flex-1 bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary placeholder-gray-600"
              />
            )}
          </div>
          <input
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            placeholder={
              form.type === "bearer"
                ? "your-token-here"
                : form.type === "api_key"
                  ? "api-key-value"
                  : "username:password"
            }
            type="password"
            className="w-full bg-bg-700 border border-bg-500 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary placeholder-gray-600"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1 rounded-lg bg-bg-600 text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.value.trim()}
              className="text-xs px-3 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Profile
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full text-xs py-1.5 rounded-lg border border-dashed border-bg-500 text-gray-600 hover:text-gray-400 hover:border-bg-400 transition-colors"
        >
          + New Profile
        </button>
      )}
    </div>
  );
}
