import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./store";
import * as Sentry from "@sentry/react";

// 🛡️ Khởi tạo Sentry - Mắt thần báo lỗi cho Frontend
Sentry.init({
  dsn: "https://4c90b9c2daaf333a57c7b65bf84d78fb@o4510973801005056.ingest.de.sentry.io/4510973863985232",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0,
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// ⚡ Fix 1.2: Listen for force-cancel events from backend
// Khi backend huỷ test cũ để chạy test mới, Frontend cập nhật ngay trạng thái
listen("test_force_cancelled", () => {
  const state = useAppStore.getState();
  if (state.runStatus === "running" || state.runStatus === "cancelling") {
    useAppStore.setState({ runStatus: "cancelled" });
    console.warn("[main] Previous test force-cancelled by new run");
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
