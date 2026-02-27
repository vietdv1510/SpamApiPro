import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 🧹 Clear bloated localStorage from old versions (timeline data overflow)
try {
  const stored = localStorage.getItem("spamapi-storage");
  if (stored && stored.length > 500_000) {
    // > 500KB = bloated
    console.warn(
      "[startup] Clearing bloated localStorage:",
      (stored.length / 1024).toFixed(0),
      "KB",
    );
    localStorage.removeItem("spamapi-storage");
  }
} catch {
  localStorage.removeItem("spamapi-storage");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
