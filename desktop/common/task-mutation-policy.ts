import type { TaskRecord, SyncQueueRecord } from "./task";
import {
  isoToShanghaiDateTimeInput,
  parseTaskBridgeDate,
  shanghaiDateTimeInputToIso,
  todayLocalDate,
} from "./quick-add-parser";

export type TaskMutationKind = "complete" | "delete" | "schedule" | "priority" | "edit" | "restore" | "snooze";

export interface TaskMutationResult {
  requested: number;
  succeeded: number;
  failed: number;
  skipped: number;
  succeededIds: string[];
  failedIds: string[];
  queueFailedIds?: string[];
  skippedIds: string[];
  refreshFailed?: boolean;
}

export interface TaskMutationState {
  task: TaskRecord | null;
  queueId: number | null;
  changeRevision?: number;
}

export interface TaskCommitRequest {
  expectedWorkspaceKey: string;
  expected: TaskRecord | null;
  expectedQueueId: number | null;
  task: TaskRecord;
  queueAction?: SyncQueueRecord["action"] | null;
  removeQueueId?: number;
}

export interface TaskCommitResult extends TaskMutationState {
  applied: boolean;
}

export interface PendingTaskUndo {
  id: string;
  kind: TaskMutationKind;
  count: number;
  expiresAt: number;
}

export const TASK_MUTABLE_FIELDS = [
  "title", "content", "status", "priority", "tag", "project", "listType", "dueTime",
  "remindTime", "repeatRule", "plannedDate", "completedAt", "snoozedUntil", "parentServerId",
  "checklistJson", "isTemplate", "templateName", "sortOrder", "isDeleted",
] as const;

export type TaskMutationField = typeof TASK_MUTABLE_FIELDS[number];
export type TaskMutationPatch = Partial<Pick<TaskRecord, TaskMutationField>>;

export interface TaskMutationSnapshot {
  localId: string;
  localUpdatedAt: string;
  before: TaskMutationPatch;
  after: TaskMutationPatch;
  undoApplied?: boolean;
}

export function emptyTaskMutationResult(requested = 0): TaskMutationResult {
  return { requested, succeeded: 0, failed: 0, skipped: 0, succeededIds: [], failedIds: [], queueFailedIds: [], skippedIds: [] };
}

export const TASK_COMMIT_RETRIES = 8;

export function taskCreationKey(task: TaskRecord): string {
  const fields = ["title", "content", "priority", "tag", "project", "listType", "dueTime", "remindTime", "repeatRule", "plannedDate", "isTemplate", "templateName"] as const;
  const payload = Object.fromEntries(fields.map((field) => [field,
    field === "dueTime" || field === "remindTime" ? parseTaskBridgeDate(task[field])?.toISOString() ?? null : task[field],
  ]));
  const checklist = JSON.parse(task.checklistJson || "[]") as Array<{ title: string; done?: boolean }>;
  return JSON.stringify({ ...payload, checklist: checklist.map((item) => ({ title: item.title.trim(), done: item.done ?? false })) });
}

export function taskFieldEquals(field: string, first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (typeof first !== "string" || typeof second !== "string") return false;
  if (["dueTime", "remindTime", "completedAt", "snoozedUntil", "updatedAt"].includes(field)) {
    const firstTime = parseTaskBridgeDate(first)?.getTime();
    return firstTime !== undefined && firstTime === parseTaskBridgeDate(second)?.getTime();
  }
  return false;
}

export function taskMatchesPatch(task: TaskRecord, patch: TaskMutationPatch): boolean {
  return Object.entries(patch).every(([field, value]) => taskFieldEquals(field, task[field as TaskMutationField], value));
}

export function createTaskMutationSnapshot(before: TaskRecord, after: TaskRecord): TaskMutationSnapshot | null {
  const changed = TASK_MUTABLE_FIELDS.filter((field) => !taskFieldEquals(field, before[field], after[field]));
  if (changed.length === 0) return null;
  return {
    localId: after.localId,
    localUpdatedAt: after.updatedAt,
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, after[field]])),
  };
}

export function taskMatchesQueuedMutation(task: TaskRecord, queued: SyncQueueRecord): boolean {
  return taskFieldEquals("updatedAt", task.updatedAt, queued.localUpdatedAt)
    && task.isDeleted === (queued.action === "delete")
    && TASK_MUTABLE_FIELDS.every((field) => field === "isDeleted" || taskFieldEquals(field, task[field], queued[field]));
}

export function taskMutationAction(before: TaskRecord, after: TaskRecord): SyncQueueRecord["action"] {
  if (!after.serverId) return "create";
  if (after.isDeleted) return "delete";
  if (before.isDeleted) return "restore";
  return "update";
}

export function validateTaskScheduleDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!match || Number(match[1]) < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Invalid task schedule date");
  }
}

export function planTaskToday(task: TaskRecord, now: Date, timeZone: string): TaskMutationPatch {
  const due = parseTaskBridgeDate(task.dueTime);
  const dueExpired = Boolean(task.dueTime) && (!due || due.getTime() <= now.getTime());
  const reminder = parseTaskBridgeDate(task.remindTime);
  return {
    listType: "today",
    plannedDate: todayLocalDate(now, timeZone),
    dueTime: dueExpired ? null : task.dueTime,
    remindTime: !dueExpired && reminder && reminder.getTime() > now.getTime() ? task.remindTime : null,
    snoozedUntil: null,
  };
}

export function rescheduleTask(
  task: TaskRecord,
  plannedDate: string,
  now: Date,
  timeZone: string,
  dueClock?: string,
): TaskMutationPatch {
  validateTaskScheduleDate(plannedDate);
  const existingClock = isoToShanghaiDateTimeInput(task.dueTime, timeZone).slice(11);
  const clock = dueClock ?? (existingClock || null);
  const dueTime = clock ? shanghaiDateTimeInputToIso(`${plannedDate}T${clock}`, timeZone) : null;
  const dueDate = parseTaskBridgeDate(dueTime);
  const isToday = plannedDate === todayLocalDate(now, timeZone);
  const elapsedToday = isToday && dueDate !== null && dueDate.getTime() <= now.getTime();
  return {
    listType: isToday ? "today" : "inbox",
    plannedDate,
    dueTime: elapsedToday ? null : dueTime,
    remindTime: elapsedToday ? null : shiftedTaskReminder(task, dueTime, plannedDate, now, timeZone),
    snoozedUntil: null,
  };
}

function shiftedTaskReminder(task: TaskRecord, dueTime: string | null, plannedDate: string, now: Date, timeZone: string): string | null {
  if (!task.remindTime) return null;
  const reminder = parseTaskBridgeDate(task.remindTime);
  if (!reminder) return null;
  const oldDue = parseTaskBridgeDate(task.dueTime);
  const due = parseTaskBridgeDate(dueTime);
  const shifted = due && oldDue
    ? new Date(due.getTime() + reminder.getTime() - oldDue.getTime()).toISOString()
    : shanghaiDateTimeInputToIso(`${plannedDate}T${isoToShanghaiDateTimeInput(task.remindTime, timeZone).slice(11)}`, timeZone);
  const shiftedTime = parseTaskBridgeDate(shifted)?.getTime();
  if (shiftedTime !== undefined && shiftedTime > now.getTime()) return shifted;
  return due && due.getTime() > now.getTime() ? dueTime : null;
}

type AcknowledgementListener = (queued: SyncQueueRecord, task: TaskRecord) => void;
const acknowledgementListeners = new Set<AcknowledgementListener>();

export function onTaskMutationAcknowledged(listener: AcknowledgementListener): () => void {
  acknowledgementListeners.add(listener);
  return () => { acknowledgementListeners.delete(listener); };
}

export function notifyTaskMutationAcknowledged(queued: SyncQueueRecord, task: TaskRecord): void {
  for (const listener of acknowledgementListeners) listener(queued, task);
}
