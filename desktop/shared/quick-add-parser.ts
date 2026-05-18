export interface ParsedQuickTask {
  title: string;
  priority: number;
  tag: string | null;
  dueTime: string | null;
  plannedDate: string | null;
}

export const TASKBRIDGE_TIME_ZONE = "Asia/Shanghai";
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const priorityPattern = /\bP([0-5])\b/i;
const tagPattern = /#([\p{L}\p{N}_-]{1,32})/u;
const timePattern = /(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?::(\d{2}))?\s*(点|:)?/u;

export function parseQuickTask(input: string, now = new Date()): ParsedQuickTask {
  const raw = input.trim();
  let working = raw;

  const priorityMatch = working.match(priorityPattern);
  const priority = priorityMatch ? Number(priorityMatch[1]) : 0;
  working = working.replace(priorityPattern, "").trim();

  const tagMatch = working.match(tagPattern);
  const tag = tagMatch?.[1]?.toLowerCase() ?? null;
  working = working.replace(tagPattern, "").trim();

  const date = parseDateWord(working, now);
  working = working
    .replace("后天", "")
    .replace("明天", "")
    .replace("今天", "")
    .replace("今晚", "")
    .trim();

  const timeMatch = working.match(timePattern);
  const time = timeMatch ? parseTime(timeMatch) : null;
  if (timeMatch?.[0]) {
    working = working.replace(timeMatch[0], "").trim();
  }

  const plannedDate = date ? formatLocalDateParts(date) : null;
  const dueTime = date || time
    ? buildIsoDateTime(date ?? getShanghaiDateParts(now), time ?? { hour: 18, minute: 0 })
    : null;

  return {
    title: working || raw,
    priority,
    tag,
    dueTime,
    plannedDate,
  };
}

export function todayLocalDate(now = new Date()): string {
  return formatLocalDateParts(getShanghaiDateParts(now));
}

export function shanghaiDayBounds(day = todayLocalDate()): { startTime: string; endTime: string } {
  const date = parseLocalDateParts(day) ?? getShanghaiDateParts(new Date());
  return {
    startTime: buildIsoDateTime(date, { hour: 0, minute: 0 }),
    endTime: buildIsoDateTime(addDays(date, 1), { hour: 0, minute: 0 }),
  };
}

export function isoToShanghaiDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const timestamp = parseTaskBridgeDate(value)?.getTime() ?? Number.NaN;
  if (!Number.isFinite(timestamp)) return "";
  const shifted = new Date(timestamp + SHANGHAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function shanghaiDateTimeInputToIso(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - SHANGHAI_OFFSET_MS).toISOString();
}

export function formatShanghaiDateTime(value: string | null, locale = "zh-CN"): string {
  if (!value) return "";
  const date = parseTaskBridgeDate(value);
  if (!date) return "";
  return date.toLocaleString(locale, {
    timeZone: TASKBRIDGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShanghaiTime(value: string | null, locale = "zh-CN"): string {
  if (!value) return "";
  const date = parseTaskBridgeDate(value);
  if (!date) return "";
  return date.toLocaleTimeString(locale, {
    timeZone: TASKBRIDGE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShanghaiDate(value: Date, locale = "zh-CN"): string {
  return value.toLocaleDateString(locale, {
    timeZone: TASKBRIDGE_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function parseTaskBridgeDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = hasExplicitTimezone(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

type ShanghaiDateParts = {
  year: number;
  month: number;
  day: number;
};

function parseDateWord(value: string, now: Date): ShanghaiDateParts | null {
  const date = getShanghaiDateParts(now);
  if (value.includes("后天")) {
    return addDays(date, 2);
  }
  if (value.includes("明天")) {
    return addDays(date, 1);
  }
  if (value.includes("今天") || value.includes("今晚")) {
    return date;
  }
  return null;
}

function parseTime(match: RegExpMatchArray): { hour: number; minute: number } | null {
  const period = match[1] ?? "";
  const hourRaw = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;
  if (!Number.isFinite(hourRaw) || !Number.isFinite(minute)) return null;

  let hour = hourRaw;
  if ((period === "下午" || period === "晚上" || period === "中午") && hour < 12) {
    hour += 12;
  }

  return {
    hour: Math.max(0, Math.min(23, hour)),
    minute: Math.max(0, Math.min(59, minute)),
  };
}

function buildIsoDateTime(date: ShanghaiDateParts, time: { hour: number; minute: number }): string {
  return new Date(
    Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0) - SHANGHAI_OFFSET_MS,
  ).toISOString();
}

function getShanghaiDateParts(date: Date): ShanghaiDateParts {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function parseLocalDateParts(value: string): ShanghaiDateParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function addDays(date: ShanghaiDateParts, days: number): ShanghaiDateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatLocalDateParts(date: ShanghaiDateParts): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}
