import { useCallback } from "react";
import { useAppStore } from "../store";
import { runLoadTest, parseCurl, stopTest } from "../tauri";

/** Validate URL format */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function useTestRunner() {
  const run = useCallback(async () => {
    const state = useAppStore.getState();
    const { config, getEffectiveHeaders } = state;

    if (!isValidUrl(config.url)) {
      useAppStore.setState({ runStatus: "error" });
      return { error: "Invalid URL — must start with http:// or https://" };
    }

    useAppStore.setState({ runStatus: "running" });
    state.resetLive();
    state.setCurrentResult(null);

    const effectiveConfig = {
      ...config,
      headers: getEffectiveHeaders(),
      body: config.body?.trim() || null,
    };

    try {
      const result = await runLoadTest(effectiveConfig, (progress, batch) => {
        useAppStore.getState().setProgress(progress);
        useAppStore.getState().addLiveResults(batch);
      });

      useAppStore.getState().setCurrentResult(result);
      useAppStore.getState().addToHistory(effectiveConfig, result);
      useAppStore.setState({
        runStatus: result.was_cancelled ? "cancelled" : "completed",
        activeTab: "results",
      });
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      useAppStore.setState({ runStatus: "error" });
      return { error: msg };
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      useAppStore.setState({ runStatus: "cancelling" });
      await stopTest();
    } catch {
      // Test may have already finished
    }
  }, []);

  const importCurl = useCallback(async (curlText: string) => {
    try {
      const parsed = await parseCurl(curlText);
      useAppStore.getState().applyParsedConfig(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { run, stop, importCurl };
}
