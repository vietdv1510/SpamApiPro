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
 * Dùng requestAnimationFrame để gom events → giảm re-renders từ 10K+ xuống ~600
 */
export async function runLoadTest(
  config: TestConfig,
  onBatch: BatchProgressCallback,
): Promise<TestResult> {
  // Tăng generation — vô hiệu hóa mọi callback từ run cũ
  const thisGeneration = ++currentRunGeneration;

  let buffer: Array<{ progress: number; result: RequestResult }> = [];
  let rafId: number | null = null;

  const flush = () => {
    // ⚡ CRITICAL: Chỉ flush nếu đây vẫn là run hiện tại
    if (thisGeneration !== currentRunGeneration) {
      buffer = [];
      rafId = null;
      return;
    }
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
      // Bỏ qua events từ run cũ
      if (thisGeneration !== currentRunGeneration) return;
      buffer.push(event.payload);
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    },
  );

  try {
    const result = await invoke<TestResult>("run_load_test", { config });
    // Flush remaining buffered events (chỉ nếu vẫn là run hiện tại)
    if (rafId !== null) cancelAnimationFrame(rafId);
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
