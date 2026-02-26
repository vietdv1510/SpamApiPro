import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TestConfig, TestResult, RequestResult } from "./store";

export type BatchProgressCallback = (
  progress: number,
  batch: RequestResult[],
) => void;

/**
 * Run load test với batched progress events.
 * Dùng requestAnimationFrame để gom events → giảm re-renders từ 10K+ xuống ~600
 */
export async function runLoadTest(
  config: TestConfig,
  onBatch: BatchProgressCallback,
): Promise<TestResult> {
  let buffer: Array<{ progress: number; result: RequestResult }> = [];
  let rafId: number | null = null;

  const flush = () => {
    const batch = buffer;
    buffer = [];
    rafId = null;
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
      buffer.push(event.payload);
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    },
  );

  try {
    const result = await invoke<TestResult>("run_load_test", { config });
    // Flush remaining buffered events
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (buffer.length > 0) flush();
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
