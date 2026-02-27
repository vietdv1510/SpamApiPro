import React, { useRef, useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TestConfig } from "./components/TestConfig";
import { LiveMonitor } from "./components/LiveMonitor";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { History } from "./components/History";
import { Scenarios } from "./components/Scenarios";
import { Toast, ConfirmModal, confirmDialog } from "./components/Dialogs";
import { useAppStore, type SidebarSection } from "./store";

/** Sidebar items — monochrome icons */
const SIDEBAR_ITEMS: {
  id: SidebarSection;
  label: string;
  tooltip: string;
}[] = [
  { id: "test", label: "Test", tooltip: "Load Test" },
  { id: "scenarios", label: "Flows", tooltip: "Multi-Step Scenarios" },
  { id: "history", label: "History", tooltip: "Test History" },
];

/** Simple monochrome SVG icons */
function SidebarIcon({ id }: { id: SidebarSection }) {
  const cls = "w-5 h-5";
  switch (id) {
    case "test":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "scenarios":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="5" cy="6" r="3" />
          <circle cx="19" cy="6" r="3" />
          <circle cx="12" cy="18" r="3" />
          <line x1="5" y1="9" x2="12" y2="15" />
          <line x1="19" y1="9" x2="12" y2="15" />
        </svg>
      );
    case "history":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
  }
}

/** Sub-tabs for the Test section */
const TEST_TABS = [
  { id: "test" as const, label: "Live" },
  { id: "results" as const, label: "Results" },
];

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 340;

function App() {
  const {
    activeSection,
    setActiveSection,
    activeTab,
    setActiveTab,
    runStatus,
    currentResult,
    history,
    scenariosDirty,
  } = useAppStore();

  /** Guard chuyển section — cảnh báo nếu có unsaved changes */
  const handleSectionChange = async (id: SidebarSection) => {
    if (activeSection === "scenarios" && id !== "scenarios" && scenariosDirty) {
      const ok = await confirmDialog(
        "You have unsaved scenario changes. Leave anyway?",
      );
      if (!ok) return;
      useAppStore.getState().setScenariosDirty(false);
    }
    setActiveSection(id);
    if (id === "test") setActiveTab("test");
  };

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
      {/* Header bar */}
      <div
        className="h-10 w-full shrink-0 bg-bg-900 border-b border-bg-700 flex items-center justify-end px-5 cursor-default"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && e.button === 0) {
            getCurrentWindow().startDragging();
          }
        }}
        onDoubleClick={(e) => {
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

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Vertical Sidebar ─── */}
        <div className="w-16 shrink-0 bg-bg-900 border-r border-bg-700 flex flex-col items-center py-3 gap-2">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSectionChange(item.id)}
              title={item.tooltip}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                activeSection === item.id
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-gray-600 hover:text-gray-400 hover:bg-bg-700 border border-transparent"
              }`}
            >
              <SidebarIcon id={item.id} />
              <span className="text-[9px] font-medium leading-none">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* ─── Section: Test (Config + Live/Results) ─── */}
        {activeSection === "test" && (
          <>
            {/* Left: Test Config (resizable) */}
            <div
              className="flex-shrink-0 border-r border-bg-700 flex flex-col overflow-hidden"
              style={{
                width: `${panelWidth}px`,
                minWidth: `${MIN_PANEL_WIDTH}px`,
              }}
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

            {/* Right: Live/Results sub-tabs */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex border-b border-bg-700 px-2">
                {TEST_TABS.map((tab) => (
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
              <div className="flex-1 overflow-hidden p-4">
                {activeTab === "test" && <LiveMonitor />}
                {activeTab === "results" && <ResultsDashboard />}
              </div>
            </div>
          </>
        )}

        {/* ─── Section: Scenarios (always mounted, CSS toggle) ─── */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ display: activeSection === "scenarios" ? "flex" : "none" }}
        >
          <div className="px-4 py-3 border-b border-bg-700">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              Multi-Step Scenarios
            </h2>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <Scenarios />
          </div>
        </div>

        {/* ─── Section: History (always mounted, CSS toggle) ─── */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ display: activeSection === "history" ? "flex" : "none" }}
        >
          <div className="px-4 py-3 border-b border-bg-700">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              Test History
            </h2>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <History />
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
      <Toast />
      <ConfirmModal />
    </div>
  );
}

export default App;
