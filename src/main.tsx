import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./store";
import * as Sentry from "@sentry/react";

// 🛡️ Sentry — DSN từ env var (không hardcode secret vào source)
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN ?? "",
  integrations: [Sentry.browserTracingIntegration()],
  // 10% sampling — đủ để monitor, không tốn quota
  tracesSampleRate: 0.1,
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
    <Sentry.ErrorBoundary
      fallback={
        <p style={{ color: "red", padding: 20 }}>
          App crashed. Check Sentry for details.
        </p>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
