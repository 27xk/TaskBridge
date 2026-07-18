import { app, BrowserWindow } from "electron";
import updaterPackage from "electron-updater";

const { autoUpdater } = updaterPackage;

export type UpdateState =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateStatus {
  state: UpdateState;
  message: string;
  version?: string;
  percent?: number;
  error?: string;
  checkedAt: string;
}

let initialized = false;
let lastStatus: UpdateStatus = buildStatus("idle", "Update service has not checked yet.");

export function initializeAutoUpdater(mainWindow: BrowserWindow): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.channel = updateChannel();
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    publishStatus(buildStatus("checking", "Checking for updates."));
  });
  autoUpdater.on("update-available", (info) => {
    publishStatus(buildStatus("available", "Update is available.", { version: info.version }));
  });
  autoUpdater.on("update-not-available", (info) => {
    publishStatus(buildStatus("not-available", "No update is available.", { version: info.version }));
  });
  autoUpdater.on("download-progress", (progress) => {
    publishStatus(
      buildStatus("downloading", "Downloading update.", {
        percent: Math.round(progress.percent),
      }),
    );
  });
  autoUpdater.on("update-downloaded", (info) => {
    publishStatus(buildStatus("downloaded", "Update downloaded and will install on quit.", { version: info.version }));
  });
  autoUpdater.on("error", (error) => {
    publishStatus(buildStatus("error", "Update check failed.", { error: normalizeUpdateError(error) }));
  });

  if (!canUseAutoUpdate()) {
    publishStatus(buildStatus("disabled", "Auto update is disabled in this runtime."));
    return;
  }

  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      void checkForUpdates();
    }, 5000);
  });
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!canUseAutoUpdate()) {
    return publishStatus(buildStatus("disabled", "Auto update is disabled in this runtime."));
  }

  publishStatus(buildStatus("checking", "Checking for updates."));
  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    return publishStatus(buildStatus("error", "Update check failed.", { error: normalizeUpdateError(error) }));
  }
  return lastStatus;
}

export function getUpdateStatus(): UpdateStatus {
  return lastStatus;
}

function canUseAutoUpdate(): boolean {
  return app.isPackaged && process.env.TASKBRIDGE_DISABLE_AUTO_UPDATE !== "1";
}

function updateChannel(): string {
  const channel = process.env.TASKBRIDGE_UPDATE_CHANNEL?.trim();
  return channel || "latest";
}

function publishStatus(status: UpdateStatus): UpdateStatus {
  lastStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("taskbridge:update-status", status);
    }
  }
  return status;
}

function buildStatus(
  state: UpdateState,
  message: string,
  extra: Partial<Omit<UpdateStatus, "state" | "message" | "checkedAt">> = {},
): UpdateStatus {
  return {
    state,
    message,
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

function normalizeUpdateError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
