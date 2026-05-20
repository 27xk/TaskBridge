import { parseTaskBridgeDate } from "../../shared/quick-add-parser";

type TaskRecencyFields = Pick<
  TaskRecord,
  "completedAt" | "updatedAt" | "dueTime" | "plannedDate" | "createdAt"
>;

type TaskTimelineFields = Pick<
  TaskRecord,
  "status" | "dueTime" | "plannedDate" | "completedAt" | "priority" | "sortOrder" | "updatedAt"
>;

interface TaskTimelineOptions {
  now?: Date | string | number;
  displayTimeZone?: string;
}

export function sortCompletedTasksByRecency<T extends TaskRecencyFields>(tasks: readonly T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const recencyDiff = completedRecencyTime(right.task) - completedRecencyTime(left.task);
      return recencyDiff || left.index - right.index;
    })
    .map((item) => item.task);
}

export function sortTasksByTimeline<T extends TaskTimelineFields>(
  tasks: readonly T[],
  options: TaskTimelineOptions = {},
): T[] {
  const nowTime = parseNowTime(options.now);
  const displayTimeZone = options.displayTimeZone ?? "Asia/Shanghai";
  return tasks
    .map((task, index) => ({
      task,
      index,
      key: taskTimelineSortKey(task, nowTime, displayTimeZone),
    }))
    .sort((left, right) => compareTimelineKey(left.key, right.key) || left.index - right.index)
    .map((item) => item.task);
}

export function isTaskOverdue(
  task: Pick<TaskRecord, "status" | "dueTime">,
  now: Date | string | number = new Date(),
  displayTimeZone = "Asia/Shanghai",
): boolean {
  if (task.status === "completed") return false;
  const dueTime = parseTaskTime(task.dueTime);
  if (dueTime === null) return false;
  return localDateTimeKey(new Date(dueTime), displayTimeZone) < localDateTimeKey(new Date(parseNowTime(now)), displayTimeZone);
}

function completedRecencyTime(task: TaskRecencyFields): number {
  return (
    parseTaskTime(task.completedAt) ??
    parseTaskTime(task.updatedAt) ??
    parseTaskTime(task.dueTime) ??
    parseTaskTime(task.plannedDate) ??
    parseTaskTime(task.createdAt) ??
    0
  );
}

export function taskTimelineSortKey(task: TaskTimelineFields, nowTime: number, displayTimeZone: string): number[] {
  const isCompleted = task.status === "completed";
  const dueTime = parseTaskTime(task.dueTime);
  const plannedTime = parsePlannedDateStart(task.plannedDate, displayTimeZone);
  const updatedTime = parseTaskTime(task.updatedAt);
  const completedTime = parseTaskTime(task.completedAt);
  const completedRecency = completedTime ?? updatedTime ?? dueTime ?? plannedTime;
  const overdue = dueTime !== null && localDateTimeKey(new Date(dueTime), displayTimeZone) < localDateTimeKey(new Date(nowTime), displayTimeZone);
  const scheduleRank = isCompleted ? 4 : overdue ? 0 : dueTime !== null ? 1 : plannedTime !== null ? 2 : 3;
  const scheduleTime = isCompleted
    ? completedRecency !== null ? -completedRecency : Number.MAX_SAFE_INTEGER
    : dueTime ?? plannedTime ?? Number.MAX_SAFE_INTEGER;

  return [
    isCompleted ? 1 : 0,
    scheduleRank,
    scheduleTime,
    task.sortOrder ?? 0,
    -(task.priority ?? 0),
    updatedTime !== null ? -updatedTime : Number.MAX_SAFE_INTEGER,
  ];
}

function compareTimelineKey(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index] - right[index];
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseTaskTime(value: string | null | undefined): number | null {
  if (!value) return null;
  return parseTaskBridgeDate(value)?.getTime() ?? null;
}

function parseNowTime(value: Date | string | number | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function parsePlannedDateStart(value: string | null | undefined, displayTimeZone: string): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return parseTaskTime(value);
  const [, year, month, day] = match;
  const utcTime = Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
  return utcTime - timeZoneOffsetMs(new Date(utcTime), displayTimeZone);
}

function localDateTimeKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  } catch {
    return date.toISOString();
  }
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return localAsUtc - date.getTime();
  } catch {
    return 0;
  }
}
