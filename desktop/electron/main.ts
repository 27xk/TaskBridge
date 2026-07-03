import { app, BrowserWindow, Menu } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { resolveAppIconPath } from "./app-icon";
import { createFloatingWindow, showFloatingWindow } from "./floating-window";
import { registerIpcHandlers } from "./ipc";
import { showTaskNotification } from "./notification";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./shortcut";
import { consumeSettingsRecoveryNotice, getSettings, windows } from "./state";
import { createAppTray } from "./tray";
import { initializeAutoUpdater } from "./updater";

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

function createMainWindow(showOnReady = true): BrowserWindow {
  if (windows.mainWindow && !windows.mainWindow.isDestroyed()) {
    return windows.mainWindow;
  }

  const preloadPath = resolvePreloadPath();
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    title: "TaskBridge",
    icon: resolveAppIconPath(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on("preload-error", (_event, preload, error) => {
    console.error("[TaskBridge] preload failed", { preload, error });
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

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, "../preload/index.cjs"),
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs"),
  ];
  const preloadPath = candidates.find((candidate) => existsSync(candidate));
  if (!preloadPath) {
    console.error("[TaskBridge] preload not found", { __dirname, candidates });
    return candidates[0];
  }
  return preloadPath;
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
  Menu.setApplicationMenu(null);

  if (process.platform === "win32") {
    app.setAppUserModelId("com.taskbridge.desktop");
  }

  registerIpcHandlers();
  const launchedHidden = app.getLoginItemSettings().wasOpenedAsHidden;
  const mainWindow = createMainWindow(!launchedHidden);
  initializeAutoUpdater(mainWindow);
  showSettingsRecoveryNotice();

  if (process.env.TASKBRIDGE_SMOKE_TEST === "1") {
    const floatingWindow = createFloatingWindow();
    showFloatingWindow();
    Promise.all([
      assertBridgeAvailable(mainWindow, "main"),
      assertBridgeAvailable(floatingWindow, "floating"),
      assertWindowVisible(floatingWindow, "floating"),
    ]).finally(() => {
      windows.isQuitting = true;
      app.quit();
    });
    return;
  }

  if (!launchedHidden && getSettings().floatingVisibleOnStart) {
    showFloatingWindow();
  }
  createAppTray();
  registerGlobalShortcuts();

  app.on("activate", () => {
    createMainWindow().show();
  });
});

async function assertBridgeAvailable(window: BrowserWindow, name: string): Promise<void> {
  await waitForRendererLoad(window);
  const hasBridge = await window.webContents.executeJavaScript("Boolean(window.taskBridge)");
  console.log(`[TaskBridge smoke] ${name} preload bridge available: ${hasBridge}`);
}

async function assertWindowVisible(window: BrowserWindow, name: string): Promise<void> {
  await waitForRendererLoad(window);
  const bounds = window.getBounds();
  console.log(`[TaskBridge smoke] ${name} visible: ${window.isVisible()} bounds: ${JSON.stringify(bounds)}`);
}

function waitForRendererLoad(window: BrowserWindow): Promise<void> {
  if (!window.webContents.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    window.webContents.once("did-finish-load", () => resolve());
  });
}

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
});

function showSettingsRecoveryNotice(): void {
  const backupPath = consumeSettingsRecoveryNotice();
  if (!backupPath) return;
  const settings = getSettings();
  const body =
    settings.language === "en-US"
      ? `Your settings file was corrupted and has been restored. A backup was saved to ${backupPath}.`
      : `设置文件已损坏并已自动恢复，原文件备份在 ${backupPath}。`;
  showTaskNotification("TaskBridge", body);
}
