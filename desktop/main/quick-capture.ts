import type { BrowserWindow, WebContents } from "electron";

import { createFloatingWindow, showFloatingWindow } from "./floating-window";
import { windows } from "./state";

interface CaptureState {
  ready: boolean;
  pending: boolean;
}

const captures = new WeakMap<BrowserWindow, CaptureState>();

function captureState(window: BrowserWindow): CaptureState {
  const existing = captures.get(window);
  if (existing) return existing;
  const state = { ready: false, pending: false };
  captures.set(window, state);
  const resetReadiness = () => { state.ready = false; };
  window.webContents.on("did-start-loading", resetReadiness);
  window.webContents.on("render-process-gone", resetReadiness);
  window.once("closed", () => captures.delete(window));
  return state;
}

export function openQuickCapture(): void {
  const window = createFloatingWindow();
  const state = captureState(window);
  state.pending = true;
  showFloatingWindow();
  deliverQuickCapture(window, state);
}

// The renderer calls this only after its quick-add listener and input are mounted.
export function markQuickCaptureReady(sender: WebContents): boolean {
  const window = windows.floatingWindow;
  if (!window || window.isDestroyed() || window.webContents !== sender) return false;
  const state = captureState(window);
  state.ready = true;
  deliverQuickCapture(window, state);
  return true;
}

function deliverQuickCapture(window: BrowserWindow, state: CaptureState): void {
  if (!state.ready || !state.pending || window.isDestroyed()) return;
  state.pending = false;
  window.webContents.send("taskbridge:quick-add");
}
