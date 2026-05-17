import { app, BrowserWindow } from "electron";
import { join } from "node:path";

import { createFloatingWindow } from "./floating-window";
import { registerIpcHandlers } from "./ipc";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./shortcut";
import { windows } from "./state";
import { createAppTray } from "./tray";

function createMainWindow(showOnReady = true): BrowserWindow {
  if (windows.mainWindow && !windows.mainWindow.isDestroyed()) {
    return windows.mainWindow;
  }

  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: "TaskBridge",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (showOnReady) mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (!windows.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    windows.mainWindow = null;
  });

  hardenNavigation(mainWindow);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl && !app.isPackaged) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  windows.mainWindow = mainWindow;
  return mainWindow;
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const devRendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (!app.isPackaged && devRendererUrl && targetUrl.startsWith(devRendererUrl)) return;
    event.preventDefault();
  });
}

app.on("before-quit", () => {
  windows.isQuitting = true;
});

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.taskbridge.desktop");
  }

  registerIpcHandlers();
  const launchedHidden = app.getLoginItemSettings().wasOpenedAsHidden;
  createMainWindow(!launchedHidden);
  createFloatingWindow();
  createAppTray();
  registerGlobalShortcuts();

  app.on("activate", () => {
    createMainWindow().show();
  });
});

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
});
