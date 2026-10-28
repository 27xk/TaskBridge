import { screen, type BrowserWindow } from "electron";

import {
  clampWindowBounds,
  normalizeWindowBounds,
  sameWindowBounds,
  type WindowBounds,
  type WindowLayoutState,
  type WindowSizeLimits,
} from "../common/window-layout";

interface WindowLayoutController {
  ensureVisible(): void;
  flush(): void;
}

const layouts = new Map<BrowserWindow, WindowLayoutController>();
const WINDOW_LAYOUT_SAVE_INTERVAL = 250;

export function getVisibleWindowBounds(bounds: WindowBounds, limits: WindowSizeLimits): WindowBounds {
  return clampWindowBounds(bounds, screen.getAllDisplays().map((display) => display.workArea), limits);
}

export function trackWindowLayout(
  window: BrowserWindow,
  initial: WindowLayoutState,
  limits: WindowSizeLimits,
  persist: (state: WindowLayoutState) => void,
): void {
  let normalBounds = { ...initial.bounds };
  let maximized = initial.maximized;
  let restoreMaximizedOnShow = initial.maximized;
  let lastSaved: WindowLayoutState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function capture(): void {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    if (!restoreMaximizedOnShow) maximized = window.isMaximized();
    if (!window.isMaximized()) {
      const current = normalizeWindowBounds(window.getNormalBounds());
      if (current) normalBounds = getVisibleWindowBounds(current, limits);
    }
  }

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (window.isDestroyed()) return;
    capture();
    if (lastSaved && lastSaved.maximized === maximized && sameWindowBounds(lastSaved.bounds, normalBounds)) return;
    const next = { bounds: { ...normalBounds }, maximized };
    persist(next);
    lastSaved = next;
  }

  function schedule(): void {
    if (window.isDestroyed()) return;
    capture();
    if (timer === null) timer = setTimeout(flush, WINDOW_LAYOUT_SAVE_INTERVAL);
  }

  function ensureVisible(): void {
    if (window.isDestroyed()) return;
    capture();
    normalBounds = getVisibleWindowBounds(normalBounds, limits);
    if (!window.isMinimized() && !window.isMaximized() && !window.isFullScreen()) {
      // A removed monitor may leave less room than the usual minimum size.
      window.setMinimumSize(Math.min(limits.minWidth ?? 1, normalBounds.width), Math.min(limits.minHeight ?? 1, normalBounds.height));
      if (!sameWindowBounds(window.getBounds(), normalBounds)) window.setBounds(normalBounds, false);
    }
    schedule();
  }

  layouts.set(window, { ensureVisible, flush });
  window.on("move", schedule);
  window.on("resize", schedule);
  window.on("moved", ensureVisible);
  window.on("resized", ensureVisible);
  window.on("maximize", () => {
    restoreMaximizedOnShow = false;
    maximized = true;
    schedule();
  });
  window.on("unmaximize", () => {
    restoreMaximizedOnShow = false;
    maximized = false;
    ensureVisible();
  });
  window.on("minimize", schedule);
  window.on("restore", ensureVisible);
  window.on("show", () => {
    ensureVisible();
    if (restoreMaximizedOnShow) {
      restoreMaximizedOnShow = false;
      window.maximize();
    }
  });
  window.on("hide", flush);
  window.on("close", flush);
  screen.on("display-removed", ensureVisible);
  screen.on("display-metrics-changed", ensureVisible);
  window.once("closed", () => {
    if (timer !== null) clearTimeout(timer);
    layouts.delete(window);
    screen.removeListener("display-removed", ensureVisible);
    screen.removeListener("display-metrics-changed", ensureVisible);
  });
}

export function ensureWindowOnScreen(window: BrowserWindow): void {
  layouts.get(window)?.ensureVisible();
}

export function flushWindowLayout(window: BrowserWindow): void {
  layouts.get(window)?.flush();
}

export function flushWindowLayouts(): void {
  for (const controller of layouts.values()) controller.flush();
}

export function showWindow(window: BrowserWindow | null | undefined): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  ensureWindowOnScreen(window);
  window.show();
  window.focus();
}
