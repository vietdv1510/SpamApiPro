import { useCallback } from "react";
import { useAppStore, type HistoryItem } from "../store";
import {
  runLoadTest,
  parseCurl,
  stopTest,
  saveHistory,
  getHistory,
} from "../tauri";

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

    // Reset state
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
        const currentStatus = useAppStore.getState().runStatus;
        if (currentStatus === "running" || currentStatus === "cancelling") {
          useAppStore.getState().setProgress(progress);
          useAppStore.getState().addLiveResults(batch);
        }
      });

      useAppStore.getState().setCurrentResult(result);

      // ⚡ Lưu vào SQLite — strip timeline để tiết kiệm dung lượng
      try {
        const strippedResult = { ...result, timeline: [] };
        await saveHistory({
          timestamp: new Date().toLocaleTimeString("vi-VN"),
          url: effectiveConfig.url,
          method: effectiveConfig.method,
          mode: effectiveConfig.mode,
          virtual_users: effectiveConfig.virtual_users,
          config_json: JSON.stringify(effectiveConfig),
          result_json: JSON.stringify(strippedResult),
        });

        // Reload history từ SQLite
        await loadHistoryFromDB();
      } catch (dbErr) {
        console.warn("[run] Failed to save history to SQLite:", dbErr);
      }

      useAppStore.setState({
        runStatus: result.was_cancelled ? "cancelled" : "completed",
        activeTab: "results",
      });
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[run] ERROR:", msg);
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

/** Load history từ SQLite → Zustand store */
export async function loadHistoryFromDB() {
  try {
    const entries = await getHistory(50);
    const items: HistoryItem[] = entries.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      url: e.url,
      method: e.method,
      mode: e.mode,
      virtual_users: e.virtual_users,
      config: JSON.parse(e.config_json),
      result: JSON.parse(e.result_json),
    }));
    useAppStore.getState().setHistory(items);
  } catch (err) {
    console.warn("[loadHistoryFromDB] Error:", err);
  }
}
