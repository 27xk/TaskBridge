import { app, Menu, nativeImage, Tray, type NativeImage } from "electron";

import { toggleFloatingWindow } from "./floating-window";
import { windows } from "./state";

let tray: Tray | null = null;
let latestSyncStatus = "已同步";

export function createAppTray(): Tray {
  if (tray) return tray;

  tray = new Tray(createTrayIcon());
  tray.setToolTip("TaskBridge");
  refreshTrayMenu();
  tray.on("double-click", () => windows.mainWindow?.show());
  return tray;
}

function createTrayIcon(): NativeImage {
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
  if (normalized.includes("offline")) return "离线";
  if (normalized.includes("error")) return "同步异常";
  if (normalized.includes("connected")) return "实时连接";
  if (normalized.includes("disconnected")) return "等待连接";
  if (normalized.includes("synced") || normalized.includes("idle")) return "已同步";
  return status || "已同步";
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开主窗口",
        click: () => windows.mainWindow?.show(),
      },
      {
        label: "显示/隐藏悬浮窗",
        click: () => toggleFloatingWindow(),
      },
      {
        label: "快速添加任务",
        click: () => {
          windows.mainWindow?.show();
          windows.mainWindow?.webContents.send("taskbridge:quick-add");
          windows.floatingWindow?.webContents.send("taskbridge:quick-add");
        },
      },
      {
        label: `同步状态：${latestSyncStatus}`,
        enabled: false,
      },
      {
        label: "设置",
        click: () => {
          windows.mainWindow?.show();
          windows.mainWindow?.webContents.send("taskbridge:show-settings");
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          windows.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}
