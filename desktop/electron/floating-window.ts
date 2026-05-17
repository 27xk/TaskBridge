import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { join } from "node:path";

import {
  getFloatingOpacity,
  getFloatingPosition,
  saveFloatingPosition as persistFloatingPosition,
  setFloatingOpacity as persistFloatingOpacity,
  settingsStore,
  windows,
} from "./state";

const FLOATING_WIDTH = 320;
const FLOATING_HEIGHT = 460;

export function createFloatingWindow(): BrowserWindow {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    return windows.floatingWindow;
  }

  const restoredPosition = getSafeFloatingPosition();
  const floatingWindow = new BrowserWindow({
    width: FLOATING_WIDTH,
    height: FLOATING_HEIGHT,
    ...(restoredPosition ?? {}),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: settingsStore.get("floatingVisibleOnStart"),
    resizable: false,
    title: "TaskBridge Floating",
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  floatingWindow.setOpacity(getFloatingOpacity());
  floatingWindow.setAlwaysOnTop(true, "floating");
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

  floatingWindow.on("close", (event) => {
    saveCurrentFloatingPosition();
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

export function showFloatingWindow(): void {
  const floatingWindow = createFloatingWindow();
  floatingWindow.show();
  floatingWindow.setAlwaysOnTop(true, "floating");
  floatingWindow.focus();
}

export function hideFloatingWindow(): void {
  saveCurrentFloatingPosition();
  windows.floatingWindow?.hide();
}

export function toggleFloatingWindow(): void {
  const floatingWindow = createFloatingWindow();
  if (floatingWindow.isVisible()) {
    floatingWindow.hide();
  } else {
    floatingWindow.show();
    floatingWindow.focus();
  }
}

export function setFloatingWindowOpacity(opacity: number): number {
  const normalized = persistFloatingOpacity(opacity);
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    windows.floatingWindow.setOpacity(normalized);
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

export function saveFloatingWindowPosition(x?: number, y?: number): { x: number | null; y: number | null } {
  if (typeof x === "number" && typeof y === "number") {
    persistFloatingPosition(x, y);
    return { x: Math.round(x), y: Math.round(y) };
  }

  saveCurrentFloatingPosition();
  return getFloatingWindowPosition();
}

export function notifyFloatingTasksChanged(): void {
  if (windows.floatingWindow && !windows.floatingWindow.isDestroyed()) {
    windows.floatingWindow.webContents.send("taskbridge:tasks-changed");
  }
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

function getSafeFloatingPosition(): Pick<Rectangle, "x" | "y"> | null {
  const position = getFloatingPosition();
  if (position.x === null || position.y === null) return null;

  const displays = screen.getAllDisplays();
  const isVisible = displays.some((display) => {
    const area = display.workArea;
    const right = position.x + FLOATING_WIDTH;
    const bottom = position.y + FLOATING_HEIGHT;
    return (
      position.x >= area.x - FLOATING_WIDTH + 80 &&
      position.y >= area.y - 80 &&
      right <= area.x + area.width + FLOATING_WIDTH - 80 &&
      bottom <= area.y + area.height + FLOATING_HEIGHT - 80
    );
  });

  return isVisible ? { x: position.x, y: position.y } : null;
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const devRendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!app.isPackaged && devRendererUrl && targetUrl.startsWith(devRendererUrl)) return;
    event.preventDefault();
  });
}
