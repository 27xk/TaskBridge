import type { SyncStatus, SyncAction, TaskRecord, TaskListSummary, SyncQueueRecord, SyncQueueCounts, FloatingTaskSummary } from "../common/task";
import { TASK_PREVIEW_LENGTH } from "../common/task-summary";
import type { BackupImportUndoItem, BackupImportUndoResult } from "../common/backup";
import { app } from "electron";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { parseQuickTask, shanghaiDayBounds, todayLocalDate } from "../common/quick-add-parser";
import { workspaceDatabaseFileName } from "../common/workspace";
import {
  claimLegacyGlobalDatabaseWorkspace,
  claimLegacyUserDatabaseWorkspace,
  getActiveWorkspaceKey,
  getSettings,
} from "./state";
import { migrateSqliteDatabase } from "./sqlite-migration";
import type { TaskCommitRequest, TaskCommitResult, TaskMutationState } from "../common/task-mutation-policy";
import type { TaskChangeCursor, TaskChangesPage, TaskSnapshotPage, TaskSyncCounts, SyncHealthSummary } from "../common/task-index";

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
const TASK_CHANGE_HISTORY_LIMIT = 10_000;

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
  installTaskChangeJournal(db);
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

function installTaskChangeJournal(target: Database.Database): void {
  target.exec(`
    CREATE TABLE IF NOT EXISTS task_change_clock (id INTEGER PRIMARY KEY CHECK (id = 1), epoch TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS task_changes (revision INTEGER PRIMARY KEY, local_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_change_versions (local_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO task_change_versions(local_id, revision) SELECT local_id, 0 FROM tasks;
  `);
  target.prepare("INSERT OR IGNORE INTO task_change_clock(id, epoch, revision) VALUES (1, ?, 0)").run(randomUUID());
  // Keep a fixed-size journal. A reader that falls behind starts a fresh keyset snapshot.
  for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
    const record = operation === "DELETE" ? "OLD" : "NEW";
    target.exec(`
      DROP TRIGGER IF EXISTS task_changes_after_${operation.toLowerCase()};
      CREATE TRIGGER task_changes_after_${operation.toLowerCase()} AFTER ${operation} ON tasks
      BEGIN
        UPDATE task_change_clock SET revision = revision + 1 WHERE id = 1;
        INSERT INTO task_changes(revision, local_id) SELECT revision, ${record}.local_id FROM task_change_clock WHERE id = 1;
        ${operation === "DELETE" ? "DELETE FROM task_change_versions WHERE local_id = OLD.local_id;" : "INSERT INTO task_change_versions(local_id, revision) SELECT NEW.local_id, revision FROM task_change_clock WHERE id = 1 ON CONFLICT(local_id) DO UPDATE SET revision = excluded.revision;"}
        DELETE FROM task_changes WHERE revision <= (SELECT revision - ${TASK_CHANGE_HISTORY_LIMIT} FROM task_change_clock WHERE id = 1);
      END;
    `);
  }
}

function taskChangeCursor(): TaskChangeCursor {
  return database().prepare("SELECT epoch, revision FROM task_change_clock WHERE id = 1").get() as TaskChangeCursor;
}

// Project in SQLite so bodies, checklists and conflict snapshots never cross the list IPC boundary.
function taskSummaryColumns(): string {
  return `tasks.local_id, tasks.server_id, tasks.title, tasks.status, tasks.priority, tasks.tag, tasks.project,
    tasks.list_type, tasks.due_time, tasks.remind_time, tasks.repeat_rule, tasks.planned_date, tasks.completed_at,
    tasks.snoozed_until, tasks.parent_server_id, tasks.is_template, tasks.template_name, tasks.sort_order,
    tasks.version, tasks.is_deleted, tasks.sync_status, tasks.created_at, tasks.updated_at, tasks.last_sync_at,
    substr(tasks.content, 1, ${TASK_PREVIEW_LENGTH}) AS content_preview,
    CASE WHEN json_valid(tasks.checklist_json) AND json_type(tasks.checklist_json) = 'array'
      THEN json_array_length(tasks.checklist_json) ELSE 0 END AS checklist_total,
    (SELECT COUNT(*) FROM json_each(CASE WHEN json_valid(tasks.checklist_json) AND json_type(tasks.checklist_json) = 'array'
      THEN tasks.checklist_json ELSE '[]' END) WHERE CASE WHEN type = 'object' THEN json_type(value, '$.done') = 'true' ELSE 0 END) AS checklist_done,
    (tasks.conflict_server_json IS NOT NULL AND tasks.conflict_server_json != '') AS has_server_conflict,
    COALESCE((SELECT revision FROM task_change_versions WHERE task_change_versions.local_id = tasks.local_id), 0) AS change_revision`;
}

export function listTaskSnapshotPage(afterLocalId: string | null = null, limit = 1_000): TaskSnapshotPage<TaskListSummary> {
  const cursor = taskChangeCursor();
  const pageSize = clampLimit(limit, 1, 1_000);
  const rows = database().prepare(`SELECT ${taskSummaryColumns()} FROM tasks WHERE @afterLocalId IS NULL OR local_id > @afterLocalId ORDER BY local_id LIMIT @limit`)
    .all({ afterLocalId, limit: pageSize + 1 }) as TaskSummaryRow[];
  const hasMore = rows.length > pageSize;
  const tasks = rows.slice(0, pageSize).map(taskSummaryFromRow);
  return { tasks, cursor, nextLocalId: hasMore ? tasks[tasks.length - 1].localId : null };
}

export function listTaskChanges(cursor: TaskChangeCursor, limit = 1_000): TaskChangesPage<TaskListSummary> {
  const current = taskChangeCursor();
  const resetRequired = cursor.epoch !== current.epoch || cursor.revision > current.revision
    || cursor.revision < current.revision - TASK_CHANGE_HISTORY_LIMIT;
  if (resetRequired) return { tasks: [], removedIds: [], cursor: current, hasMore: false, resetRequired: true };
  const pageSize = clampLimit(limit, 1, 1_000);
  const rows = database().prepare(`
    SELECT ${taskSummaryColumns()}, changed.local_id AS changed_id, changed.revision AS change_revision FROM (
      SELECT local_id, MAX(revision) AS revision FROM task_changes WHERE revision > @revision
      GROUP BY local_id ORDER BY revision LIMIT @limit
    ) AS changed LEFT JOIN tasks ON tasks.local_id = changed.local_id ORDER BY changed.revision
  `).all({ revision: cursor.revision, limit: pageSize + 1 }) as Array<TaskSummaryRow & { changed_id: string; change_revision: number }>;
  const page = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  return {
    tasks: page.filter((row) => row.local_id !== null).map(taskSummaryFromRow),
    removedIds: page.filter((row) => row.local_id === null).map((row) => row.changed_id),
    cursor: hasMore ? { ...current, revision: page[page.length - 1].change_revision } : current,
    hasMore,
    resetRequired: false,
  };
}

export function searchTaskIds(keyword: string): string[] {
  // Match the existing Unicode-aware JS search while keeping long text in the main process.
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  const result: string[] = [];
  for (const row of database().prepare("SELECT local_id, title, content, tag, project FROM tasks").iterate() as Iterable<Pick<TaskRow, "local_id" | "title" | "content" | "tag" | "project">>) {
    if (`${row.title} ${row.content ?? ""} ${row.tag ?? ""} ${row.project ?? ""}`.toLowerCase().includes(normalized)) result.push(row.local_id);
  }
  return result;
}

export function getTaskSyncCounts(): TaskSyncCounts {
  return database().prepare(`SELECT
    COUNT(CASE WHEN sync_status = 'sync_failed' THEN 1 END) AS failed,
    COUNT(CASE WHEN sync_status = 'conflict' THEN 1 END) AS conflicts FROM tasks`).get() as TaskSyncCounts;
}

export function getSyncHealthSummary(): SyncHealthSummary {
  return database().prepare(`SELECT COUNT(*) AS pendingCount, MIN(created_at) AS oldestPendingAt,
    (SELECT COUNT(*) FROM tasks WHERE sync_status = 'conflict') AS conflictCount FROM sync_queue`).get() as SyncHealthSummary;
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

export function listTodayTasks(limit = 200, offset = 0): TaskRecord[] {
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
      LIMIT @limit OFFSET @offset
      `,
    )
    .all({ startTime, endTime, nowTime, plannedDate: today, limit: clampLimit(limit, 1, 1_000), offset: Math.max(0, Math.trunc(offset)) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function listTodayFloatingTasks(limit = 8): TaskListSummary[] {
  const timeZone = getSettings().displayTimeZone;
  const today = todayLocalDate(new Date(), timeZone);
  const { startTime, endTime } = shanghaiDayBounds(today, timeZone);
  const rows = database()
    .prepare(
      `
      SELECT ${taskSummaryColumns()} FROM tasks
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
    .all({ startTime, endTime, plannedDate: today, limit: clampLimit(limit, 1, 30) }) as TaskSummaryRow[];
  return rows.map(taskSummaryFromRow);
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

export function readTaskMutationState(localId: string, expectedWorkspaceKey: string): TaskMutationState {
  if (!expectedWorkspaceKey || expectedWorkspaceKey !== getActiveWorkspaceKey()) {
    throw new Error("Workspace changed before reading the task mutation");
  }
  const target = database();
  return target.transaction(() => {
    const task = getTask(localId);
    const queue = target.prepare("SELECT id FROM sync_queue WHERE local_id = ? ORDER BY id DESC LIMIT 1").get(localId) as { id: number } | undefined;
    const revision = target.prepare("SELECT revision FROM task_change_versions WHERE local_id = ?").get(localId) as { revision: number } | undefined;
    return { task, queueId: queue?.id ?? null, changeRevision: revision?.revision ?? 0 };
  })();
}

export function commitTaskChange(request: TaskCommitRequest): TaskCommitResult {
  if (!request.expectedWorkspaceKey || request.expectedWorkspaceKey !== getActiveWorkspaceKey()) {
    throw new Error("Workspace changed before committing the task mutation");
  }
  if (request.expected && request.expected.localId !== request.task.localId) {
    throw new Error("Task identity changed before committing the mutation");
  }
  const target = database();
  return target.transaction(() => {
    const current = readTaskMutationState(request.task.localId, request.expectedWorkspaceKey);
    const sameTask = current.task === null ? request.expected === null
      : request.expected !== null && (Object.keys(current.task) as Array<keyof TaskRecord>).every((field) => current.task![field] === request.expected![field]);
    if (!sameTask || current.queueId !== request.expectedQueueId) return { ...current, applied: false };
    const saved = upsertTask(request.task, false, request.expectedWorkspaceKey);
    if (saved.localId !== request.task.localId) throw new Error("Task identity changed during the mutation");
    if (request.queueAction === null) removeQueueByLocalId(saved.localId);
    else if (request.queueAction !== undefined) enqueueTaskChange(saved, request.queueAction);
    if (request.removeQueueId !== undefined) {
      target.prepare("DELETE FROM sync_queue WHERE id = ? AND local_id = ?").run(request.removeQueueId, saved.localId);
    }
    return { ...readTaskMutationState(saved.localId, request.expectedWorkspaceKey), applied: true };
  })();
}

export function upsertTask(task: TaskRecord, preserveLocalChanges = false, expectedWorkspaceKey?: string): TaskRecord {
  if (expectedWorkspaceKey !== undefined && expectedWorkspaceKey !== getActiveWorkspaceKey()) {
    throw new Error("Workspace changed before saving the task");
  }
  return upsertTasks([task], preserveLocalChanges)[0] ?? task;
}

export function upsertTasks(tasks: TaskRecord[], preserveLocalChanges = false): TaskRecord[] {
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
    return items.map((item) => saveTaskRecord(item, getByServerId, saveTask, deleteMergedLocalTask, deleteMergedQueue, preserveLocalChanges));
  });
  return saveMany(tasks) as TaskRecord[];
}

function saveTaskRecord(
  task: TaskRecord,
  getByServerId: Database.Statement,
  saveTask: Database.Statement,
  deleteMergedLocalTask: Database.Statement,
  deleteMergedQueue: Database.Statement,
  preserveLocalChanges: boolean,
): TaskRecord {
  const existingByServerId = task.serverId === null
    ? null
    : (getByServerId.get(task.serverId) as TaskRow | undefined);
  const existingTask = existingByServerId ? taskFromRow(existingByServerId) : null;
  // Read and decide in the write transaction, after any concurrent local edit.
  if (preserveLocalChanges && existingTask && (existingTask.syncStatus !== "synced" || existingTask.version > task.version)) {
    return existingTask;
  }
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

export function createLocalTask(title: string, submissionId?: string): TaskRecord | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const localId = submissionId ? `capture-${submissionId}` : `local-${randomUUID()}`;
  const existing = submissionId ? getTask(localId) : null;
  if (existing) return existing;

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
    localId,
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

  database().transaction(() => {
    upsertTask(task);
    enqueueTaskChange(task, "create");
  })();
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

type TaskSummaryRow = Omit<TaskRow, "content" | "checklist_json" | "conflict_server_json" | "conflict_local_json"> & {
  content_preview: string | null; checklist_total: number; checklist_done: number; has_server_conflict: number; change_revision: number;
};

function taskSummaryFromRow(row: TaskSummaryRow): TaskListSummary {
  // The common scalar mapping never substitutes unloaded detail fields.
  return { ...taskScalarFields(row), contentPreview: row.content_preview,
    checklistTotal: row.checklist_total, checklistDone: row.checklist_done, hasServerConflict: row.has_server_conflict === 1,
    changeRevision: row.change_revision };
}

function taskFromRow(row: TaskRow): TaskRecord {
  return { ...taskScalarFields(row), content: row.content, checklistJson: row.checklist_json ?? "[]",
    conflictServerJson: row.conflict_server_json, conflictLocalJson: row.conflict_local_json };
}

function taskScalarFields(row: Omit<TaskRow, "content" | "checklist_json" | "conflict_server_json" | "conflict_local_json">): Omit<TaskRecord, "content" | "checklistJson" | "conflictServerJson" | "conflictLocalJson"> {
  return {
    localId: row.local_id,
    serverId: row.server_id,
    title: row.title,
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
    isTemplate: row.is_template === 1,
    templateName: row.template_name,
    sortOrder: row.sort_order ?? 0,
    version: row.version,
    isDeleted: row.is_deleted === 1,
    syncStatus: toSyncStatus(row.sync_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncAt: row.last_sync_at,
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
