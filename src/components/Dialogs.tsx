import { useState, useEffect } from "react";

// ─── Toast Notification ───
let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let setToastGlobal: ((msg: string | null) => void) | null = null;

export function showToast(msg: string) {
  setToastGlobal?.(msg);
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => setToastGlobal?.(null), 2500);
}

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setToastGlobal = setMsg;
    return () => {
      setToastGlobal = null;
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up">
      <div className="bg-bg-700 border border-bg-500 text-gray-200 text-xs font-medium px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2">
        <svg
          className="w-4 h-4 text-success shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {msg}
      </div>
    </div>
  );
}

// ─── Confirm Modal ───
interface ConfirmState {
  message: string;
  resolve: (ok: boolean) => void;
}

let setConfirmGlobal: ((state: ConfirmState | null) => void) | null = null;

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    setConfirmGlobal?.({ message, resolve });
  });
}

export function ConfirmModal() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    setConfirmGlobal = setState;
    return () => {
      setConfirmGlobal = null;
    };
  }, []);

  if (!state) return null;

  const handleClose = (ok: boolean) => {
    state.resolve(ok);
    setState(null);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => handleClose(false)}
    >
      <div
        className="bg-bg-800 border border-bg-600 rounded-2xl shadow-2xl p-5 w-80 slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-gray-300 mb-5">{state.message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => handleClose(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-bg-700 text-gray-400 hover:text-gray-200 hover:bg-bg-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => handleClose(true)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
