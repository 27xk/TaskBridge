import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

import { setAutoStart } from "./auto-start";
import {
  clearLocalDeviceData,
  completeLocalTaskWithQueue,
  createLocalTask,
  enqueueChange,
  enqueueTaskChange,
  getTask,
  getSyncQueueCounts,
  incrementAttempt,
  listQueue,
  listTasks,
  listTasksByServerIds,
  listTodayFloatingTasks,
  listTodayTasks,
  purgeLocalTask,
  removeQueueItem,
  removeQueueByLocalId,
  softDeleteLocalTask,
  type BackupImportUndoItem,
  type BackupImportUndoResult,
  type SyncQueueRecord,
  type TaskRecord,
  undoImportedBackupTasks,
  upsertTask,
  upsertTasks,
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
  clearLastBackupImportUndoItems,
  clearTokens,
  getLastBackupImportUndoItems,
  getLastBackupImportUndoSummary,
  getSettings,
  hasTokens,
  setLastBackupImportUndoItems,
  setSetting,
  type AppSettings,
  windows,
} from "./state";
import { getTraySyncStatus, refreshTrayMenu, setTraySyncStatus } from "./tray";
import { checkForUpdates, getUpdateStatus } from "./updater";
import { normalizeDesktopTheme } from "../shared/desktop-theme";
import { normalizeTimeZone } from "../shared/quick-add-parser";

const BACKUP_FORMAT = "taskbridge.desktop.backup.v1";
const DIAGNOSTIC_FORMAT = "taskbridge.desktop.diagnostics.v1";
const EXPORT_TASK_BATCH_SIZE = 1_000;
const DIAGNOSTIC_QUEUE_EXPORT_LIMIT = 100;
const MAX_IMPORT_BYTES = 20_000_000;
const MAX_IMPORT_TASKS = 100_000;
const ACCEPTED_BACKUP_FORMATS = new Set([
  "taskbridge.local.backup.v1",
  "taskbridge.android.backup.v1",
  BACKUP_FORMAT,
]);

type BackupImportErrorCode =
  | "file_too_large"
  | "invalid_json"
  | "unsupported_format"
  | "missing_tasks"
  | "too_many_tasks";

interface BackupImportError {
  code: BackupImportErrorCode;
  message: string;
}

interface BackupImportResult {
  canceled: boolean;
  importedCount?: number;
  scannedCount?: number;
  skippedCount?: number;
  importedLocalIds?: string[];
  error?: BackupImportError;
}

interface BackupImportPreview {
  canceled: boolean;
  filePath?: string;
  importableCount?: number;
  scannedCount?: number;
  skippedCount?: number;
  error?: BackupImportError;
}

interface PendingBackupImport {
  filePath: string;
  tasks: TaskRecord[];
  scannedCount: number;
  skippedCount: number;
}

let pendingBackupImport: PendingBackupImport | null = null;

export function registerIpcHandlers(): void {
  handle("app:get-settings", () => getSettings());
  handle("app:set-setting", (_, key: string, value: unknown) => setAppSetting(key, value));
  handle("app:set-sync-status", (_, status: unknown) => {
    setTraySyncStatus(validateTraySyncStatus(status));
    notifyFloatingSyncStatusChanged();
  });
  handle("app:notify", (_, title: unknown, body: unknown) => {
    showTaskNotification(validateNotificationText(title, "title"), validateNotificationText(body, "body", 320));
  });
  handle("app:toggle-floating", () => toggleFloatingWindow());
  handle("app:show-floating", () => showFloatingWindow());
  handle("app:open-external", (_, url: unknown) => {
    return shell.openExternal(validateExternalUrl(url));
  });
  handle("app:set-auto-start", (_, enabled: boolean) => {
    setAutoStart(enabled);
    return getSettings();
  });
  handle("app:get-update-status", () => getUpdateStatus());
  handle("app:check-for-updates", () => checkForUpdates());

  handle("auth:has-tokens", () => hasTokens());
  handle("auth:clear-tokens", () => clearTokens());
  handle("api:request", (_, payload: unknown) => performApiRequest(validateApiRequestPayload(payload)));

  handle("db:tasks:list", (_, limit?: unknown, offset?: unknown, includeDeleted?: unknown) => {
    return listTasks(
      Boolean(includeDeleted),
      optionalBoundedInteger(limit, "limit", 1, 5_000),
      optionalBoundedInteger(offset, "offset", 0, Number.MAX_SAFE_INTEGER),
    );
  });
  handle("db:tasks:today", (_, limit?: unknown) => listTodayTasks(optionalBoundedInteger(limit, "limit", 1, 5_000)));
  handle("db:tasks:floating-today", (_, limit?: unknown) => {
    return listTodayFloatingTasks(optionalBoundedInteger(limit, "limit", 1, 100));
  });
  handle("db:tasks:get", (_, localId: unknown) => getTask(validateLocalId(localId)));
  handle("db:tasks:get-by-server-ids", (_, serverIds: unknown) => listTasksByServerIds(validateServerIds(serverIds)));
  handle("db:tasks:upsert", (_, task: unknown) => {
    const saved = upsertTask(validateTaskRecord(task));
    notifyFloatingTasksChanged();
    return saved;
  });
  handle("db:tasks:upsert-many", (_, tasks: unknown) => {
    const saved = upsertTasks(validateTaskRecords(tasks));
    notifyFloatingTasksChanged();
    return saved;
  });
  handle("db:tasks:delete-local", (_, localId: unknown) => {
    softDeleteLocalTask(validateLocalId(localId));
    notifyFloatingTasksChanged();
  });
  handle("db:tasks:purge-local", (_, localId: unknown) => {
    purgeLocalTask(validateLocalId(localId));
    notifyFloatingTasksChanged();
  });
  handle("db:local:clear-device-data", () => {
    const result = clearLocalDeviceData();
    notifyFloatingTasksChanged();
    return result;
  });
  handle("db:tasks:complete-local", (_, localId: unknown) => {
    const task = completeLocalTaskWithQueue(validateLocalId(localId));
    notifyFloatingTasksChanged();
    return task;
  });
  handle("db:queue:list", (_, limit?: unknown, includeExhausted?: unknown) => {
    return listQueue(optionalBoundedInteger(limit, "limit", 1, 5_000), Boolean(includeExhausted));
  });
  handle("db:queue:counts", () => getSyncQueueCounts());
  handle("db:queue:enqueue", (_, change: unknown) => enqueueChange(validateSyncQueueRecord(change)));
  handle("db:queue:remove", (_, id: unknown) => removeQueueItem(validateRecordId(id)));
  handle("db:queue:remove-by-local", (_, localId: unknown) => removeQueueByLocalId(validateLocalId(localId)));
  handle("db:queue:increment-attempt", (_, id: unknown) => incrementAttempt(validateRecordId(id)));

  handle("window:quick-add", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.webContents.send("taskbridge:quick-add");
    windows.floatingWindow?.webContents.send("taskbridge:quick-add");
  });
  handle("window:open-main", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.focus();
  });

  handle("floating:show", () => showFloatingWindow());
  handle("floating:hide", () => hideFloatingWindow());
  handle("floating:toggle", () => toggleFloatingWindow());
  handle("floating:set-opacity", (_, opacity: unknown) => {
    return setFloatingWindowOpacity(validateNumber(opacity, "opacity", 0.45, 1));
  });
  handle("floating:get-position", () => getFloatingWindowPosition());
  handle("floating:save-position", (_, x?: unknown, y?: unknown) => {
    return saveFloatingWindowPosition(optionalWindowCoordinate(x, "x"), optionalWindowCoordinate(y, "y"));
  });
  handle("floating:get-size", () => getFloatingWindowSize());
  handle("floating:set-size", (_, width: unknown, height: unknown) => {
    return setFloatingWindowSize(
      boundedInteger(width, "width", 280, 520),
      boundedInteger(height, "height", 260, 720),
    );
  });

  handle("task:list-today", (_, limit?: unknown) => listTodayFloatingTasks(optionalBoundedInteger(limit, "limit", 1, 100)));
  handle("task:quick-add", (_, title: unknown) => quickAddTask(validateNotificationText(title, "title", 255)));
  handle("task:complete", (_, localId: unknown) => completeTaskFromFloating(validateLocalId(localId)));
  handle("task:open-detail", (_, localId: unknown) => openTaskDetail(validateLocalId(localId)));
  handle("task:export-json", () => exportTasksJson());
  handle("task:choose-import-json", () => chooseImportTasksJson());
  handle("task:confirm-import-json", () => confirmImportTasksJson());
  handle("task:get-last-import-undo-summary", () => getLastBackupImportUndoSummary());
  handle("task:undo-last-import-json", () => undoLastImportTasksJson());
  handle("task:import-json", () => importTasksJson());
  handle("task:export-diagnostics", () => exportDiagnosticsJson());
  handle("sync:get-status", () => getTraySyncStatus());
}

function handle<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => Result,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...(args as Args));
  });
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const sender = event.sender;
  if (sender === windows.mainWindow?.webContents || sender === windows.floatingWindow?.webContents) {
    return;
  }
  throw new Error("Untrusted IPC sender");
}

function validateExternalUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid external URL");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Unsupported external URL protocol");
  }
  return url.toString();
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
    if (key === "desktopTheme") {
      return setSetting(key, normalizeDesktopTheme(value));
    }
    if (key === "lastSyncTime" && !isIsoDateString(value)) {
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
  if (key === "floatingOpacity" && typeof value === "number") {
    setFloatingWindowOpacity(value);
    return getSettings();
  }
  return getSettings();
}

function isStringSetting(
  key: string,
): key is "baseUrl" | "wsUrl" | "lastSyncTime" | "language" | "desktopTheme" | "displayTimeZone" {
  return (
    key === "baseUrl" ||
    key === "wsUrl" ||
    key === "lastSyncTime" ||
    key === "language" ||
    key === "desktopTheme" ||
    key === "displayTimeZone"
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

function validateApiRequestPayload(value: unknown): ApiRequestPayload {
  const payload = requireRecord(value, "Invalid API request payload");
  const method = payload.method;
  if (method !== "GET" && method !== "POST" && method !== "PUT" && method !== "DELETE") {
    throw new Error("Invalid API method");
  }
  const url = requireString(payload.url, "url", 512);
  if (payload.params !== undefined && !isPlainObject(payload.params)) {
    throw new Error("Invalid API params");
  }
  return {
    method,
    url,
    data: payload.data,
    params: payload.params as Record<string, unknown> | undefined,
  };
}

function validateTaskRecord(value: unknown): TaskRecord {
  const record = requireRecord(value, "Invalid task payload");
  return {
    localId: requireString(record.localId, "localId", 128),
    serverId: nullableInteger(record.serverId, "serverId"),
    title: requireString(record.title, "title", 255),
    content: nullableString(record.content, "content", 10_000),
    status: requireString(record.status, "status", 32),
    priority: boundedInteger(record.priority, "priority", 0, 5),
    tag: nullableString(record.tag, "tag", 64),
    project: nullableString(record.project, "project", 128),
    listType: requireString(record.listType, "listType", 32),
    dueTime: nullableIsoString(record.dueTime, "dueTime"),
    remindTime: nullableIsoString(record.remindTime, "remindTime"),
    repeatRule: nullableString(record.repeatRule, "repeatRule", 255),
    plannedDate: nullableString(record.plannedDate, "plannedDate", 32),
    completedAt: nullableIsoString(record.completedAt, "completedAt"),
    snoozedUntil: nullableIsoString(record.snoozedUntil, "snoozedUntil"),
    parentServerId: nullableInteger(record.parentServerId, "parentServerId"),
    checklistJson: requireString(record.checklistJson, "checklistJson", 30_000),
    isTemplate: requireBoolean(record.isTemplate, "isTemplate"),
    templateName: nullableString(record.templateName, "templateName", 128),
    sortOrder: boundedInteger(record.sortOrder, "sortOrder", 0, 10_000),
    version: boundedInteger(record.version, "version", 0, Number.MAX_SAFE_INTEGER),
    isDeleted: requireBoolean(record.isDeleted, "isDeleted"),
    syncStatus: requireSyncStatus(record.syncStatus),
    createdAt: requireIsoString(record.createdAt, "createdAt"),
    updatedAt: requireIsoString(record.updatedAt, "updatedAt"),
    lastSyncAt: nullableIsoString(record.lastSyncAt, "lastSyncAt"),
    conflictServerJson: nullableString(record.conflictServerJson, "conflictServerJson", 80_000),
    conflictLocalJson: nullableString(record.conflictLocalJson, "conflictLocalJson", 80_000),
  };
}

function validateTaskRecords(value: unknown): TaskRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid task list payload");
  }
  return value.slice(0, 5_000).map(validateTaskRecord);
}

function validateSyncQueueRecord(value: unknown): SyncQueueRecord {
  const record = requireRecord(value, "Invalid sync queue payload");
  return {
    id: record.id === undefined ? undefined : boundedInteger(record.id, "id", 1, Number.MAX_SAFE_INTEGER),
    localId: requireString(record.localId, "localId", 128),
    serverId: nullableInteger(record.serverId, "serverId"),
    action: requireSyncAction(record.action),
    title: nullableString(record.title, "title", 255),
    content: nullableString(record.content, "content", 10_000),
    status: nullableString(record.status, "status", 32),
    priority: record.priority === null ? null : boundedInteger(record.priority, "priority", 0, 5),
    tag: nullableString(record.tag, "tag", 64),
    project: nullableString(record.project, "project", 128),
    listType: nullableString(record.listType, "listType", 32),
    dueTime: nullableIsoString(record.dueTime, "dueTime"),
    remindTime: nullableIsoString(record.remindTime, "remindTime"),
    repeatRule: nullableString(record.repeatRule, "repeatRule", 255),
    plannedDate: nullableString(record.plannedDate, "plannedDate", 32),
    completedAt: nullableIsoString(record.completedAt, "completedAt"),
    snoozedUntil: nullableIsoString(record.snoozedUntil, "snoozedUntil"),
    parentServerId: nullableInteger(record.parentServerId, "parentServerId"),
    checklistJson: nullableString(record.checklistJson, "checklistJson", 30_000),
    isTemplate: record.isTemplate === null ? null : requireBoolean(record.isTemplate, "isTemplate"),
    templateName: nullableString(record.templateName, "templateName", 128),
    sortOrder: record.sortOrder === null ? null : boundedInteger(record.sortOrder, "sortOrder", 0, 10_000),
    version: boundedInteger(record.version, "version", 0, Number.MAX_SAFE_INTEGER),
    localUpdatedAt: requireIsoString(record.localUpdatedAt, "localUpdatedAt"),
    createdAt: requireIsoString(record.createdAt, "createdAt"),
    attemptCount: record.attemptCount === undefined
      ? undefined
      : boundedInteger(record.attemptCount, "attemptCount", 0, Number.MAX_SAFE_INTEGER),
  };
}

function validateLocalId(value: unknown): string {
  const localId = requireString(value, "localId", 128).trim();
  if (!/^[A-Za-z0-9:_-]+$/.test(localId)) {
    throw new Error("Invalid localId");
  }
  return localId;
}

function validateNotificationText(value: unknown, field: string, maxLength = 160): string {
  const text = requireString(value, field, maxLength).trim();
  if (!text) throw new Error(`Invalid ${field}`);
  return text;
}

function validateServerIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid serverIds");
  }
  return value.slice(0, 5_000).map((id) => boundedInteger(id, "serverId", 1, Number.MAX_SAFE_INTEGER));
}

function validateRecordId(value: unknown): number {
  return boundedInteger(value, "id", 1, Number.MAX_SAFE_INTEGER);
}

function validateTraySyncStatus(value: unknown): string {
  return validateNotificationText(value, "status", 64);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(message);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function nullableString(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, field, maxLength);
}

function requireIsoString(value: unknown, field: string): string {
  const text = requireString(value, field, 64);
  if (!isIsoDateString(text)) throw new Error(`Invalid ${field}`);
  return text;
}

function nullableIsoString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requireIsoString(value, field);
}

function isIsoDateString(value: string): boolean {
  return value.length <= 64 && Number.isFinite(Date.parse(value));
}

function nullableInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return boundedInteger(value, field, 0, Number.MAX_SAFE_INTEGER);
}

function optionalBoundedInteger(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === null || value === undefined) return undefined;
  return boundedInteger(value, field, min, max);
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function validateNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function optionalWindowCoordinate(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  return boundedInteger(value, field, -100_000, 100_000);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${field}`);
  return value;
}

function requireSyncStatus(value: unknown): TaskRecord["syncStatus"] {
  if (
    value === "synced" ||
    value === "pending_create" ||
    value === "pending_update" ||
    value === "pending_delete" ||
    value === "sync_failed" ||
    value === "conflict"
  ) {
    return value;
  }
  throw new Error("Invalid syncStatus");
}

function requireSyncAction(value: unknown): SyncQueueRecord["action"] {
  if (value === "create" || value === "update" || value === "delete" || value === "complete" || value === "restore") {
    return value;
  }
  throw new Error("Invalid action");
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

async function exportTasksJson(): Promise<{ canceled: boolean; filePath?: string; exportedCount?: number }> {
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
  const tasks = collectAllBackupTasks();
  const payload = {
    format: BACKUP_FORMAT,
    exported_at: new Date().toISOString(),
    exported_count: tasks.length,
    task_count: tasks.length,
    tasks,
  };
  await writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf-8");
  return { canceled: false, filePath: result.filePath, exportedCount: tasks.length };
}

async function chooseImportTasksJson(): Promise<BackupImportPreview> {
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

  const fileStats = await stat(filePath);
  if (fileStats.size > MAX_IMPORT_BYTES) {
    pendingBackupImport = null;
    return {
      canceled: false,
      filePath,
      importableCount: 0,
      scannedCount: 0,
      skippedCount: 0,
      error: backupImportFailurePayload(
        "file_too_large",
        "备份文件过大，已拒绝导入。",
        "Backup file is too large to import.",
      ).error,
    };
  }
  const content = await readFile(filePath, "utf-8");
  const preview = parseBackupImportContent(content);
  if (preview.error || !preview.tasks.length) {
    pendingBackupImport = null;
    return {
      canceled: false,
      filePath,
      importableCount: 0,
      scannedCount: preview.scannedCount,
      skippedCount: preview.skippedCount,
      error: preview.error,
    };
  }
  pendingBackupImport = {
    filePath,
    tasks: preview.tasks,
    scannedCount: preview.scannedCount,
    skippedCount: preview.skippedCount,
  };
  return {
    canceled: false,
    filePath,
    importableCount: preview.tasks.length,
    scannedCount: preview.scannedCount,
    skippedCount: preview.skippedCount,
  };
}

async function confirmImportTasksJson(): Promise<BackupImportResult> {
  if (!pendingBackupImport) {
    return backupImportFailure(
      "missing_tasks",
      "请先选择一个可导入的备份文件。",
      "Choose a backup file before importing.",
    );
  }
  const importedTasks = pendingBackupImport.tasks;
  upsertTasks(importedTasks);
  for (const task of importedTasks) {
    if (!task.isDeleted) {
      enqueueTaskChange(task, "create");
    }
  }
  const undoSummary = setLastBackupImportUndoItems(importedTasks.map((task) => ({
    localId: task.localId,
    importedUpdatedAt: task.updatedAt,
  })));
  const scannedCount = pendingBackupImport.scannedCount;
  const skippedCount = pendingBackupImport.skippedCount;
  pendingBackupImport = null;
  notifyFloatingTasksChanged();
  windows.mainWindow?.webContents.send("taskbridge:tasks-changed");
  return {
    canceled: false,
    importedCount: importedTasks.length,
    scannedCount,
    skippedCount,
    importedLocalIds: undoSummary.localIds,
  };
}

async function undoLastImportTasksJson(): Promise<BackupImportUndoResult> {
  const result = deleteImportedBackupTasks(getLastBackupImportUndoItems());
  clearLastBackupImportUndoItems();
  notifyFloatingTasksChanged();
  windows.mainWindow?.webContents.send("taskbridge:tasks-changed");
  return {
    undoneCount: result.undoneCount,
    skippedChangedCount: result.skippedChangedCount,
  };
}

async function importTasksJson(): Promise<BackupImportResult> {
  const preview = await chooseImportTasksJson();
  if (preview.canceled) return { canceled: true };
  if (preview.error) {
    return {
      canceled: false,
      importedCount: 0,
      scannedCount: preview.scannedCount,
      skippedCount: preview.skippedCount,
      error: preview.error,
    };
  }
  return confirmImportTasksJson();
}

function parseBackupImportContent(content: string): { tasks: TaskRecord[]; scannedCount: number; skippedCount: number; error?: BackupImportError } {
  if (content.length > MAX_IMPORT_BYTES) {
    return backupImportFailurePayload(
      "file_too_large",
      "备份文件过大，已拒绝导入。",
      "Backup file is too large to import.",
    );
  }
  let raw: Record<string, unknown>;
  try {
    raw = requireRecord(JSON.parse(content) as unknown, "Invalid backup payload");
  } catch {
    return backupImportFailurePayload("invalid_json", "备份文件不是有效的 JSON。", "Backup file is not valid JSON.");
  }
  if (typeof raw.format !== "string" || !ACCEPTED_BACKUP_FORMATS.has(raw.format)) {
    return backupImportFailurePayload("unsupported_format", "备份格式不受支持。", "Backup format is not supported.");
  }
  if (!Array.isArray(raw.tasks)) {
    return backupImportFailurePayload("missing_tasks", "备份文件缺少任务列表。", "Backup file does not contain tasks.");
  }
  if (raw.tasks.length > MAX_IMPORT_TASKS) {
    return backupImportFailurePayload(
      "too_many_tasks",
      `备份文件包含 ${raw.tasks.length} 条任务，超过了当前导入上限。`,
      `Backup file contains ${raw.tasks.length} tasks, which exceeds the import limit.`,
    );
  }

  const now = new Date().toISOString();
  const importBatchId = randomUUID();
  const importedTasks: TaskRecord[] = [];
  let skippedCount = 0;
  for (const [index, item] of raw.tasks.entries()) {
    const next = normalizeImportedTask(item, now, importBatchId, index);
    if (!next) continue;
    importedTasks.push(next);
    if (importedTasks.length >= MAX_IMPORT_TASKS) {
      break;
    }
  }
  skippedCount = raw.tasks.length - importedTasks.length;
  if (importedTasks.length === 0) {
    return backupImportFailurePayload(
      "missing_tasks",
      "没有可导入的有效任务。",
      "No valid tasks were found in the backup.",
      raw.tasks.length,
      raw.tasks.length,
    );
  }
  return {
    tasks: importedTasks,
    scannedCount: raw.tasks.length,
    skippedCount,
  };
}

function deleteImportedBackupTasks(items: BackupImportUndoItem[]): BackupImportUndoResult {
  return undoImportedBackupTasks(items);
}

async function exportDiagnosticsJson(): Promise<{ canceled: boolean; filePath?: string }> {
  const english = getSettings().language === "en-US";
  const options: SaveDialogOptions = {
    title: english ? "Export TaskBridge diagnostics" : "导出 TaskBridge 诊断包",
    defaultPath: "taskbridge-diagnostics.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  };
  const result = windows.mainWindow
    ? await dialog.showSaveDialog(windows.mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const tasks = collectAllBackupTasks();
  const queue = listQueue(DIAGNOSTIC_QUEUE_EXPORT_LIMIT, true);
  const queueCounts = getSyncQueueCounts();
  const settings = getSettings();
  const payload = {
    format: DIAGNOSTIC_FORMAT,
    exported_at: new Date().toISOString(),
    app: {
      platform: process.platform,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    },
    settings: {
      baseUrl: redactUrlSecrets(settings.baseUrl),
      wsUrl: redactUrlSecrets(settings.wsUrl),
      language: settings.language,
      desktopTheme: settings.desktopTheme,
      displayTimeZone: settings.displayTimeZone,
      deviceId: maskIdentifier(settings.deviceId),
      lastSyncTime: settings.lastSyncTime,
      autoStart: settings.autoStart,
      floatingVisibleOnStart: settings.floatingVisibleOnStart,
    },
    counts: {
      totalTasks: tasks.length,
      conflictTasks: tasks.filter((task) => task.syncStatus === "conflict").length,
      totalQueue: queueCounts.total,
      pendingQueue: queueCounts.pending,
      exhaustedQueue: queueCounts.exhausted,
      syncQueueExported: queue.length,
      syncQueueTruncated: queue.length < queueCounts.total,
    },
    sync_queue_export: {
      maxItems: DIAGNOSTIC_QUEUE_EXPORT_LIMIT,
      exportedCount: queue.length,
      totalCount: queueCounts.total,
      truncated: queue.length < queueCounts.total,
    },
    conflict_tasks: tasks
      .filter((task) => task.syncStatus === "conflict")
      .slice(0, 500)
      .map(toDiagnosticConflictTask),
    sync_queue: queue.map(toDiagnosticQueueItem),
  };
  await writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf-8");
  return { canceled: false, filePath: result.filePath };
}

function toDiagnosticConflictTask(task: TaskRecord) {
  return {
    localId: task.localId,
    serverId: task.serverId,
    titleFingerprint: fingerprintDiagnosticText(task.title),
    version: task.version,
    updatedAt: task.updatedAt,
    conflictServerJsonFingerprint: fingerprintDiagnosticText(task.conflictServerJson),
    conflictLocalJsonFingerprint: fingerprintDiagnosticText(task.conflictLocalJson),
  };
}

function toDiagnosticQueueItem(item: SyncQueueRecord) {
  return {
    id: item.id,
    localId: item.localId,
    serverId: item.serverId,
    action: item.action,
    status: item.status,
    priority: item.priority,
    tagPresent: Boolean(item.tag),
    projectPresent: Boolean(item.project),
    listType: item.listType,
    dueTime: item.dueTime,
    remindTime: item.remindTime,
    repeatRulePresent: Boolean(item.repeatRule),
    plannedDate: item.plannedDate,
    completedAt: item.completedAt,
    snoozedUntil: item.snoozedUntil,
    parentServerId: item.parentServerId,
    isTemplate: item.isTemplate,
    templateNamePresent: Boolean(item.templateName),
    sortOrder: item.sortOrder,
    version: item.version,
    localUpdatedAt: item.localUpdatedAt,
    createdAt: item.createdAt,
    attemptCount: item.attemptCount,
    titleFingerprint: fingerprintDiagnosticText(item.title),
    contentFingerprint: fingerprintDiagnosticText(item.content),
    checklistJsonFingerprint: fingerprintDiagnosticText(item.checklistJson),
  };
}

function fingerprintDiagnosticText(
  value: string | null | undefined,
): { present: boolean; length: number; sha256: string | null } {
  if (!value) return { present: false, length: 0, sha256: null };
  return {
    present: true,
    length: value.length,
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

function redactUrlSecrets(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = "redacted";
    if (url.password) url.password = "redacted";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|secret|password|key|auth|session/i.test(key)) {
        url.searchParams.set(key, "redacted");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function maskIdentifier(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "redacted";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function collectAllBackupTasks(): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  for (let offset = 0; ; offset += EXPORT_TASK_BATCH_SIZE) {
    const page = listTasks(true, EXPORT_TASK_BATCH_SIZE, offset);
    tasks.push(...page);
    if (page.length < EXPORT_TASK_BATCH_SIZE) break;
  }
  return tasks;
}

function backupImportFailure(
  code: BackupImportErrorCode,
  chineseMessage: string,
  englishMessage: string,
  scannedCount = 0,
  skippedCount = 0,
): BackupImportResult {
  return {
    canceled: false,
    importedCount: 0,
    scannedCount,
    skippedCount,
    error: {
      code,
      message: getSettings().language === "en-US" ? englishMessage : chineseMessage,
    },
  };
}

function backupImportFailurePayload(
  code: BackupImportErrorCode,
  chineseMessage: string,
  englishMessage: string,
  scannedCount = 0,
  skippedCount = 0,
): { tasks: TaskRecord[]; scannedCount: number; skippedCount: number; error: BackupImportError } {
  return {
    tasks: [],
    scannedCount,
    skippedCount,
    error: {
      code,
      message: getSettings().language === "en-US" ? englishMessage : chineseMessage,
    },
  };
}

function normalizeImportedTask(item: unknown, now: string, batchId: string, index: number): TaskRecord | null {
  if (!isPlainObject(item) || typeof item.title !== "string" || !item.title.trim()) {
    return null;
  }
  const isDeleted = Boolean(pickImportedField(item, "is_deleted", "isDeleted"));
  return {
    localId: `import-${batchId}-${index}`,
    serverId: null,
    title: item.title.trim().slice(0, 255),
    content: safeNullableText(item.content, 10_000),
    status: isCompletedStatusValue(pickImportedField(item, "status", "status")) ? "completed" : "todo",
    priority: normalizePriority(item.priority),
    tag: safeNullableText(item.tag, 64),
    project: safeNullableText(item.project, 128),
    listType: safeText(pickImportedField(item, "list_type", "listType"), "inbox", 32),
    dueTime: safeNullableIsoText(pickImportedField(item, "due_time", "dueTime")),
    remindTime: safeNullableIsoText(pickImportedField(item, "remind_time", "remindTime")),
    repeatRule: safeNullableText(pickImportedField(item, "repeat_rule", "repeatRule"), 255),
    plannedDate: safeNullableText(pickImportedField(item, "planned_date", "plannedDate"), 32),
    completedAt: safeNullableIsoText(pickImportedField(item, "completed_at", "completedAt")),
    snoozedUntil: safeNullableIsoText(pickImportedField(item, "snoozed_until", "snoozedUntil")),
    parentServerId: null,
    checklistJson: safeChecklistJson(item),
    isTemplate: pickImportedField(item, "is_template", "isTemplate") === true,
    templateName: safeNullableText(pickImportedField(item, "template_name", "templateName"), 128),
    sortOrder: normalizeSortOrder(pickImportedField(item, "sort_order", "sortOrder")),
    version: 0,
    isDeleted: Boolean(pickImportedField(item, "is_deleted", "isDeleted")),
    syncStatus: isDeleted ? "synced" : "pending_create",
    createdAt: safeNullableIsoText(pickImportedField(item, "created_at", "createdAt")) ?? now,
    updatedAt: safeNullableIsoText(pickImportedField(item, "updated_at", "updatedAt")) ?? now,
    lastSyncAt: null,
    conflictServerJson: null,
    conflictLocalJson: null,
  };
}

function pickImportedField(item: Record<string, unknown>, snakeName: string, camelName: string): unknown {
  return item[snakeName] ?? item[camelName] ?? null;
}

function safeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function safeNullableText(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function safeNullableIsoText(value: unknown): string | null {
  if (typeof value !== "string" || !isIsoDateString(value)) return null;
  return value;
}

function safeChecklistJson(item: Record<string, unknown>): string {
  const checklistJson = pickImportedField(item, "checklist_json", "checklistJson");
  if (typeof checklistJson === "string" && checklistJson.length <= 30_000) {
    return checklistJson;
  }
  if (Array.isArray(item.checklist)) {
    const text = JSON.stringify(item.checklist.slice(0, 100));
    return text.length <= 30_000 ? text : "[]";
  }
  return "[]";
}

function normalizePriority(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(5, Math.trunc(value)))
    : 0;
}

function normalizeSortOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(10_000, Math.trunc(value)))
    : 0;
}

function isCompletedStatusValue(value: unknown): boolean {
  return typeof value === "string" && ["completed", "done"].includes(value.trim().toLowerCase());
}
