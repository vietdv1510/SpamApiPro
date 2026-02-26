import { useState, useCallback } from "react";
import { useAppStore } from "../store";
import { runLoadTest, parseCurl } from "../tauri";

export function useTestRunner() {
  const {
    config,
    getEffectiveHeaders,
    setRunStatus,
    setProgress,
    setCurrentResult,
    addLiveResult,
    resetLive,
    addToHistory,
    setActiveTab,
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setError(null);
    resetLive();
    setRunStatus("running");
    setCurrentResult(null);

    const effectiveConfig = {
      ...config,
      headers: getEffectiveHeaders(),
      body: config.body?.trim() || null,
    };

    try {
      const result = await runLoadTest(
        effectiveConfig,
        (progress, reqResult) => {
          setProgress(progress);
          addLiveResult(reqResult);
        },
      );

      setCurrentResult(result);
      addToHistory(effectiveConfig, result);
      setRunStatus("completed");
      setActiveTab("results");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setRunStatus("error");
    }
  }, [config, getEffectiveHeaders]);

  const importCurl = useCallback(async (curlText: string) => {
    try {
      const parsed = await parseCurl(curlText);
      useAppStore.getState().applyParsedConfig(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { run, importCurl, error };
}
