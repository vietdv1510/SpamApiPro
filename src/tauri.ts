import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TestConfig, TestResult, RequestResult } from "./store";

export type ProgressCallback = (
  progress: number,
  result: RequestResult,
) => void;

export async function runLoadTest(
  config: TestConfig,
  onProgress: ProgressCallback,
): Promise<TestResult> {
  // Listen to real-time progress events from Rust
  const unlisten = await listen<{ progress: number; result: RequestResult }>(
    "test_progress",
    (event) => {
      onProgress(event.payload.progress, event.payload.result);
    },
  );

  try {
    const result = await invoke<TestResult>("run_load_test", { config });
    return result;
  } finally {
    unlisten();
  }
}

export async function parseCurl(curlCommand: string): Promise<TestConfig> {
  return await invoke<TestConfig>("parse_curl", { curlCommand });
}
