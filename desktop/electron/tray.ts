import { app, Menu, nativeImage, Tray, type NativeImage } from "electron";

import { hideFloatingWindow, showFloatingWindow } from "./floating-window";
import { resolveAppIconPath } from "./app-icon";
import { getSettings, hasTokens, windows } from "./state";

let tray: Tray | null = null;
let latestSyncStatus = "未登录";

export function createAppTray(): Tray {
  if (tray) return tray;

  latestSyncStatus = hasTokens() ? "已同步" : "未登录";

  tray = new Tray(createTrayIcon());
  tray.setToolTip("TaskBridge");
  refreshTrayMenu();
  tray.on("double-click", () => windows.mainWindow?.show());
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

function formatSyncStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("syncing")) return "同步中";
  if (normalized.includes("signed-out") || normalized.includes("unauthenticated")) return "未登录";
  if (normalized.includes("offline")) return "离线";
  if (normalized.includes("error")) return "同步异常";
  if (normalized.includes("connected")) return "实时连接";
  if (normalized.includes("disconnected")) return "等待连接";
  if (normalized.includes("synced") || normalized.includes("idle")) return "已同步";
  return status || "已同步";
}

function label(zh: string, en: string): string {
  return getSettings().language === "en-US" ? en : zh;
}

function localizedSyncStatus(): string {
  if (getSettings().language !== "en-US") return latestSyncStatus;
  const map: Record<string, string> = {
    同步中: "Syncing",
    离线: "Offline",
    同步异常: "Sync error",
    实时连接: "Connected",
    等待连接: "Waiting",
    已同步: "Synced",
    未登录: "Not signed in",
  };
  return map[latestSyncStatus] ?? latestSyncStatus;
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: label("打开主窗口", "Open main window"),
        click: () => windows.mainWindow?.show(),
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
        click: () => {
          windows.mainWindow?.show();
          windows.mainWindow?.webContents.send("taskbridge:quick-add");
          windows.floatingWindow?.webContents.send("taskbridge:quick-add");
        },
      },
      {
        label: label("立即同步", "Sync now"),
        click: () => {
          windows.mainWindow?.show();
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
          windows.mainWindow?.show();
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
