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

    // Reset hoàn toàn state trong 1 lần set() duy nhất — atomic, không bị batch lẫn
    useAppStore.setState({
      runStatus: "running",
      activeTab: "test",
      progress: 0,
      currentResult: null,
      liveTimeline: [],
      liveCounters: { done: 0, success: 0, errors: 0, totalLatency: 0 },
    });

    const effectiveConfig = {
      ...config,
      headers: getEffectiveHeaders(),
      body: config.body?.trim() || null,
    };

    try {
      const result = await runLoadTest(effectiveConfig, (progress, batch) => {
        // Chỉ cập nhật nếu vẫn đang running
        const currentStatus = useAppStore.getState().runStatus;
        if (currentStatus === "running" || currentStatus === "cancelling") {
          useAppStore.getState().setProgress(progress);
          useAppStore.getState().addLiveResults(batch);
        }
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
    const currentStatus = useAppStore.getState().runStatus;
    if (currentStatus !== "running") return;

    try {
      useAppStore.setState({ runStatus: "cancelling" });
      await stopTest();
    } catch {
      // Nếu stop thất bại, reset status để user có thể thao tác tiếp
      const stillCancelling = useAppStore.getState().runStatus === "cancelling";
      if (stillCancelling) {
        useAppStore.setState({ runStatus: "cancelled" });
      }
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
