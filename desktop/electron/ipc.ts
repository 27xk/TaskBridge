import { dialog, ipcMain } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { readFile, writeFile } from "node:fs/promises";

import { setAutoStart } from "./auto-start";
import {
  completeLocalTaskWithQueue,
  createLocalTask,
  enqueueChange,
  enqueueTaskChange,
  getTask,
  incrementAttempt,
  listQueue,
  listTasks,
  listTasksByServerIds,
  listTodayFloatingTasks,
  listTodayTasks,
  removeQueueItem,
  removeQueueByLocalId,
  softDeleteLocalTask,
  type SyncQueueRecord,
  type TaskRecord,
  upsertTask,
} from "./db";
import {
  getFloatingWindowPosition,
  getFloatingWindowSize,
  hideFloatingWindow,
  notifyFloatingTasksChanged,
  notifyFloatingSyncStatusChanged,
  saveFloatingWindowPosition,
  setFloatingWindowSize,
  setFloatingWindowOpacity,
  showFloatingWindow,
  toggleFloatingWindow,
} from "./floating-window";
import { performApiRequest, type ApiRequestPayload } from "./http";
import { showTaskNotification } from "./notification";
import {
  clearTokens,
  getSettings,
  hasTokens,
  setSetting,
  setTokens,
  type AppSettings,
  type TokenState,
  windows,
} from "./state";
import { getTraySyncStatus, refreshTrayMenu, setTraySyncStatus } from "./tray";
import { normalizeTimeZone } from "../shared/quick-add-parser";

const MAX_IMPORT_BYTES = 1_000_000;
const MAX_IMPORT_TASKS = 500;

export function registerIpcHandlers(): void {
  ipcMain.handle("app:get-settings", () => getSettings());
  ipcMain.handle("app:set-setting", (_, key: string, value: unknown) => setAppSetting(key, value));
  ipcMain.handle("app:set-sync-status", (_, status: string) => {
    setTraySyncStatus(status);
    notifyFloatingSyncStatusChanged();
  });
  ipcMain.handle("app:notify", (_, title: string, body: string) => {
    showTaskNotification(title, body);
  });
  ipcMain.handle("app:toggle-floating", () => toggleFloatingWindow());
  ipcMain.handle("app:show-floating", () => showFloatingWindow());
  ipcMain.handle("app:set-auto-start", (_, enabled: boolean) => {
    setAutoStart(enabled);
    return getSettings();
  });

  ipcMain.handle("auth:has-tokens", () => hasTokens());
  ipcMain.handle("auth:set-tokens", (_, tokens: unknown) => {
    if (!isTokenState(tokens)) {
      throw new Error("Invalid token payload");
    }
    setTokens(tokens);
  });
  ipcMain.handle("auth:clear-tokens", () => clearTokens());
  ipcMain.handle("api:request", (_, payload: ApiRequestPayload) => performApiRequest(payload));

  ipcMain.handle("db:tasks:list", (_, limit?: number, offset?: number, includeDeleted?: boolean) => {
    return listTasks(Boolean(includeDeleted), limit, offset);
  });
  ipcMain.handle("db:tasks:today", (_, limit?: number) => listTodayTasks(limit));
  ipcMain.handle("db:tasks:floating-today", (_, limit?: number) => listTodayFloatingTasks(limit));
  ipcMain.handle("db:tasks:get", (_, localId: string) => getTask(localId));
  ipcMain.handle("db:tasks:get-by-server-ids", (_, serverIds: number[]) => listTasksByServerIds(serverIds));
  ipcMain.handle("db:tasks:upsert", (_, task: TaskRecord) => {
    const saved = upsertTask(task);
    notifyFloatingTasksChanged();
    return saved;
  });
  ipcMain.handle("db:tasks:delete-local", (_, localId: string) => {
    softDeleteLocalTask(localId);
    notifyFloatingTasksChanged();
  });
  ipcMain.handle("db:tasks:complete-local", (_, localId: string) => {
    const task = completeLocalTaskWithQueue(localId);
    notifyFloatingTasksChanged();
    return task;
  });
  ipcMain.handle("db:queue:list", (_, limit?: number, includeExhausted?: boolean) => listQueue(limit, Boolean(includeExhausted)));
  ipcMain.handle("db:queue:enqueue", (_, change: SyncQueueRecord) => enqueueChange(change));
  ipcMain.handle("db:queue:remove", (_, id: number) => removeQueueItem(id));
  ipcMain.handle("db:queue:remove-by-local", (_, localId: string) => removeQueueByLocalId(localId));
  ipcMain.handle("db:queue:increment-attempt", (_, id: number) => incrementAttempt(id));

  ipcMain.handle("window:quick-add", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.webContents.send("taskbridge:quick-add");
    windows.floatingWindow?.webContents.send("taskbridge:quick-add");
  });
  ipcMain.handle("window:open-main", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.focus();
  });

  ipcMain.handle("floating:show", () => showFloatingWindow());
  ipcMain.handle("floating:hide", () => hideFloatingWindow());
  ipcMain.handle("floating:toggle", () => toggleFloatingWindow());
  ipcMain.handle("floating:set-opacity", (_, opacity: number) => setFloatingWindowOpacity(opacity));
  ipcMain.handle("floating:get-position", () => getFloatingWindowPosition());
  ipcMain.handle("floating:save-position", (_, x?: number, y?: number) => saveFloatingWindowPosition(x, y));
  ipcMain.handle("floating:get-size", () => getFloatingWindowSize());
  ipcMain.handle("floating:set-size", (_, width: number, height: number) => setFloatingWindowSize(width, height));

  ipcMain.handle("task:list-today", (_, limit?: number) => listTodayFloatingTasks(limit));
  ipcMain.handle("task:quick-add", (_, title: string) => quickAddTask(title));
  ipcMain.handle("task:complete", (_, localId: string) => completeTaskFromFloating(localId));
  ipcMain.handle("task:open-detail", (_, localId: string) => openTaskDetail(localId));
  ipcMain.handle("task:export-json", () => exportTasksJson());
  ipcMain.handle("task:import-json", () => importTasksJson());
  ipcMain.handle("sync:get-status", () => getTraySyncStatus());
}

function setAppSetting(key: string, value: unknown): AppSettings {
  if (isStringSetting(key) && typeof value === "string") {
    if (key === "baseUrl" && !isAllowedBaseUrl(value)) {
      return getSettings();
    }
    if (key === "wsUrl" && !isAllowedWebSocketUrl(value)) {
      return getSettings();
    }
    if (key === "language" && value !== "zh-CN" && value !== "en-US") {
      return getSettings();
    }
    const settings = setSetting(key, key === "displayTimeZone" ? normalizeTimeZone(value) : value);
    if (key === "language") refreshTrayMenu();
    return settings;
  }
  if (key === "autoStart" && typeof value === "boolean") {
    return setSetting(key, value);
  }
  if (key === "floatingVisibleOnStart" && typeof value === "boolean") {
    return setSetting(key, value);
  }
  if (key === "floatingMiniMode" && typeof value === "boolean") {
    return setSetting(key, value);
  }
  if (key === "floatingOpacity" && typeof value === "number") {
    setFloatingWindowOpacity(value);
    return getSettings();
  }
  return getSettings();
}

function isStringSetting(key: string): key is "baseUrl" | "wsUrl" | "deviceId" | "lastSyncTime" | "language" | "displayTimeZone" {
  return (
    key === "baseUrl" ||
    key === "wsUrl" ||
    key === "deviceId" ||
    key === "lastSyncTime" ||
    key === "language" ||
    key === "displayTimeZone"
  );
}

function isTokenState(value: unknown): value is TokenState {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<TokenState>;
  return (
    typeof token.accessToken === "string" &&
    typeof token.refreshToken === "string" &&
    (token.userId === undefined || (typeof token.userId === "number" && Number.isFinite(token.userId)))
  );
}

function isAllowedBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "ws:" || url.protocol === "wss:";
  } catch {
    return false;
  }
}

function quickAddTask(title: string): TaskRecord | null {
  const task = createLocalTask(title);
  if (!task) return null;
  notifyFloatingTasksChanged();
  windows.mainWindow?.webContents.send("taskbridge:tasks-changed");
  return task;
}

function completeTaskFromFloating(localId: string): TaskRecord | null {
  const task = completeLocalTaskWithQueue(localId);
  if (!task) return null;

  notifyFloatingTasksChanged();
  windows.mainWindow?.webContents.send("taskbridge:tasks-changed");
  return task;
}

function openTaskDetail(localId: string): void {
  windows.mainWindow?.show();
  windows.mainWindow?.focus();
  windows.mainWindow?.webContents.send("taskbridge:open-task-detail", localId);
}

async function exportTasksJson(): Promise<{ canceled: boolean; filePath?: string }> {
  const english = getSettings().language === "en-US";
  const options: SaveDialogOptions = {
    title: english ? "Export TaskBridge local backup" : "导出 TaskBridge 本地备份",
    defaultPath: "taskbridge-backup.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  };
  const result = windows.mainWindow
    ? await dialog.showSaveDialog(windows.mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  const payload = {
    format: "taskbridge.desktop.backup.v1",
    exported_at: new Date().toISOString(),
    tasks: listTasks(true, 10_000, 0),
  };
  await writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf-8");
  return { canceled: false, filePath: result.filePath };
}

async function importTasksJson(): Promise<{ canceled: boolean; importedCount?: number }> {
  const english = getSettings().language === "en-US";
  const options: OpenDialogOptions = {
    title: english ? "Import TaskBridge local backup" : "导入 TaskBridge 本地备份",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  };
  const result = windows.mainWindow
    ? await dialog.showOpenDialog(windows.mainWindow, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return { canceled: true };

  const content = await readFile(filePath, "utf-8");
  if (content.length > MAX_IMPORT_BYTES) {
    return { canceled: false, importedCount: 0 };
  }
  const raw = JSON.parse(content) as { tasks?: unknown[] };
  const now = new Date().toISOString();
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.slice(0, MAX_IMPORT_TASKS) : [];
  let importedCount = 0;
  for (const item of tasks) {
    if (!item || typeof item !== "object") continue;
    const task = item as Partial<TaskRecord>;
    if (typeof task.title !== "string" || !task.title.trim()) continue;
    const next: TaskRecord = {
      localId: `import-${Date.now()}-${importedCount}`,
      serverId: null,
      title: task.title.trim(),
      content: task.content ?? null,
      status: task.status === "completed" ? "completed" : "todo",
      priority: normalizePriority(task.priority),
      tag: task.tag ?? null,
      project: task.project ?? null,
      listType: task.listType ?? "inbox",
      dueTime: task.dueTime ?? null,
      remindTime: task.remindTime ?? null,
      repeatRule: task.repeatRule ?? null,
      plannedDate: task.plannedDate ?? null,
      completedAt: task.completedAt ?? null,
      snoozedUntil: task.snoozedUntil ?? null,
      parentServerId: null,
      checklistJson: task.checklistJson ?? "[]",
      isTemplate: task.isTemplate ?? false,
      templateName: task.templateName ?? null,
      sortOrder: task.sortOrder ?? 0,
      version: 0,
      isDeleted: false,
      syncStatus: "pending_create",
      createdAt: now,
      updatedAt: now,
      lastSyncAt: null,
    };
    upsertTask(next);
    enqueueTaskChange(next, "create");
    importedCount += 1;
  }
  notifyFloatingTasksChanged();
  windows.mainWindow?.webContents.send("taskbridge:tasks-changed");
  return { canceled: false, importedCount };
}

function normalizePriority(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(5, Math.trunc(value)))
    : 0;
}
