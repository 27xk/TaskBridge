import { app } from "electron";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { parseQuickTask, todayLocalDate } from "../shared/quick-add-parser";

export type SyncStatus = "synced" | "pending_create" | "pending_update" | "pending_delete" | "conflict";
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

export function database(): Database.Database {
  if (db) return db;
  const dbPath = join(app.getPath("userData"), "taskbridge.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
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
      last_sync_at TEXT
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
  `);
  migrateSchema(db);
  return db;
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
    CREATE INDEX IF NOT EXISTS ix_sync_queue_created ON sync_queue(created_at, id);
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

export function listTasks(includeDeleted: boolean, limit = 300, offset = 0): TaskRecord[] {
  const rows = database()
    .prepare(
      `
      SELECT * FROM tasks
      ${includeDeleted ? "" : "WHERE is_deleted = 0"}
      ORDER BY
        CASE WHEN due_time IS NULL THEN 1 ELSE 0 END,
        due_time ASC,
        updated_at DESC
      LIMIT @limit OFFSET @offset
      `,
    )
    .all({ limit: clampLimit(limit, 1, 10_000), offset: Math.max(0, offset) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function listTodayTasks(limit = 120): TaskRecord[] {
  const today = todayLocalDate();
  const rows = database()
    .prepare(
      `
      SELECT * FROM tasks
      WHERE is_deleted = 0
        AND (
          (due_time IS NOT NULL AND due_time LIKE @today)
          OR (remind_time IS NOT NULL AND remind_time LIKE @today)
          OR planned_date = @plannedDate
        )
      ORDER BY
        sort_order ASC,
        CASE WHEN due_time IS NULL THEN 1 ELSE 0 END,
        due_time ASC,
        updated_at DESC
      LIMIT @limit
      `,
    )
    .all({ today: `${today}%`, plannedDate: today, limit: clampLimit(limit, 1, 200) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function listTodayFloatingTasks(limit = 8): TaskRecord[] {
  const today = todayLocalDate();
  const rows = database()
    .prepare(
      `
      SELECT * FROM tasks
      WHERE is_deleted = 0
        AND (
          (due_time IS NOT NULL AND due_time LIKE @today)
          OR (remind_time IS NOT NULL AND remind_time LIKE @today)
          OR planned_date = @plannedDate
          OR (status = 'todo' AND priority >= @highPriority)
        )
      ORDER BY
        CASE WHEN status = 'completed' THEN 1 ELSE 0 END,
        CASE WHEN planned_date = @plannedDate THEN 0 ELSE 1 END,
        CASE WHEN due_time IS NULL THEN 1 ELSE 0 END,
        due_time ASC,
        priority DESC,
        updated_at DESC
      LIMIT @limit
      `,
    )
    .all({ today: `${today}%`, plannedDate: today, highPriority: 3, limit: clampLimit(limit, 1, 30) }) as TaskRow[];
  return rows.map(taskFromRow);
}

export function getTask(localId: string): TaskRecord | null {
  const row = database()
    .prepare("SELECT * FROM tasks WHERE local_id = ? LIMIT 1")
    .get(localId) as TaskRow | undefined;
  return row ? taskFromRow(row) : null;
}

export function upsertTask(task: TaskRecord): TaskRecord {
  database()
    .prepare(
      `
      INSERT INTO tasks (
        local_id, server_id, title, content, status, priority, tag, project, list_type,
        due_time, remind_time, repeat_rule, planned_date, completed_at, snoozed_until,
        parent_server_id, checklist_json, is_template, template_name, sort_order,
        version, is_deleted, sync_status, created_at, updated_at, last_sync_at
      ) VALUES (
        @localId, @serverId, @title, @content, @status, @priority, @tag, @project, @listType,
        @dueTime, @remindTime, @repeatRule, @plannedDate, @completedAt, @snoozedUntil,
        @parentServerId, @checklistJson, @isTemplateInt, @templateName, @sortOrder,
        @version, @isDeletedInt, @syncStatus, @createdAt, @updatedAt, @lastSyncAt
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
        last_sync_at = excluded.last_sync_at
      `,
    )
    .run({
      ...task,
      project: task.project ?? null,
      listType: task.listType ?? "inbox",
      plannedDate: task.plannedDate ?? null,
      completedAt: task.completedAt ?? null,
      snoozedUntil: task.snoozedUntil ?? null,
      parentServerId: task.parentServerId ?? null,
      checklistJson: task.checklistJson || "[]",
      isTemplateInt: task.isTemplate ? 1 : 0,
      templateName: task.templateName ?? null,
      sortOrder: task.sortOrder ?? 0,
      isDeletedInt: task.isDeleted ? 1 : 0,
    });
  return task;
}

export function softDeleteLocalTask(localId: string): void {
  database()
    .prepare(
      `
      UPDATE tasks
      SET is_deleted = 1,
          sync_status = 'pending_delete',
          updated_at = ?
      WHERE local_id = ?
      `,
    )
    .run(new Date().toISOString(), localId);
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
  };
  return upsertTask(next);
}

export function createLocalTask(title: string): TaskRecord | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const now = new Date().toISOString();
  const parsed = parseQuickTask(trimmed);
  const plannedDate = parsed.plannedDate ?? todayLocalDate();
  const task: TaskRecord = {
    localId: `local-${randomUUID()}`,
    serverId: null,
    title: parsed.title,
    content: null,
    status: "todo",
    priority: parsed.priority,
    tag: parsed.tag,
    project: null,
    listType: "today",
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

export function listQueue(limit = 100): SyncQueueRecord[] {
  const rows = database()
    .prepare("SELECT * FROM sync_queue ORDER BY id ASC LIMIT @limit")
    .all({ limit: clampLimit(limit, 1, 100) }) as SyncQueueRow[];
  return rows.map(queueFromRow);
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
