import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  getFloatingOpacity,
  getFloatingPosition,
  getFloatingSize,
  saveFloatingPosition as persistFloatingPosition,
  saveFloatingSize as persistFloatingSize,
  setFloatingOpacity as persistFloatingOpacity,
  settingsStore,
  windows,
} from "./state";

const MIN_FLOATING_WIDTH = 280;
const MIN_FLOATING_HEIGHT = 260;
const MAX_FLOATING_WIDTH = 520;
const MAX_FLOATING_HEIGHT = 720;
let floatingTasksChangedTimer: NodeJS.Timeout | null = null;
let revealWhenReady = false;

export function createFloatingWindow(): BrowserWindow {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    return windows.floatingWindow;
  }

  const restoredSize = getFloatingSize();
  const restoredPosition = getSafeFloatingPosition() ?? getDefaultFloatingPosition();
  const preloadPath = resolvePreloadPath();
  const floatingWindow = new BrowserWindow({
    width: restoredSize.width,
    height: restoredSize.height,
    minWidth: MIN_FLOATING_WIDTH,
    minHeight: MIN_FLOATING_HEIGHT,
    maxWidth: MAX_FLOATING_WIDTH,
    maxHeight: MAX_FLOATING_HEIGHT,
    ...(restoredPosition ?? {}),
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

  floatingWindow.on("moved", () => {
    saveCurrentFloatingPosition();
  });
  floatingWindow.on("resized", () => {
    saveCurrentFloatingSize();
    ensureFloatingWindowOnScreen(floatingWindow);
  });

  floatingWindow.once("ready-to-show", () => {
    if (settingsStore.get("floatingVisibleOnStart") || revealWhenReady) {
      revealWhenReady = false;
      revealFloatingWindow(floatingWindow);
    }
  });

  floatingWindow.on("close", (event) => {
    saveCurrentFloatingPosition();
    saveCurrentFloatingSize();
    if (!windows.isQuitting) {
      event.preventDefault();
      floatingWindow.hide();
    }
  });

  floatingWindow.on("closed", () => {
    windows.floatingWindow = null;
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
  const floatingWindow = createFloatingWindow();
  if (floatingWindow.webContents.isLoading()) {
    revealWhenReady = true;
  }
  revealFloatingWindow(floatingWindow, true);
  return floatingWindow.isVisible();
}

function revealFloatingWindow(floatingWindow: BrowserWindow, preferActiveDisplay = false): void {
  if (floatingWindow.isDestroyed()) return;
  if (floatingWindow.isMinimized()) {
    floatingWindow.restore();
  }
  if (preferActiveDisplay) {
    const target = getDefaultFloatingPosition();
    floatingWindow.setPosition(target.x, target.y, false);
  } else {
    ensureFloatingWindowOnScreen(floatingWindow);
  }
  floatingWindow.setSkipTaskbar(true);
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingWindow.setAlwaysOnTop(true, "pop-up-menu");
  floatingWindow.show();
  floatingWindow.moveTop();
  floatingWindow.focus();
}

export function hideFloatingWindow(): boolean {
  saveCurrentFloatingPosition();
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
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
    const [x, y] = windows.floatingWindow.getPosition();
    return { x, y };
  }
  return getFloatingPosition();
}

export function getFloatingWindowSize(): { width: number; height: number } {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    const [width, height] = windows.floatingWindow.getSize();
    return { width, height };
  }
  return getFloatingSize();
}

export function setFloatingWindowSize(width: number, height: number): { width: number; height: number } {
  const next = persistFloatingSize(width, height);
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    windows.floatingWindow.setSize(next.width, next.height, false);
    ensureFloatingWindowOnScreen(windows.floatingWindow);
  }
  return next;
}

export function saveFloatingWindowPosition(x?: number, y?: number): { x: number | null; y: number | null } {
  if (typeof x === "number" && typeof y === "number") {
    persistFloatingPosition(x, y);
    return { x: Math.round(x), y: Math.round(y) };
  }

  saveCurrentFloatingPosition();
  return getFloatingWindowPosition();
}

export function notifyFloatingTasksChanged(): void {
  if (floatingTasksChangedTimer !== null) {
    clearTimeout(floatingTasksChangedTimer);
  }
  floatingTasksChangedTimer = setTimeout(() => {
    floatingTasksChangedTimer = null;
    if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
      windows.floatingWindow.webContents.send("taskbridge:tasks-changed");
    }
  }, 150);
}

export function notifyFloatingSyncStatusChanged(): void {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    windows.floatingWindow.webContents.send("taskbridge:sync-status-changed");
  }
}

function saveCurrentFloatingPosition(): void {
  if (!windows.floatingWindow || windows.floatingWindow.isDestroyed()) return;
  const [x, y] = windows.floatingWindow.getPosition();
  persistFloatingPosition(x, y);
}

function saveCurrentFloatingSize(): void {
  if (!windows.floatingWindow || windows.floatingWindow.isDestroyed()) return;
  const [width, height] = windows.floatingWindow.getSize();
  persistFloatingSize(width, height);
}

function getSafeFloatingPosition(): Pick<Rectangle, "x" | "y"> | null {
  const position = getFloatingPosition();
  if (position.x === null || position.y === null) return null;
  const { x, y } = position;
  const size = getFloatingSize();

  const displays = screen.getAllDisplays();
  const isVisible = displays.some((display) => {
    const area = display.workArea;
    const right = x + size.width;
    const bottom = y + size.height;
    return (
      x >= area.x &&
      y >= area.y &&
      right <= area.x + area.width &&
      bottom <= area.y + area.height
    );
  });

  return isVisible ? { x, y } : null;
}

function getDefaultFloatingPosition(): Pick<Rectangle, "x" | "y"> {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const size = getFloatingSize();
  return {
    x: Math.max(area.x, area.x + area.width - size.width - 24),
    y: Math.max(area.y, area.y + 64),
  };
}

function ensureFloatingWindowOnScreen(floatingWindow: BrowserWindow): void {
  const [currentX, currentY] = floatingWindow.getPosition();
  const target = getSafePositionForBounds(currentX, currentY) ?? getDefaultFloatingPosition();
  if (target.x !== currentX || target.y !== currentY) {
    floatingWindow.setPosition(target.x, target.y, false);
  }
}

function getSafePositionForBounds(x: number, y: number): Pick<Rectangle, "x" | "y"> | null {
  const size = getFloatingSize();
  for (const display of screen.getAllDisplays()) {
    const area = display.workArea;
    const nextX = Math.min(Math.max(x, area.x), area.x + area.width - size.width);
    const nextY = Math.min(Math.max(y, area.y), area.y + area.height - size.height);
    if (
      nextX >= area.x &&
      nextY >= area.y &&
      nextX + size.width <= area.x + area.width &&
      nextY + size.height <= area.y + area.height
    ) {
      return { x: Math.round(nextX), y: Math.round(nextY) };
    }
  }
  return null;
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const devRendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!app.isPackaged && devRendererUrl && targetUrl.startsWith(devRendererUrl)) return;
    event.preventDefault();
  });
}
