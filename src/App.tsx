import React, { useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TestConfig } from "./components/TestConfig";
import { LiveMonitor } from "./components/LiveMonitor";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { History } from "./components/History";
import { Scenarios } from "./components/Scenarios";
import { useAppStore } from "./store";

const TABS = [
  { id: "test", label: "Test" },
  { id: "results", label: "Results" },
  { id: "history", label: "History" },
  { id: "scenarios", label: "Scenarios" },
] as const;

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 340;

function App() {
  const { activeTab, setActiveTab, runStatus, currentResult, history } =
    useAppStore();

  // ─── Resizable left panel ───
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = panelWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = ev.clientX - startX.current;
        const newWidth = Math.max(
          MIN_PANEL_WIDTH,
          Math.min(MAX_PANEL_WIDTH, startWidth.current + delta),
        );
        setPanelWidth(newWidth);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth],
  );

  return (
    <div className="flex flex-col h-screen bg-bg-900 text-gray-100 select-none">
      {/* Header bar — onMouseDown startDragging() is the reliable Tauri v2 drag API */}
      <div
        className="h-10 w-full shrink-0 bg-bg-900 border-b border-bg-700 flex items-center justify-end px-5 cursor-default"
        onMouseDown={(e) => {
          // Only drag on left-click on empty area (not on badges)
          if (e.target === e.currentTarget && e.button === 0) {
            getCurrentWindow().startDragging();
          }
        }}
        onDoubleClick={(e) => {
          // Double-click empty area to toggle maximize
          if (e.target === e.currentTarget) {
            const win = getCurrentWindow();
            win.isMaximized().then((maximized) => {
              if (maximized) win.unmaximize();
              else win.maximize();
            });
          }
        }}
      >
        <div className="flex items-center gap-2">
          {runStatus === "running" && (
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-full px-3 py-0.5">
              <span className="w-1.5 h-1.5 bg-primary rounded-full pulse-dot" />
              <span className="text-xs text-primary font-medium">Running</span>
            </div>
          )}
          {runStatus === "completed" && (
            <div className="flex items-center gap-1.5 bg-success/10 border border-success/30 rounded-full px-3 py-0.5">
              <span className="text-xs text-success font-medium">
                Completed
              </span>
            </div>
          )}
          {runStatus === "cancelled" && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-0.5">
              <span className="text-xs text-amber-400 font-medium">
                Stopped
              </span>
            </div>
          )}
          {history.length > 0 && (
            <span className="text-xs text-gray-600 font-mono">
              {history.length} runs
            </span>
          )}
        </div>
      </div>

      {/* Main Layout: Resizable Left Panel + Right Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Test Config (resizable) */}
        <div
          className="flex-shrink-0 border-r border-bg-700 flex flex-col overflow-hidden"
          style={{ width: `${panelWidth}px`, minWidth: `${MIN_PANEL_WIDTH}px` }}
        >
          <div className="px-4 py-3 border-b border-bg-700 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              Configure
            </h2>
            <span className="text-[10px] text-gray-700 font-mono">
              {panelWidth}px
            </span>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            <TestConfig />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="resize-handle"
          onMouseDown={handleMouseDown}
          title="Drag to resize"
        >
          <div className="resize-handle-dots">
            <span />
            <span />
            <span />
          </div>
        </div>

        {/* Right: Tabbed area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs — minimal clean design */}
          <div className="flex border-b border-bg-700 px-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-3 text-xs font-semibold tracking-wide uppercase transition-all ${
                  activeTab === tab.id
                    ? "text-primary tab-active"
                    : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {tab.label}
                {tab.id === "results" &&
                currentResult?.race_conditions_detected ? (
                  <span className="absolute top-2.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                ) : null}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden p-4">
            {activeTab === "test" && <LiveMonitor />}
            {activeTab === "results" && <ResultsDashboard />}
            {activeTab === "history" && <History />}
            {activeTab === "scenarios" && <Scenarios />}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-bg-700 bg-bg-800">
        <div className="text-xs text-gray-600 font-mono">
          Engine: Rust + Tokio + reqwest • Metrics: HDR Histogram
        </div>
        <div className="text-xs text-gray-700 font-mono">
          SpamAPI Pro v0.1.0
        </div>
      </div>
    </div>
  );
}

export default App;
