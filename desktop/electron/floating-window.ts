import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  getFloatingOpacity,
  getFloatingPosition,
  getFloatingSize,
  normalizeFloatingSize,
  saveFloatingBounds,
  saveFloatingPosition as persistFloatingPosition,
  saveFloatingSize as persistFloatingSize,
  setFloatingOpacity as persistFloatingOpacity,
  windows,
} from "./state";
import {
  ensureWindowOnScreen,
  flushWindowLayout,
  getVisibleWindowBounds,
  trackWindowLayout,
} from "./window-layout";

const MIN_FLOATING_WIDTH = 280;
const MIN_FLOATING_HEIGHT = 260;
const MAX_FLOATING_WIDTH = 520;
const MAX_FLOATING_HEIGHT = 720;
const FLOATING_WINDOW_LIMITS = {
  minWidth: MIN_FLOATING_WIDTH,
  minHeight: MIN_FLOATING_HEIGHT,
  maxWidth: MAX_FLOATING_WIDTH,
  maxHeight: MAX_FLOATING_HEIGHT,
};
let floatingTasksChangedTimer: NodeJS.Timeout | null = null;
let revealWhenReady = false;
let floatingIdleTimer: NodeJS.Timeout | null = null;
let floatingDraftDurable = false;
const FLOATING_IDLE_MS = 60_000;

export function createFloatingWindow(): BrowserWindow {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    return windows.floatingWindow;
  }
  floatingDraftDurable = false;

  const restoredSize = getFloatingSize();
  const savedPosition = getFloatingPosition();
  const position = savedPosition.x !== null && savedPosition.y !== null
    ? { x: savedPosition.x, y: savedPosition.y }
    : getDefaultFloatingPosition();
  const bounds = getVisibleWindowBounds({ ...position, ...restoredSize }, FLOATING_WINDOW_LIMITS);
  const preloadPath = resolvePreloadPath();
  const floatingWindow = new BrowserWindow({
    ...bounds,
    minWidth: Math.min(MIN_FLOATING_WIDTH, bounds.width),
    minHeight: Math.min(MIN_FLOATING_HEIGHT, bounds.height),
    maxWidth: MAX_FLOATING_WIDTH,
    maxHeight: MAX_FLOATING_HEIGHT,
    frame: false,
    transparent: false,
    backgroundColor: "#f8faf9",
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: true,
    title: "TaskBridge Floating",
    hasShadow: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  floatingWindow.webContents.on("preload-error", (_event, preload, error) => {
    console.error("[TaskBridge] floating preload failed", { preload, error });
  });
  floatingWindow.webContents.on("did-start-loading", () => {
    floatingDraftDurable = false;
    cancelFloatingIdleTimer();
  });

  trackWindowLayout(floatingWindow, { bounds, maximized: false }, FLOATING_WINDOW_LIMITS, (layout) => {
    saveFloatingBounds(layout.bounds);
  });
  floatingWindow.setOpacity(getFloatingOpacity());
  floatingWindow.setAlwaysOnTop(true, "pop-up-menu");
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hardenNavigation(floatingWindow);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl && !app.isPackaged) {
    floatingWindow.loadURL(`${rendererUrl}?view=floating`);
  } else {
    floatingWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { view: "floating" },
    });
  }

  floatingWindow.once("ready-to-show", () => {
    if (revealWhenReady) {
      revealWhenReady = false;
      revealFloatingWindow(floatingWindow);
    }
  });

  floatingWindow.on("show", () => {
    cancelFloatingIdleTimer();
    floatingWindow.webContents.send("taskbridge:floating-visibility-changed", true);
  });
  floatingWindow.on("hide", () => {
    if (floatingTasksChangedTimer !== null) clearTimeout(floatingTasksChangedTimer);
    floatingTasksChangedTimer = null;
    floatingWindow.webContents.send("taskbridge:floating-visibility-changed", false);
    scheduleFloatingIdle(floatingWindow);
  });

  floatingWindow.on("close", (event) => {
    revealWhenReady = false;
    flushWindowLayout(floatingWindow);
    if (!windows.isQuitting) {
      event.preventDefault();
      floatingWindow.hide();
    }
  });

  floatingWindow.on("closed", () => {
    revealWhenReady = false;
    if (windows.floatingWindow === floatingWindow) {
      cancelFloatingIdleTimer();
      if (floatingTasksChangedTimer !== null) clearTimeout(floatingTasksChangedTimer);
      floatingTasksChangedTimer = null;
      windows.floatingWindow = null;
    }
  });

  windows.floatingWindow = floatingWindow;
  return floatingWindow;
}

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, "../preload/index.cjs"),
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs"),
  ];
  const preloadPath = candidates.find((candidate) => existsSync(candidate));
  if (!preloadPath) {
    console.error("[TaskBridge] floating preload not found", { __dirname, candidates });
    return candidates[0];
  }
  return preloadPath;
}

export function showFloatingWindow(): boolean {
  cancelFloatingIdleTimer();
  const floatingWindow = createFloatingWindow();
  revealWhenReady = floatingWindow.webContents.isLoading();
  revealFloatingWindow(floatingWindow);
  return floatingWindow.isVisible();
}

function cancelFloatingIdleTimer(): void {
  if (floatingIdleTimer !== null) clearTimeout(floatingIdleTimer);
  floatingIdleTimer = null;
}

function scheduleFloatingIdle(window: BrowserWindow): void {
  cancelFloatingIdleTimer();
  if (!floatingDraftDurable || window.isDestroyed() || window.isVisible()) return;
  floatingIdleTimer = setTimeout(() => {
    floatingIdleTimer = null;
    if (!floatingDraftDurable || windows.floatingWindow !== window || window.isDestroyed() || window.isVisible()) return;
    flushWindowLayout(window);
    window.destroy();
  }, FLOATING_IDLE_MS);
  floatingIdleTimer.unref?.();
}

export function setFloatingDraftDurable(durable: boolean): void {
  floatingDraftDurable = durable;
  const window = windows.floatingWindow;
  if (!window || window.isDestroyed()) return;
  if (!durable) cancelFloatingIdleTimer();
  else if (!window.isVisible()) scheduleFloatingIdle(window);
}

function revealFloatingWindow(floatingWindow: BrowserWindow): void {
  if (floatingWindow.isDestroyed()) return;
  if (floatingWindow.isMinimized()) {
    floatingWindow.restore();
  }
  ensureWindowOnScreen(floatingWindow);
  floatingWindow.setSkipTaskbar(true);
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingWindow.setAlwaysOnTop(true, "pop-up-menu");
  floatingWindow.show();
  floatingWindow.moveTop();
  floatingWindow.focus();
}

export function hideFloatingWindow(): boolean {
  revealWhenReady = false;
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    flushWindowLayout(windows.floatingWindow);
    windows.floatingWindow.hide();
  }
  return false;
}

export function toggleFloatingWindow(): boolean {
  const existingWindow = windows.floatingWindow && !windows.floatingWindow.isDestroyed() ? windows.floatingWindow : null;
  if (!existingWindow) {
    return showFloatingWindow();
  }
  const floatingWindow = createFloatingWindow();
  if (floatingWindow.isVisible()) {
    return hideFloatingWindow();
  }
  return showFloatingWindow();
}

export function isFloatingWindowVisible(): boolean {
  return Boolean(windows.floatingWindow && !windows.floatingWindow.isDestroyed() && windows.floatingWindow.isVisible());
}

export function setFloatingWindowOpacity(opacity: number): number {
  const normalized = persistFloatingOpacity(opacity);
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    windows.floatingWindow.setOpacity(normalized);
    windows.floatingWindow.webContents.send("taskbridge:floating-opacity-changed", normalized);
  }
  return normalized;
}

export function getFloatingWindowPosition(): { x: number | null; y: number | null } {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    const { x, y } = windows.floatingWindow.getNormalBounds();
    return { x, y };
  }
  return getFloatingPosition();
}

export function getFloatingWindowSize(): { width: number; height: number } {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    const { width, height } = windows.floatingWindow.getNormalBounds();
    return { width, height };
  }
  return getFloatingSize();
}

export function setFloatingWindowSize(width: number, height: number): { width: number; height: number } {
  const next = normalizeFloatingSize(width, height);
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    windows.floatingWindow.setSize(next.width, next.height, false);
    ensureWindowOnScreen(windows.floatingWindow);
    return getFloatingWindowSize();
  }
  return persistFloatingSize(next.width, next.height);
}

export function saveFloatingWindowPosition(x?: number, y?: number): { x: number | null; y: number | null } {
  if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
    const position = getVisibleWindowBounds({ x, y, ...getFloatingWindowSize() }, FLOATING_WINDOW_LIMITS);
    persistFloatingPosition(position.x, position.y);
    return { x: position.x, y: position.y };
  }

  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) flushWindowLayout(windows.floatingWindow);
  return getFloatingWindowPosition();
}

export function notifyFloatingTasksChanged(): void {
  if (!isFloatingWindowVisible()) return;
  if (floatingTasksChangedTimer !== null) {
    clearTimeout(floatingTasksChangedTimer);
  }
  floatingTasksChangedTimer = setTimeout(() => {
    floatingTasksChangedTimer = null;
    if (windows.floatingWindow && isFloatingWindowVisible()) {
      windows.floatingWindow.webContents.send("taskbridge:tasks-changed");
    }
  }, 150);
}

export function notifyFloatingSyncStatusChanged(): void {
  if (windows.floatingWindow && isFloatingWindowVisible()) {
    windows.floatingWindow.webContents.send("taskbridge:sync-status-changed");
  }
}

function getDefaultFloatingPosition(): Pick<Rectangle, "x" | "y"> {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const size = getFloatingSize();
  return {
    x: Math.max(area.x, area.x + area.width - size.width - 24),
    y: Math.max(area.y, area.y + 64),
  };
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const devRendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!app.isPackaged && devRendererUrl && targetUrl.startsWith(devRendererUrl)) return;
    event.preventDefault();
  });
}
