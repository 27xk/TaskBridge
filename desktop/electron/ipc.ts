import { dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
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
  clearTokens,
  getSettings,
  hasTokens,
  setSetting,
  type AppSettings,
  windows,
} from "./state";
import { getTraySyncStatus, refreshTrayMenu, setTraySyncStatus } from "./tray";
import { normalizeTimeZone } from "../shared/quick-add-parser";

const MAX_IMPORT_BYTES = 1_000_000;
const MAX_IMPORT_TASKS = 500;
const ACCEPTED_BACKUP_FORMATS = new Set([
  "taskbridge.local.backup.v1",
  "taskbridge.android.backup.v1",
  "taskbridge.desktop.backup.v1",
]);

export function registerIpcHandlers(): void {
  handle("app:get-settings", () => getSettings());
  handle("app:set-setting", (_, key: string, value: unknown) => setAppSetting(key, value));
  handle("app:set-sync-status", (_, status: string) => {
    setTraySyncStatus(status);
    notifyFloatingSyncStatusChanged();
  });
  handle("app:notify", (_, title: string, body: string) => {
    showTaskNotification(title, body);
  });
  handle("app:toggle-floating", () => toggleFloatingWindow());
  handle("app:show-floating", () => showFloatingWindow());
  handle("app:set-auto-start", (_, enabled: boolean) => {
    setAutoStart(enabled);
    return getSettings();
  });

  handle("auth:has-tokens", () => hasTokens());
  handle("auth:clear-tokens", () => clearTokens());
  handle("api:request", (_, payload: unknown) => performApiRequest(validateApiRequestPayload(payload)));

  handle("db:tasks:list", (_, limit?: number, offset?: number, includeDeleted?: boolean) => {
    return listTasks(Boolean(includeDeleted), limit, offset);
  });
  handle("db:tasks:today", (_, limit?: number) => listTodayTasks(limit));
  handle("db:tasks:floating-today", (_, limit?: number) => listTodayFloatingTasks(limit));
  handle("db:tasks:get", (_, localId: string) => getTask(localId));
  handle("db:tasks:get-by-server-ids", (_, serverIds: number[]) => listTasksByServerIds(serverIds));
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
  handle("db:tasks:delete-local", (_, localId: string) => {
    softDeleteLocalTask(localId);
    notifyFloatingTasksChanged();
  });
  handle("db:tasks:complete-local", (_, localId: string) => {
    const task = completeLocalTaskWithQueue(localId);
    notifyFloatingTasksChanged();
    return task;
  });
  handle("db:queue:list", (_, limit?: number, includeExhausted?: boolean) => listQueue(limit, Boolean(includeExhausted)));
  handle("db:queue:enqueue", (_, change: unknown) => enqueueChange(validateSyncQueueRecord(change)));
  handle("db:queue:remove", (_, id: number) => removeQueueItem(id));
  handle("db:queue:remove-by-local", (_, localId: string) => removeQueueByLocalId(localId));
  handle("db:queue:increment-attempt", (_, id: number) => incrementAttempt(id));

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
  handle("floating:set-opacity", (_, opacity: number) => setFloatingWindowOpacity(opacity));
  handle("floating:get-position", () => getFloatingWindowPosition());
  handle("floating:save-position", (_, x?: number, y?: number) => saveFloatingWindowPosition(x, y));
  handle("floating:get-size", () => getFloatingWindowSize());
  handle("floating:set-size", (_, width: number, height: number) => setFloatingWindowSize(width, height));

  handle("task:list-today", (_, limit?: number) => listTodayFloatingTasks(limit));
  handle("task:quick-add", (_, title: string) => quickAddTask(title));
  handle("task:complete", (_, localId: string) => completeTaskFromFloating(localId));
  handle("task:open-detail", (_, localId: string) => openTaskDetail(localId));
  handle("task:export-json", () => exportTasksJson());
  handle("task:import-json", () => importTasksJson());
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

function isStringSetting(key: string): key is "baseUrl" | "wsUrl" | "lastSyncTime" | "language" | "displayTimeZone" {
  return (
    key === "baseUrl" ||
    key === "wsUrl" ||
    key === "lastSyncTime" ||
    key === "language" ||
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

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
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
  let raw: Record<string, unknown>;
  try {
    raw = requireRecord(JSON.parse(content) as unknown, "Invalid backup payload");
  } catch {
    return { canceled: false, importedCount: 0 };
  }
  if (typeof raw.format !== "string" || !ACCEPTED_BACKUP_FORMATS.has(raw.format)) {
    return { canceled: false, importedCount: 0 };
  }
  if (!Array.isArray(raw.tasks)) {
    return { canceled: false, importedCount: 0 };
  }
  const now = new Date().toISOString();
  const tasks = raw.tasks.slice(0, MAX_IMPORT_TASKS);
  const importedTasks: TaskRecord[] = [];
  for (const item of tasks) {
    const next = normalizeImportedTask(item, now, importedTasks.length);
    if (!next) continue;
    importedTasks.push(next);
  }
  upsertTasks(importedTasks);
  for (const task of importedTasks) {
    enqueueTaskChange(task, "create");
  }
  notifyFloatingTasksChanged();
  windows.mainWindow?.webContents.send("taskbridge:tasks-changed");
  return { canceled: false, importedCount: importedTasks.length };
}

function normalizeImportedTask(item: unknown, now: string, index: number): TaskRecord | null {
  if (!isPlainObject(item) || typeof item.title !== "string" || !item.title.trim()) {
    return null;
  }
  return {
    localId: `import-${Date.now()}-${index}`,
    serverId: null,
    title: item.title.trim().slice(0, 255),
    content: safeNullableText(item.content, 10_000),
    status: item.status === "completed" ? "completed" : "todo",
    priority: normalizePriority(item.priority),
    tag: safeNullableText(item.tag, 64),
    project: safeNullableText(item.project, 128),
    listType: safeText(item.listType, "inbox", 32),
    dueTime: safeNullableIsoText(item.dueTime),
    remindTime: safeNullableIsoText(item.remindTime),
    repeatRule: safeNullableText(item.repeatRule, 255),
    plannedDate: safeNullableText(item.plannedDate, 32),
    completedAt: safeNullableIsoText(item.completedAt),
    snoozedUntil: safeNullableIsoText(item.snoozedUntil),
    parentServerId: null,
    checklistJson: safeChecklistJson(item),
    isTemplate: item.isTemplate === true,
    templateName: safeNullableText(item.templateName, 128),
    sortOrder: normalizeSortOrder(item.sortOrder),
    version: 0,
    isDeleted: false,
    syncStatus: "pending_create",
    createdAt: now,
    updatedAt: now,
    lastSyncAt: null,
  };
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
  if (typeof item.checklistJson === "string" && item.checklistJson.length <= 30_000) {
    return item.checklistJson;
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
