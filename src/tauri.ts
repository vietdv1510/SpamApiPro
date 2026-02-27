import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TestConfig, TestResult, RequestResult } from "./store";

export type BatchProgressCallback = (
  progress: number,
  batch: RequestResult[],
) => void;

/** Global run generation counter — tăng mỗi lần chạy test mới */
let currentRunGeneration = 0;

/**
 * Run load test với batched progress events.
 * Dùng setTimeout(16ms) để gom events → giảm re-renders từ 10K+ xuống ~600
 */
export async function runLoadTest(
  config: TestConfig,
  onBatch: BatchProgressCallback,
): Promise<TestResult> {
  const thisGeneration = ++currentRunGeneration;

  let buffer: Array<{ progress: number; result: RequestResult }> = [];
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (thisGeneration !== currentRunGeneration) {
      buffer = [];
      timerId = null;
      return;
    }
    const batch = buffer;
    buffer = [];
    timerId = null;
    if (batch.length === 0) return;
    const lastProgress = batch[batch.length - 1].progress;
    onBatch(
      lastProgress,
      batch.map((b) => b.result),
    );
  };

  const unlisten = await listen<{ progress: number; result: RequestResult }>(
    "test_progress",
    (event) => {
      if (thisGeneration !== currentRunGeneration) return;
      buffer.push(event.payload);
      if (timerId === null) {
        timerId = setTimeout(flush, 16);
      }
    },
  );

  try {
    const result = await invoke<TestResult>("run_load_test", { config });
    if (timerId !== null) clearTimeout(timerId);
    if (buffer.length > 0 && thisGeneration === currentRunGeneration) flush();
    return result;
  } finally {
    unlisten();
  }
}

export async function parseCurl(curlCommand: string): Promise<TestConfig> {
  return await invoke<TestConfig>("parse_curl", { curlCommand });
}

/** Dừng test đang chạy */
export async function stopTest(): Promise<void> {
  await invoke("stop_test");
}

// ─── SQLite History API ───

export interface HistoryEntry {
  id: number;
  timestamp: string;
  url: string;
  method: string;
  mode: string;
  virtual_users: number;
  config_json: string;
  result_json: string;
}

/** Lấy lịch sử test từ SQLite */
export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  return await invoke<HistoryEntry[]>("get_history", { limit });
}

/** Lưu kết quả test vào SQLite */
export async function saveHistory(payload: {
  timestamp: string;
  url: string;
  method: string;
  mode: string;
  virtual_users: number;
  config_json: string;
  result_json: string;
}): Promise<number> {
  return await invoke<number>("save_history", { payload });
}

/** Xóa 1 entry history */
export async function deleteHistoryEntry(id: number): Promise<void> {
  await invoke("delete_history", { id });
}

/** Xóa toàn bộ history */
export async function clearAllHistory(): Promise<void> {
  await invoke("clear_all_history");
}
