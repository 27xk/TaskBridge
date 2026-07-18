import { app } from "electron";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { parseQuickTask, shanghaiDayBounds, todayLocalDate } from "../shared/quick-add-parser";
import { workspaceDatabaseFileName } from "../shared/workspace";
import {
  claimLegacyGlobalDatabaseWorkspace,
  claimLegacyUserDatabaseWorkspace,
  getActiveWorkspaceKey,
  getSettings,
} from "./state";
import { migrateSqliteDatabase } from "./sqlite-migration";

export type SyncStatus = "synced" | "pending_create" | "pending_update" | "pending_delete" | "sync_failed" | "conflict";
export type SyncAction = "create" | "update" | "delete" | "complete" | "restore";

export interface TaskRecord {
  localId: string;
  serverId: number | null;
  title: string;
  content: string | null;
  status: string;
  priority: number;
  tag: string | null;
  project: string | null;
  listType: string;
  dueTime: string | null;
  remindTime: string | null;
  repeatRule: string | null;
  plannedDate: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  parentServerId: number | null;
  checklistJson: string;
  isTemplate: boolean;
  templateName: string | null;
  sortOrder: number;
  version: number;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  conflictServerJson: string | null;
  conflictLocalJson: string | null;
}

export interface SyncQueueRecord {
  id?: number;
  localId: string;
  serverId: number | null;
  action: SyncAction;
  title: string | null;
  content: string | null;
  status: string | null;
  priority: number | null;
  tag: string | null;
  project: string | null;
  listType: string | null;
  dueTime: string | null;
  remindTime: string | null;
  repeatRule: string | null;
  plannedDate: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  parentServerId: number | null;
  checklistJson: string | null;
  isTemplate: boolean | null;
  templateName: string | null;
  sortOrder: number | null;
  version: number;
  localUpdatedAt: string;
  createdAt: string;
  attemptCount?: number;
}

export interface SyncQueueCounts {
  total: number;
  pending: number;
  exhausted: number;
}

export interface FloatingTaskSummary {
  tasks: TaskRecord[];
  totalOpen: number;
}

export interface BackupImportUndoItem {
  localId: string;
  importedUpdatedAt: string;
}

export interface BackupImportUndoResult {
  undoneCount: number;
  skippedChangedCount: number;
}

interface TaskRow {
  local_id: string;
  server_id: number | null;
  title: string;
  content: string | null;
  status: string;
  priority: number;
  tag: string | null;
  project: string | null;
  list_type: string;
  due_time: string | null;
  remind_time: string | null;
  repeat_rule: string | null;
  planned_date: string | null;
  completed_at: string | null;
  snoozed_until: string | null;
  parent_server_id: number | null;
  checklist_json: string | null;
  is_template: number;
  template_name: string | null;
  sort_order: number;
  version: number;
  is_deleted: number;
  sync_status: string;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  conflict_server_json: string | null;
  conflict_local_json: string | null;
}

interface SyncQueueRow {
  id: number;
  local_id: string;
  server_id: number | null;
  action: string;
  title: string | null;
  content: string | null;
  status: string | null;
  priority: number | null;
  tag: string | null;
  project: string | null;
  list_type: string | null;
  due_time: string | null;
  remind_time: string | null;
  repeat_rule: string | null;
  planned_date: string | null;
  completed_at: string | null;
  snoozed_until: string | null;
  parent_server_id: number | null;
  checklist_json: string | null;
  is_template: number | null;
  template_name: string | null;
  sort_order: number | null;
  version: number;
  local_updated_at: string;
  created_at: string;
  attempt_count: number;
}

let db: Database.Database | null = null;
let dbUserKey = "";

export function database(): Database.Database {
  const { key: nextUserKey, path: dbPath } = currentUserDatabaseKey();
  if (db && dbUserKey === nextUserKey) return db;
  if (db && dbUserKey !== nextUserKey) {
    db.close();
    db = null;
  }
  try {
    db = new Database(dbPath);
  } catch (error) {
    throw normalizeDatabaseOpenError(error);
  }
  configureDatabase(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      local_id TEXT PRIMARY KEY,
      server_id INTEGER UNIQUE,
      title TEXT NOT NULL,
      content TEXT,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      tag TEXT,
      project TEXT,
      list_type TEXT NOT NULL DEFAULT 'inbox',
      due_time TEXT,
      remind_time TEXT,
      repeat_rule TEXT,
      planned_date TEXT,
      completed_at TEXT,
      snoozed_until TEXT,
      parent_server_id INTEGER,
      checklist_json TEXT NOT NULL DEFAULT '[]',
      is_template INTEGER NOT NULL DEFAULT 0,
      template_name TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_sync_at TEXT,
      conflict_server_json TEXT,
      conflict_local_json TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT NOT NULL,
      server_id INTEGER,
      action TEXT NOT NULL,
      title TEXT,
      content TEXT,
      status TEXT,
      priority INTEGER,
      tag TEXT,
      project TEXT,
      list_type TEXT,
      due_time TEXT,
      remind_time TEXT,
      repeat_rule TEXT,
      planned_date TEXT,
      completed_at TEXT,
      snoozed_until TEXT,
      parent_server_id INTEGER,
      checklist_json TEXT,
      is_template INTEGER,
      template_name TEXT,
      sort_order INTEGER,
      version INTEGER NOT NULL DEFAULT 0,
      local_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS ix_tasks_sync_status ON tasks(sync_status);
    CREATE INDEX IF NOT EXISTS ix_tasks_due_time ON tasks(due_time);
    CREATE INDEX IF NOT EXISTS ix_sync_queue_local_id ON sync_queue(local_id);
    CREATE INDEX IF NOT EXISTS ix_sync_queue_attempt_created ON sync_queue(attempt_count, created_at);
  `);
  migrateSchema(db);
  db.pragma("optimize");
  dbUserKey = nextUserKey;
  return db;
}

function currentUserDatabaseKey(): { key: string; path: string } {
  const settings = getSettings();
  const currentUserId = settings.currentUserId;
  const workspaceKey = getActiveWorkspaceKey();
  if (typeof currentUserId === "number" && Number.isFinite(currentUserId) && currentUserId > 0) {
    const userId = Math.trunc(currentUserId);
    if (!workspaceKey) {
      throw new Error("Authenticated workspace is missing a valid server origin");
    }
    const dbPath = join(app.getPath("userData"), workspaceDatabaseFileName(settings.baseUrl, userId));
    migrateLegacyWorkspaceDatabase(dbPath, userId, workspaceKey);
    return {
      key: workspaceKey,
      path: dbPath,
    };
  }
  return {
    key: "signed-out",
    path: join(app.getPath("userData"), "taskbridge-signed-out.sqlite"),
  };
}

function migrateLegacyWorkspaceDatabase(dbPath: string, userId: number, workspaceKey: string): void {
  if (existsSync(dbPath)) return;
  const userDataPath = app.getPath("userData");
  const legacyUserPath = join(userDataPath, `taskbridge-user-${userId}.sqlite`);
  if (
    existsSync(legacyUserPath) &&
    claimLegacyUserDatabaseWorkspace(userId, workspaceKey)
  ) {
    migrateSqliteDatabase(legacyUserPath, dbPath);
    return;
  }
  const legacyGlobalPath = join(userDataPath, "taskbridge.sqlite");
  if (existsSync(legacyGlobalPath) && claimLegacyGlobalDatabaseWorkspace(workspaceKey)) {
    migrateSqliteDatabase(legacyGlobalPath, dbPath);
  }
}

function normalizeDatabaseOpenError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Could not locate the bindings file") || message.includes("better_sqlite3.node")) {
    return new Error(
      "SQLite native module is not ready. Run `npm run rebuild:native` in the desktop directory, then restart TaskBridge.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function configureDatabase(target: Database.Database): void {
  target.pragma("journal_mode = WAL");
  target.pragma("synchronous = NORMAL");
  target.pragma("busy_timeout = 3000");
  target.pragma("cache_size = -1024");
  target.pragma("journal_size_limit = 1048576");
  target.pragma("wal_autocheckpoint = 200");
}

function migrateSchema(target: Database.Database): void {
  ensureColumn(target, "tasks", "project", "TEXT");
  ensureColumn(target, "tasks", "list_type", "TEXT NOT NULL DEFAULT 'inbox'");
  ensureColumn(target, "tasks", "planned_date", "TEXT");
  ensureColumn(target, "tasks", "completed_at", "TEXT");
  ensureColumn(target, "tasks", "snoozed_until", "TEXT");
  ensureColumn(target, "tasks", "parent_server_id", "INTEGER");
  ensureColumn(target, "tasks", "checklist_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(target, "tasks", "is_template", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(target, "tasks", "template_name", "TEXT");
  ensureColumn(target, "tasks", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(target, "tasks", "conflict_server_json", "TEXT");
  ensureColumn(target, "tasks", "conflict_local_json", "TEXT");

  ensureColumn(target, "sync_queue", "project", "TEXT");
  ensureColumn(target, "sync_queue", "list_type", "TEXT");
  ensureColumn(target, "sync_queue", "planned_date", "TEXT");
  ensureColumn(target, "sync_queue", "completed_at", "TEXT");
  ensureColumn(target, "sync_queue", "snoozed_until", "TEXT");
  ensureColumn(target, "sync_queue", "parent_server_id", "INTEGER");
  ensureColumn(target, "sync_queue", "checklist_json", "TEXT");
  ensureColumn(target, "sync_queue", "is_template", "INTEGER");
  ensureColumn(target, "sync_queue", "template_name", "TEXT");
  ensureColumn(target, "sync_queue", "sort_order", "INTEGER");

  target.exec(`
    CREATE INDEX IF NOT EXISTS ix_tasks_list_type ON tasks(list_type);
    CREATE INDEX IF NOT EXISTS ix_tasks_planned_date ON tasks(planned_date);
    CREATE INDEX IF NOT EXISTS ix_tasks_deleted_updated ON tasks(is_deleted, updated_at);
    CREATE INDEX IF NOT EXISTS ix_tasks_status_priority ON tasks(status, priority);
    CREATE INDEX IF NOT EXISTS ix_tasks_today_due ON tasks(is_deleted, due_time, remind_time, planned_date);
    CREATE INDEX IF NOT EXISTS ix_tasks_active_timeline ON tasks(status, due_time, planned_date, completed_at, updated_at, sort_order, priority, local_id) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS ix_tasks_active_reminders ON tasks(remind_time, due_time, status, updated_at, local_id) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS ix_tasks_project ON tasks(project);
    CREATE INDEX IF NOT EXISTS ix_tasks_tag ON tasks(tag);
    CREATE INDEX IF NOT EXISTS ix_tasks_template ON tasks(is_template);
    CREATE INDEX IF NOT EXISTS ix_sync_queue_created ON sync_queue(created_at, id);
    CREATE INDEX IF NOT EXISTS ix_sync_queue_attempt_created ON sync_queue(attempt_count, created_at);
  `);
}

function ensureColumn(target: Database.Database, table: string, column: string, definition: string): void {
  const columns = target.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  target.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function listTasks(includeDeleted: boolean, limit = 200, offset = 0): TaskRecord[] {
  const rows = database()
    .prepare(
      `
      SELECT * FROM tasks
      ${includeDeleted ? "" : "WHERE is_deleted = 0"}
      ORDER BY
        CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
        CASE WHEN status IN ('completed', 'done') THEN COALESCE(datetime(completed_at), datetime(updated_at), datetime(due_time), datetime(planned_date), datetime(created_at)) END DESC,
        CASE WHEN due_time IS NULL THEN 1 ELSE 0 END,
        due_time ASC,
        updated_at DESC,
        local_id ASC
      LIMIT @limit OFFSET @offset
      `,
    )
    .all({ limit: clampLimit(limit, 1, 10_000), offset: Math.max(0, offset) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function listTodayTasks(limit = 120): TaskRecord[] {
  const timeZone = getSettings().displayTimeZone;
  const today = todayLocalDate(new Date(), timeZone);
  const { startTime, endTime } = shanghaiDayBounds(today, timeZone);
  const nowTime = new Date().toISOString();
  const rows = database()
    .prepare(
      `
      SELECT * FROM tasks
      WHERE is_deleted = 0
        AND (
          (due_time IS NOT NULL AND datetime(due_time) >= datetime(@startTime) AND datetime(due_time) < datetime(@endTime))
          OR (remind_time IS NOT NULL AND datetime(remind_time) >= datetime(@startTime) AND datetime(remind_time) < datetime(@endTime))
          OR planned_date = @plannedDate
          OR list_type = 'today'
          OR (status NOT IN ('completed', 'done') AND due_time IS NOT NULL AND datetime(due_time) < datetime(@nowTime))
        )
      ORDER BY
        CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
        CASE
          WHEN status IN ('completed', 'done') THEN 4
          WHEN status NOT IN ('completed', 'done') AND due_time IS NOT NULL AND datetime(due_time) < datetime(@nowTime) THEN 0
          WHEN due_time IS NOT NULL THEN 1
          WHEN list_type = 'today' THEN 2
          WHEN planned_date IS NOT NULL THEN 2
          ELSE 3
        END,
        CASE WHEN status IN ('completed', 'done') THEN COALESCE(datetime(completed_at), datetime(updated_at), datetime(due_time), datetime(planned_date), datetime(created_at)) END DESC,
        CASE WHEN status NOT IN ('completed', 'done') AND due_time IS NULL THEN 1 ELSE 0 END,
        CASE WHEN status NOT IN ('completed', 'done') THEN due_time END ASC,
        CASE WHEN status NOT IN ('completed', 'done') THEN planned_date END ASC,
        sort_order ASC,
        priority DESC,
        updated_at DESC,
        local_id ASC
      LIMIT @limit
      `,
    )
    .all({ startTime, endTime, nowTime, plannedDate: today, limit: clampLimit(limit, 1, 200) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function listTodayFloatingTasks(limit = 8): TaskRecord[] {
  const timeZone = getSettings().displayTimeZone;
  const today = todayLocalDate(new Date(), timeZone);
  const { startTime, endTime } = shanghaiDayBounds(today, timeZone);
  const rows = database()
    .prepare(
      `
      SELECT * FROM tasks
      WHERE is_deleted = 0
        AND (
          (due_time IS NOT NULL AND datetime(due_time) >= datetime(@startTime) AND datetime(due_time) < datetime(@endTime))
          OR (remind_time IS NOT NULL AND datetime(remind_time) >= datetime(@startTime) AND datetime(remind_time) < datetime(@endTime))
          OR planned_date = @plannedDate
          OR list_type = 'today'
        )
      ORDER BY
        CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
        CASE WHEN status IN ('completed', 'done') THEN COALESCE(datetime(completed_at), datetime(updated_at), datetime(due_time), datetime(planned_date), datetime(created_at)) END DESC,
        CASE WHEN planned_date = @plannedDate THEN 0 ELSE 1 END,
        CASE WHEN due_time IS NULL THEN 1 ELSE 0 END,
        CASE WHEN due_time IS NOT NULL THEN datetime(due_time) END ASC,
        due_time ASC,
        priority DESC,
        updated_at DESC,
        local_id ASC
      LIMIT @limit
      `,
    )
    .all({ startTime, endTime, plannedDate: today, limit: clampLimit(limit, 1, 30) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function getTodayFloatingTaskSummary(limit = 8): FloatingTaskSummary {
  const timeZone = getSettings().displayTimeZone;
  const today = todayLocalDate(new Date(), timeZone);
  const { startTime, endTime } = shanghaiDayBounds(today, timeZone);
  const row = database()
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM tasks
      WHERE is_deleted = 0
        AND status NOT IN ('completed', 'done')
        AND (
          (due_time IS NOT NULL AND datetime(due_time) >= datetime(@startTime) AND datetime(due_time) < datetime(@endTime))
          OR (remind_time IS NOT NULL AND datetime(remind_time) >= datetime(@startTime) AND datetime(remind_time) < datetime(@endTime))
          OR planned_date = @plannedDate
          OR list_type = 'today'
        )
      `,
    )
    .get({ startTime, endTime, plannedDate: today }) as { total: number };
  return {
    tasks: listTodayFloatingTasks(limit),
    totalOpen: row.total,
  };
}

export function getTask(localId: string): TaskRecord | null {
  const row = database()
    .prepare("SELECT * FROM tasks WHERE local_id = ? LIMIT 1")
    .get(localId) as TaskRow | undefined;
  return row ? taskFromRow(row) : null;
}

export function getTaskByServerId(serverId: number): TaskRecord | null {
  const row = database()
    .prepare("SELECT * FROM tasks WHERE server_id = ? LIMIT 1")
    .get(serverId) as TaskRow | undefined;
  return row ? taskFromRow(row) : null;
}

export function listTasksByServerIds(serverIds: unknown): TaskRecord[] {
  if (!Array.isArray(serverIds)) return [];
  const ids = Array.from(
    new Set(serverIds.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0)),
  ).slice(0, 5_000);
  if (ids.length === 0) return [];

  const rows: TaskRow[] = [];
  for (let index = 0; index < ids.length; index += 500) {
    const chunk = ids.slice(index, index + 500);
    const placeholders = chunk.map(() => "?").join(",");
    rows.push(
      ...(database()
        .prepare(`SELECT * FROM tasks WHERE server_id IN (${placeholders})`)
        .all(...chunk) as TaskRow[]),
    );
  }
  return rows.map(taskFromRow);
}

export function upsertTask(task: TaskRecord): TaskRecord {
  return upsertTasks([task])[0] ?? task;
}

export function upsertTasks(tasks: TaskRecord[]): TaskRecord[] {
  if (tasks.length === 0) return [];
  const target = database();
  const getByServerId = target.prepare("SELECT * FROM tasks WHERE server_id = ? LIMIT 1");
  const saveTask = target.prepare(
    `
    INSERT INTO tasks (
      local_id, server_id, title, content, status, priority, tag, project, list_type,
      due_time, remind_time, repeat_rule, planned_date, completed_at, snoozed_until,
      parent_server_id, checklist_json, is_template, template_name, sort_order,
      version, is_deleted, sync_status, created_at, updated_at, last_sync_at,
      conflict_server_json, conflict_local_json
    ) VALUES (
      @localId, @serverId, @title, @content, @status, @priority, @tag, @project, @listType,
      @dueTime, @remindTime, @repeatRule, @plannedDate, @completedAt, @snoozedUntil,
      @parentServerId, @checklistJson, @isTemplateInt, @templateName, @sortOrder,
      @version, @isDeletedInt, @syncStatus, @createdAt, @updatedAt, @lastSyncAt,
      @conflictServerJson, @conflictLocalJson
    )
    ON CONFLICT(local_id) DO UPDATE SET
      server_id = excluded.server_id,
      title = excluded.title,
      content = excluded.content,
      status = excluded.status,
      priority = excluded.priority,
      tag = excluded.tag,
      project = excluded.project,
      list_type = excluded.list_type,
      due_time = excluded.due_time,
      remind_time = excluded.remind_time,
      repeat_rule = excluded.repeat_rule,
      planned_date = excluded.planned_date,
      completed_at = excluded.completed_at,
      snoozed_until = excluded.snoozed_until,
      parent_server_id = excluded.parent_server_id,
      checklist_json = excluded.checklist_json,
      is_template = excluded.is_template,
      template_name = excluded.template_name,
      sort_order = excluded.sort_order,
      version = excluded.version,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      updated_at = excluded.updated_at,
      last_sync_at = excluded.last_sync_at,
      conflict_server_json = excluded.conflict_server_json,
      conflict_local_json = excluded.conflict_local_json
    `,
  );
  const deleteMergedLocalTask = target.prepare("DELETE FROM tasks WHERE local_id = ? AND server_id IS NULL");
  const deleteMergedQueue = target.prepare("DELETE FROM sync_queue WHERE local_id = ?");
  const saveMany = target.transaction((items: TaskRecord[]) => {
    return items.map((item) => saveTaskRecord(item, getByServerId, saveTask, deleteMergedLocalTask, deleteMergedQueue));
  });
  return saveMany(tasks) as TaskRecord[];
}

function saveTaskRecord(
  task: TaskRecord,
  getByServerId: Database.Statement,
  saveTask: Database.Statement,
  deleteMergedLocalTask: Database.Statement,
  deleteMergedQueue: Database.Statement,
): TaskRecord {
  const existingByServerId = task.serverId === null
    ? null
    : (getByServerId.get(task.serverId) as TaskRow | undefined);
  const existingTask = existingByServerId ? taskFromRow(existingByServerId) : null;
  const shouldRemoveMergedDuplicate = Boolean(existingTask && existingTask.localId !== task.localId);
  const normalizedTask = existingTask && existingTask.localId !== task.localId
    ? {
        ...task,
        localId: existingTask.localId,
        createdAt: existingTask.createdAt,
      }
    : task;

  saveTask.run({
    ...normalizedTask,
    project: normalizedTask.project ?? null,
    listType: normalizedTask.listType ?? "inbox",
    plannedDate: normalizedTask.plannedDate ?? null,
    completedAt: normalizedTask.completedAt ?? null,
    snoozedUntil: normalizedTask.snoozedUntil ?? null,
    parentServerId: normalizedTask.parentServerId ?? null,
    checklistJson: normalizedTask.checklistJson || "[]",
    isTemplateInt: normalizedTask.isTemplate ? 1 : 0,
    templateName: normalizedTask.templateName ?? null,
    sortOrder: normalizedTask.sortOrder ?? 0,
    isDeletedInt: normalizedTask.isDeleted ? 1 : 0,
    conflictServerJson: normalizedTask.conflictServerJson ?? null,
    conflictLocalJson: normalizedTask.conflictLocalJson ?? null,
  });

  if (shouldRemoveMergedDuplicate) {
    deleteMergedLocalTask.run(task.localId);
    deleteMergedQueue.run(task.localId);
  }
  return normalizedTask;
}

export function softDeleteLocalTask(localId: string): void {
  database()
    .prepare(
      `
      UPDATE tasks
      SET is_deleted = 1,
          sync_status = 'pending_delete',
          updated_at = ?,
          conflict_server_json = NULL,
          conflict_local_json = NULL
      WHERE local_id = ?
      `,
    )
    .run(new Date().toISOString(), localId);
}

export function purgeLocalTask(localId: string): void {
  const target = localId.trim();
  if (!target) return;
  const db = database();
  const run = db.transaction((id: string) => {
    db.prepare("DELETE FROM sync_queue WHERE local_id = ?").run(id);
    db.prepare("DELETE FROM tasks WHERE local_id = ?").run(id);
  });
  run(target);
}

export function clearLocalDeviceData(): { tasks: number; queue: number } {
  const db = database();
  const run = db.transaction(() => {
    const queue = Number(db.prepare("DELETE FROM sync_queue").run().changes || 0);
    const tasks = Number(db.prepare("DELETE FROM tasks").run().changes || 0);
    return { tasks, queue };
  });
  return run();
}

export function deleteLocalUnsyncedTasks(localIds: string[]): number {
  const uniqueIds = Array.from(new Set(localIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return 0;
  const db = database();
  const deleteQueue = db.prepare("DELETE FROM sync_queue WHERE local_id = ?");
  const deleteTask = db.prepare("DELETE FROM tasks WHERE local_id = ? AND server_id IS NULL");
  const run = db.transaction((ids: string[]) => {
    let deleted = 0;
    for (const localId of ids) {
      deleteQueue.run(localId);
      deleted += Number(deleteTask.run(localId).changes || 0);
    }
    return deleted;
  });
  return run(uniqueIds);
}

export function undoImportedBackupTasks(items: BackupImportUndoItem[]): BackupImportUndoResult {
  const uniqueItems = Array.from(
    new Map(
      items
        .map((item) => ({
          localId: item.localId.trim(),
          importedUpdatedAt: item.importedUpdatedAt.trim(),
        }))
        .filter((item) => item.localId && item.importedUpdatedAt)
        .map((item) => [item.localId, item]),
    ).values(),
  );
  if (uniqueItems.length === 0) {
    return { undoneCount: 0, skippedChangedCount: 0 };
  }
  const db = database();
  const getTaskByLocalId = db.prepare("SELECT * FROM tasks WHERE local_id = ?");
  const deleteQueue = db.prepare("DELETE FROM sync_queue WHERE local_id = ?");
  const deleteUnsyncedTask = db.prepare("DELETE FROM tasks WHERE local_id = ? AND server_id IS NULL");
  const softDeleteSyncedTask = db.prepare(
    `
    UPDATE tasks
    SET is_deleted = 1,
        sync_status = 'pending_delete',
        updated_at = ?,
        conflict_server_json = NULL,
        conflict_local_json = NULL
    WHERE local_id = ? AND server_id IS NOT NULL
    `,
  );
  const run = db.transaction((undoItems: BackupImportUndoItem[]) => {
    let undoneCount = 0;
    let skippedChangedCount = 0;
    for (const item of undoItems) {
      const task = getTaskByLocalId.get(item.localId) as TaskRow | undefined;
      if (!task) continue;
      if (task.updated_at !== item.importedUpdatedAt) {
        skippedChangedCount += 1;
        continue;
      }
      deleteQueue.run(item.localId);
      if (task.server_id === null) {
        undoneCount += Number(deleteUnsyncedTask.run(item.localId).changes || 0);
        continue;
      }
      const updatedAt = new Date().toISOString();
      const changes = Number(softDeleteSyncedTask.run(updatedAt, item.localId).changes || 0);
      if (changes > 0) {
        undoneCount += changes;
        enqueueTaskChange(
          {
            ...taskFromRow(task),
            isDeleted: true,
            syncStatus: "pending_delete",
            updatedAt,
            conflictServerJson: null,
            conflictLocalJson: null,
          },
          "delete",
        );
      }
    }
    return { undoneCount, skippedChangedCount };
  });
  return run(uniqueItems);
}

export function markTaskCompleted(localId: string): TaskRecord | null {
  const task = getTask(localId);
  if (!task) return null;
  const now = new Date().toISOString();
  const next: TaskRecord = {
    ...task,
    status: "completed",
    completedAt: now,
    syncStatus: task.serverId ? "pending_update" : "pending_create",
    updatedAt: now,
    conflictServerJson: null,
    conflictLocalJson: null,
  };
  return upsertTask(next);
}

export function createLocalTask(title: string): TaskRecord | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const timeZone = getSettings().displayTimeZone;
  const parsed = parseQuickTask(trimmed, nowDate, timeZone);
  const today = todayLocalDate(nowDate, timeZone);
  const { startTime, endTime } = shanghaiDayBounds(today, timeZone);
  const dueTimeMs = parsed.dueTime ? new Date(parsed.dueTime).getTime() : Number.NaN;
  const hasDueTimeToday =
    Number.isFinite(dueTimeMs) &&
    dueTimeMs >= new Date(startTime).getTime() &&
    dueTimeMs < new Date(endTime).getTime();
  const shouldDefaultToToday = !parsed.plannedDate && !parsed.dueTime;
  const plannedDate = parsed.plannedDate ?? (shouldDefaultToToday ? today : null);
  const isTodayTask = plannedDate === today || hasDueTimeToday;
  const task: TaskRecord = {
    localId: `local-${randomUUID()}`,
    serverId: null,
    title: parsed.title,
    content: null,
    status: "todo",
    priority: parsed.priority,
    tag: parsed.tag,
    project: parsed.project,
    listType: isTodayTask ? "today" : "inbox",
    dueTime: parsed.dueTime,
    remindTime: null,
    repeatRule: null,
    plannedDate,
    completedAt: null,
    snoozedUntil: null,
    parentServerId: null,
    checklistJson: "[]",
    isTemplate: false,
    templateName: null,
    sortOrder: 0,
    version: 0,
    isDeleted: false,
    syncStatus: "pending_create",
    createdAt: now,
    updatedAt: now,
    lastSyncAt: null,
    conflictServerJson: null,
    conflictLocalJson: null,
  };

  upsertTask(task);
  enqueueTaskChange(task, "create");
  return task;
}

export function completeLocalTaskWithQueue(localId: string): TaskRecord | null {
  const task = markTaskCompleted(localId);
  if (!task) return null;
  enqueueTaskChange(task, task.serverId ? "complete" : "create");
  return task;
}

export function listQueue(limit = 100, includeExhausted = false): SyncQueueRecord[] {
  const rows = database()
    .prepare(
      `
      SELECT * FROM sync_queue
      ${includeExhausted ? "" : "WHERE attempt_count < 8"}
      ORDER BY attempt_count ASC, id ASC
      LIMIT @limit
      `,
    )
    .all({ limit: clampLimit(limit, 1, 100) }) as SyncQueueRow[];
  return rows.map(queueFromRow);
}

export function getSyncQueueCounts(): SyncQueueCounts {
  const row = database()
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN attempt_count < 8 THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN attempt_count >= 8 THEN 1 ELSE 0 END), 0) AS exhausted
      FROM sync_queue
      `,
    )
    .get() as { total?: number; pending?: number; exhausted?: number } | undefined;
  return {
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    exhausted: Number(row?.exhausted ?? 0),
  };
}

export function enqueueChange(change: SyncQueueRecord): number {
  removeQueueByLocalId(change.localId);
  const result = database()
    .prepare(
      `
      INSERT INTO sync_queue (
        local_id, server_id, action, title, content, status, priority, tag, project,
        list_type, due_time, remind_time, repeat_rule, planned_date, completed_at,
        snoozed_until, parent_server_id, checklist_json, is_template, template_name,
        sort_order, version, local_updated_at, created_at, attempt_count
      ) VALUES (
        @localId, @serverId, @action, @title, @content, @status, @priority, @tag, @project,
        @listType, @dueTime, @remindTime, @repeatRule, @plannedDate, @completedAt,
        @snoozedUntil, @parentServerId, @checklistJson, @isTemplateInt, @templateName,
        @sortOrder, @version, @localUpdatedAt, @createdAt, @attemptCount
      )
      `,
    )
    .run({
      ...change,
      project: change.project ?? null,
      listType: change.listType ?? null,
      plannedDate: change.plannedDate ?? null,
      completedAt: change.completedAt ?? null,
      snoozedUntil: change.snoozedUntil ?? null,
      parentServerId: change.parentServerId ?? null,
      checklistJson: change.checklistJson ?? null,
      isTemplateInt: change.isTemplate ? 1 : 0,
      templateName: change.templateName ?? null,
      sortOrder: change.sortOrder ?? null,
      attemptCount: change.attemptCount ?? 0,
    });
  return Number(result.lastInsertRowid);
}

export function enqueueTaskChange(task: TaskRecord, action: SyncAction): number {
  return enqueueChange({
    localId: task.localId,
    serverId: task.serverId,
    action,
    title: task.title,
    content: task.content,
    status: task.status,
    priority: task.priority,
    tag: task.tag,
    project: task.project,
    listType: task.listType,
    dueTime: task.dueTime,
    remindTime: task.remindTime,
    repeatRule: task.repeatRule,
    plannedDate: task.plannedDate,
    completedAt: task.completedAt,
    snoozedUntil: task.snoozedUntil,
    parentServerId: task.parentServerId,
    checklistJson: task.checklistJson,
    isTemplate: task.isTemplate,
    templateName: task.templateName,
    sortOrder: task.sortOrder,
    version: task.version,
    localUpdatedAt: task.updatedAt,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
  });
}

export function removeQueueItem(id: number): void {
  database().prepare("DELETE FROM sync_queue WHERE id = ?").run(id);
}

export function removeQueueByLocalId(localId: string): void {
  database().prepare("DELETE FROM sync_queue WHERE local_id = ?").run(localId);
}

export function incrementAttempt(id: number): void {
  database().prepare("UPDATE sync_queue SET attempt_count = attempt_count + 1 WHERE id = ?").run(id);
}

function taskFromRow(row: TaskRow): TaskRecord {
  return {
    localId: row.local_id,
    serverId: row.server_id,
    title: row.title,
    content: row.content,
    status: row.status,
    priority: row.priority,
    tag: row.tag,
    project: row.project,
    listType: row.list_type ?? "inbox",
    dueTime: row.due_time,
    remindTime: row.remind_time,
    repeatRule: row.repeat_rule,
    plannedDate: row.planned_date,
    completedAt: row.completed_at,
    snoozedUntil: row.snoozed_until,
    parentServerId: row.parent_server_id,
    checklistJson: row.checklist_json ?? "[]",
    isTemplate: row.is_template === 1,
    templateName: row.template_name,
    sortOrder: row.sort_order ?? 0,
    version: row.version,
    isDeleted: row.is_deleted === 1,
    syncStatus: toSyncStatus(row.sync_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncAt: row.last_sync_at,
    conflictServerJson: row.conflict_server_json,
    conflictLocalJson: row.conflict_local_json,
  };
}

function queueFromRow(row: SyncQueueRow): SyncQueueRecord {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id,
    action: toSyncAction(row.action),
    title: row.title,
    content: row.content,
    status: row.status,
    priority: row.priority,
    tag: row.tag,
    project: row.project,
    listType: row.list_type,
    dueTime: row.due_time,
    remindTime: row.remind_time,
    repeatRule: row.repeat_rule,
    plannedDate: row.planned_date,
    completedAt: row.completed_at,
    snoozedUntil: row.snoozed_until,
    parentServerId: row.parent_server_id,
    checklistJson: row.checklist_json,
    isTemplate: row.is_template === null ? null : row.is_template === 1,
    templateName: row.template_name,
    sortOrder: row.sort_order,
    version: row.version,
    localUpdatedAt: row.local_updated_at,
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
  };
}

function toSyncStatus(value: string): SyncStatus {
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
  return "conflict";
}

function toSyncAction(value: string): SyncAction {
  if (
    value === "create" ||
    value === "update" ||
    value === "delete" ||
    value === "complete" ||
    value === "restore"
  ) {
    return value;
  }
  return "update";
}
