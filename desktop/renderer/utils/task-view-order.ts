import type { TaskRecord } from "../../common/task";
import { getDateTimeFormatter, normalizeTimeZone, parseTaskBridgeDate } from "../../common/quick-add-parser";

type ScheduledTask = Pick<TaskRecord, "dueTime" | "plannedDate" | "createdAt">;

/** Compare deadlines and planned days on one timeline; undated tasks follow dated tasks. */
export function sortTasksBySchedule<T extends ScheduledTask>(tasks: readonly T[], timeZone = "Asia/Shanghai"): T[] {
  const zone = normalizeTimeZone(timeZone);
  return tasks.map((task, index) => ({
    task, index,
    time: parseTaskBridgeDate(task.dueTime)?.getTime() ?? plannedDateTime(task.plannedDate, zone) ?? Number.POSITIVE_INFINITY,
    created: parseTaskBridgeDate(task.createdAt)?.getTime() ?? 0,
  })).sort((left, right) => {
    if (left.time !== right.time) return left.time < right.time ? -1 : 1;
    return left.created - right.created || left.index - right.index;
  }).map(entry => entry.task);
}

/** Input has already been sorted by schedule, so every category preserves that order. */
export function groupTasksByCategory<T extends Pick<TaskRecord, "tag">>(tasks: readonly T[], locale = "zh-CN"): Array<{ category: string; tasks: T[] }> {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const category = task.tag ?? "";
    const group = groups.get(category) ?? [];
    group.push(task);
    groups.set(category, group);
  }
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...groups].sort(([left], [right]) => {
    if (!left) return right ? 1 : 0;
    if (!right) return -1;
    return collator.compare(left, right);
  }).map(([category, group]) => ({ category, tasks: group }));
}

function plannedDateTime(value: string | null, timeZone: string): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const anchor = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== value) return null;
  const formatter = getDateTimeFormatter("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let time = anchor.getTime();
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(part => [part.type, part.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = anchor.getTime() - local;
    time += correction;
    if (!correction) break;
  }
  return time;
}
