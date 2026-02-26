import { create } from "zustand";

export type TestMode = "burst" | "constant" | "ramp_up" | "stress_test";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface Header {
  key: string;
  value: string;
  enabled: boolean;
}

export interface TestConfig {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
  virtual_users: number;
  duration_secs: number | null;
  iterations: number | null;
  mode: TestMode;
  timeout_ms: number;
  think_time_ms: number;
}

export interface RequestResult {
  id: number;
  success: boolean;
  status_code: number | null;
  latency_ms: number;
  error: string | null;
  response_size_bytes: number;
  timestamp_ms: number;
  response_body?: string | null;
}

export interface TestResult {
  total_requests: number;
  success_count: number;
  error_count: number;
  total_duration_ms: number;
  requests_per_second: number;
  burst_dispatch_us: number;
  latency_min_ms: number;
  latency_max_ms: number;
  latency_avg_ms: number;
  latency_p50_ms: number;
  latency_p90_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  latency_p999_ms: number;
  race_conditions_detected: number;
  unique_responses: number;
  response_consistency: number;
  error_types: Record<string, number>;
  timeline: RequestResult[];
  status_distribution: Record<string, number>;
}

export type AppTab = "test" | "results" | "history";
export type RunStatus = "idle" | "running" | "completed" | "error";

interface AppState {
  // Config
  config: TestConfig;
  headerRows: Header[];

  // Run state
  runStatus: RunStatus;
  progress: number;
  currentResult: TestResult | null;
  liveTimeline: RequestResult[];
  liveCounters: {
    done: number;
    success: number;
    errors: number;
    totalLatency: number;
  };
  history: { config: TestConfig; result: TestResult; timestamp: string }[];

  // UI state
  activeTab: AppTab;
  curlImportText: string;
  showCurlImport: boolean;

  // Actions
  setConfig: (config: Partial<TestConfig>) => void;
  setHeaderRows: (rows: Header[]) => void;
  setRunStatus: (status: RunStatus) => void;
  setProgress: (p: number) => void;
  setCurrentResult: (r: TestResult | null) => void;
  addLiveResult: (r: RequestResult) => void;
  resetLive: () => void;
  setActiveTab: (tab: AppTab) => void;
  setCurlImportText: (text: string) => void;
  setShowCurlImport: (show: boolean) => void;
  addToHistory: (config: TestConfig, result: TestResult) => void;
  applyParsedConfig: (config: TestConfig) => void;
  getEffectiveHeaders: () => Record<string, string>;
}

export const useAppStore = create<AppState>((set, get) => ({
  config: {
    url: "https://httpbin.org/get",
    method: "GET",
    headers: {},
    body: null,
    virtual_users: 100,
    duration_secs: null,
    iterations: 1,
    mode: "burst",
    timeout_ms: 10000,
    think_time_ms: 0,
  },
  headerRows: [
    { key: "Content-Type", value: "application/json", enabled: true },
    { key: "Accept", value: "application/json", enabled: true },
    { key: "", value: "", enabled: true },
  ],
  runStatus: "idle",
  progress: 0,
  currentResult: null,
  liveTimeline: [],
  liveCounters: { done: 0, success: 0, errors: 0, totalLatency: 0 },
  history: [],
  activeTab: "test",
  curlImportText: "",
  showCurlImport: false,

  setConfig: (config) => set((s) => ({ config: { ...s.config, ...config } })),

  setHeaderRows: (rows) => set({ headerRows: rows }),

  setRunStatus: (status) => set({ runStatus: status }),

  setProgress: (progress) => set({ progress }),

  setCurrentResult: (currentResult) => set({ currentResult }),

  addLiveResult: (r) =>
    set((s) => ({
      liveTimeline: [...s.liveTimeline.slice(-200), r],
      liveCounters: {
        done: s.liveCounters.done + 1,
        success: s.liveCounters.success + (r.success ? 1 : 0),
        errors: s.liveCounters.errors + (r.success ? 0 : 1),
        totalLatency: s.liveCounters.totalLatency + r.latency_ms,
      },
    })),

  resetLive: () =>
    set({
      liveTimeline: [],
      liveCounters: { done: 0, success: 0, errors: 0, totalLatency: 0 },
      progress: 0,
    }),

  setActiveTab: (activeTab) => set({ activeTab }),

  setCurlImportText: (curlImportText) => set({ curlImportText }),

  setShowCurlImport: (showCurlImport) => set({ showCurlImport }),

  addToHistory: (config, result) =>
    set((s) => ({
      history: [
        {
          config,
          result,
          timestamp: new Date().toLocaleTimeString("vi-VN"),
        },
        ...s.history.slice(0, 19), // keep 20 entries
      ],
    })),

  applyParsedConfig: (config) => {
    const newHeaders: Header[] = Object.entries(config.headers || {}).map(
      ([key, value]) => ({ key, value, enabled: true }),
    );
    newHeaders.push({ key: "", value: "", enabled: true });
    set({
      config,
      headerRows: newHeaders,
      showCurlImport: false,
      curlImportText: "",
    });
  },

  getEffectiveHeaders: () => {
    const { headerRows } = get();
    const result: Record<string, string> = {};
    for (const h of headerRows) {
      if (h.enabled && h.key.trim()) {
        result[h.key.trim()] = h.value;
      }
    }
    return result;
  },
}));
