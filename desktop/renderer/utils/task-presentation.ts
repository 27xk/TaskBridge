import type { AppLanguage } from "../i18n";
import {
  DEFAULT_TIME_ZONE,
  getDateTimeFormatter,
  normalizeTimeZone,
  parseTaskBridgeDate,
  todayLocalDate,
} from "../../common/quick-add-parser";

export interface TaskDateFormatOptions {
  language?: AppLanguage;
  timeZone?: string;
  now?: Date | string | number;
  includeTime?: boolean;
}

export interface TaskDatePresentation {
  label: string;
  fullLabel: string;
  dateKey: string | null;
  valid: boolean;
}

export interface TaskSchedulePresentation extends TaskDatePresentation {
  kind: "due" | "planned";
}

/** Date-only values are calendar dates; timestamp values follow the display time zone. */
export function formatTaskDate(
  value: Date | string | number | null | undefined,
  options: TaskDateFormatOptions = {},
): TaskDatePresentation {
  const language = options.language ?? "zh-CN";
  const timeZone = normalizeTimeZone(options.timeZone ?? DEFAULT_TIME_ZONE);
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === null || raw === undefined || raw === "") {
    return { label: "", fullLabel: "", dateKey: null, valid: false };
  }

  const calendarDate = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = calendarDate ? parseCalendarDate(raw as string) : parseDate(raw);
  if (!date) {
    const label = language === "en-US" ? "Invalid date" : "日期无效";
    return { label, fullLabel: `${label}: ${String(raw)}`, dateKey: null, valid: false };
  }

  const dateKey = calendarDate ? raw as string : todayLocalDate(date, timeZone);
  const now = parseDate(options.now ?? new Date()) ?? new Date();
  const todayKey = todayLocalDate(now, timeZone);
  const difference = (parseCalendarDate(dateKey)!.getTime() - parseCalendarDate(todayKey)!.getTime()) / 86_400_000;
  const relative = language === "en-US"
    ? { "-1": "Yesterday", "0": "Today", "1": "Tomorrow" }
    : { "-1": "昨天", "0": "今天", "1": "明天" };
  const calendarAnchor = parseCalendarDate(dateKey)!;
  const dateLabel = relative[String(difference) as keyof typeof relative] ?? getDateTimeFormatter(language, {
    timeZone: "UTC",
    month: language === "en-US" ? "short" : "long",
    day: "numeric",
    ...(dateKey.slice(0, 4) !== todayKey.slice(0, 4) ? { year: "numeric" as const } : {}),
  }).format(calendarAnchor);
  const clock = options.includeTime && !calendarDate
    ? getDateTimeFormatter(language, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)
    : "";
  const fullDate = getDateTimeFormatter(language, {
    timeZone: "UTC", year: "numeric", month: "long", day: "numeric",
  }).format(calendarAnchor);

  return {
    label: clock ? `${dateLabel} ${clock}` : dateLabel,
    fullLabel: clock ? `${fullDate} ${clock} (${timeZone})` : fullDate,
    dateKey,
    valid: true,
  };
}

export function getTaskSchedulePresentation(
  task: { dueTime?: string | null; plannedDate?: string | null },
  options: TaskDateFormatOptions = {},
): { primary: TaskSchedulePresentation | null; extraPlanned: TaskSchedulePresentation | null } {
  const due = task.dueTime?.trim() ? scheduleLabel(task.dueTime, "due", options) : null;
  const planned = task.plannedDate?.trim() ? scheduleLabel(task.plannedDate, "planned", options) : null;
  return {
    primary: due ?? planned,
    extraPlanned: due && planned && (!due.valid || !planned.valid || due.dateKey !== planned.dateKey) ? planned : null,
  };
}

function scheduleLabel(value: string, kind: TaskSchedulePresentation["kind"], options: TaskDateFormatOptions): TaskSchedulePresentation {
  const formatted = formatTaskDate(value, { ...options, includeTime: kind === "due" });
  const english = options.language === "en-US";
  const meaning = kind === "due" ? (english ? "Due" : "截止") : (english ? "Planned" : "计划");
  return {
    ...formatted,
    kind,
    label: kind === "due" && !english ? `${formatted.label} ${meaning}` : `${meaning} ${formatted.label}`,
    fullLabel: `${meaning}: ${formatted.fullLabel}`,
  };
}

function parseDate(value: Date | string | number): Date | null {
  const parsed = typeof value === "string" ? parseTaskBridgeDate(value) : new Date(value instanceof Date ? value.getTime() : value);
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseCalendarDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
