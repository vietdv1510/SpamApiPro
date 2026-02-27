import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./store";

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
