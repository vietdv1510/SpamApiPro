/**
 * Preset Templates — lưu toàn bộ TestConfig + headers thành preset có tên
 * Dùng để load lại 1 click thay vì nhập tay mỗi lần
 */

import type { TestConfig, Header } from "../store";

export interface Preset {
  id: string;
  name: string;
  description?: string;
  config: TestConfig;
  headers: Header[];
  createdAt: string;
}

const STORAGE_KEY = "spamapi_presets";

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Preset[]) : [];
  } catch {
    return [];
  }
}

export function savePreset(
  name: string,
  config: TestConfig,
  headers: Header[],
  description?: string,
): Preset {
  const presets = loadPresets();
  const preset: Preset = {
    id: crypto.randomUUID(),
    name,
    description,
    config,
    headers,
    createdAt: new Date().toISOString(),
  };
  presets.push(preset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return preset;
}

export function deletePreset(id: string): void {
  const presets = loadPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function updatePreset(
  id: string,
  patch: Partial<Omit<Preset, "id">>,
): void {
  const presets = loadPresets().map((p) =>
    p.id === id ? { ...p, ...patch } : p,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
