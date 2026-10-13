import { app, Menu, nativeImage, Tray, type NativeImage } from "electron";

import { hideFloatingWindow, showFloatingWindow } from "./floating-window";
import { resolveAppIconPath } from "./app-icon";
import { openQuickCapture } from "./quick-capture";
import { formatSyncStatus } from "../shared/sync-status";
import { showWindow } from "./window-layout";
import { getSettings, hasTokens, windows } from "./state";

let tray: Tray | null = null;
let latestSyncStatus = "未登录";

export function createAppTray(): Tray {
  if (tray) return tray;

  latestSyncStatus = hasTokens() ? "已同步" : "未登录";

  tray = new Tray(createTrayIcon());
  tray.setToolTip("TaskBridge");
  refreshTrayMenu();
  tray.on("double-click", () => showWindow(windows.mainWindow));
  return tray;
}

function createTrayIcon(): NativeImage {
  const iconPath = resolveAppIconPath();
  if (iconPath) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 });
  }

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    '<rect width="32" height="32" rx="7" fill="#167c70"/>',
    '<path d="M9 10h14v3H9zM9 15h10v3H9zM9 20h14v3H9z" fill="#ffffff"/>',
    "</svg>",
  ].join("");
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

export function setTraySyncStatus(status: string): void {
  latestSyncStatus = formatSyncStatus(status);
  refreshTrayMenu();
}

export function getTraySyncStatus(): string {
  return latestSyncStatus;
}

function label(zh: string, en: string): string {
  return getSettings().language === "en-US" ? en : zh;
}

function localizedSyncStatus(): string {
  return formatSyncStatus(latestSyncStatus, getSettings().language);
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: label("打开主窗口", "Open main window"),
        click: () => showWindow(windows.mainWindow),
      },
      {
        label: label("显示悬浮窗", "Show floating window"),
        click: () => showFloatingWindow(),
      },
      {
        label: label("隐藏悬浮窗", "Hide floating window"),
        click: () => hideFloatingWindow(),
      },
      {
        label: label("快速添加任务", "Quick add task"),
        click: openQuickCapture,
      },
      {
        label: label("立即同步", "Sync now"),
        click: () => {
          showWindow(windows.mainWindow);
          windows.mainWindow?.webContents.send("taskbridge:sync-now");
          windows.floatingWindow?.webContents.send("taskbridge:sync-status-changed");
        },
      },
      {
        label: `${label("同步状态", "Sync status")}: ${localizedSyncStatus()}`,
        enabled: false,
      },
      {
        label: label("设置", "Settings"),
        click: () => {
          showWindow(windows.mainWindow);
          windows.mainWindow?.webContents.send("taskbridge:show-settings");
        },
      },
      { type: "separator" },
      {
        label: label("退出", "Quit"),
        click: () => {
          windows.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}
