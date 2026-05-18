export interface ParsedQuickTask {
  title: string;
  priority: number;
  tag: string | null;
  dueTime: string | null;
  plannedDate: string | null;
}

export const DEFAULT_TIME_ZONE = "Asia/Shanghai";
export const TASKBRIDGE_TIME_ZONE = DEFAULT_TIME_ZONE;

const priorityPattern = /\bP([0-5])\b/i;
const tagPattern = /#([\p{L}\p{N}_-]{1,32})/u;
const timePattern = /(?:(上午|下午|晚上|中午|am|pm)\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:点)?/iu;

export function parseQuickTask(input: string, now = new Date(), timeZone = DEFAULT_TIME_ZONE): ParsedQuickTask {
  const zone = normalizeTimeZone(timeZone);
  const raw = input.trim();
  let working = raw;

  const priorityMatch = working.match(priorityPattern);
  const priority = priorityMatch ? Number(priorityMatch[1]) : 0;
  working = working.replace(priorityPattern, "").trim();

  const tagMatch = working.match(tagPattern);
  const tag = tagMatch?.[1]?.toLowerCase() ?? null;
  working = working.replace(tagPattern, "").trim();

  const date = parseDateWord(working, now, zone);
  working = working.replace(/后天|明天|今天|今晚/g, "").trim();

  const timeMatch = working.match(timePattern);
  const time = timeMatch ? parseTime(timeMatch) : null;
  if (timeMatch?.[0]) {
    working = working.replace(timeMatch[0], "").trim();
  }

  const plannedDate = date ? formatLocalDateParts(date) : null;
  const dueTime =
    date || time
      ? buildIsoDateTime(date ?? getZonedDateParts(now, zone), time ?? { hour: 18, minute: 0 }, zone)
      : null;

  return {
    title: working || raw,
    priority,
    tag,
    dueTime,
    plannedDate,
  };
}

export function getSystemTimeZone(): string {
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function normalizeTimeZone(value?: string | null): string {
  const candidate = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function todayLocalDate(now = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  return formatLocalDateParts(getZonedDateParts(now, timeZone));
}

export function shanghaiDayBounds(day = todayLocalDate(), timeZone = DEFAULT_TIME_ZONE): { startTime: string; endTime: string } {
  const date = parseLocalDateParts(day) ?? getZonedDateParts(new Date(), timeZone);
  return {
    startTime: buildIsoDateTime(date, { hour: 0, minute: 0 }, timeZone),
    endTime: buildIsoDateTime(addDays(date, 1), { hour: 0, minute: 0 }, timeZone),
  };
}

export function isoToShanghaiDateTimeInput(value?: string | null, timeZone = DEFAULT_TIME_ZONE): string {
  const date = parseTaskBridgeDate(value);
  if (!date) return "";
  const parts = getZonedDateTimeParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function shanghaiDateTimeInputToIso(value?: string | null, timeZone = DEFAULT_TIME_ZONE): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const time = {
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  if (![date.year, date.month, date.day, time.hour, time.minute].every(Number.isFinite)) return null;
  return buildIsoDateTime(date, time, timeZone);
}

export function formatShanghaiDateTime(value: string | null, locale = "zh-CN", timeZone = DEFAULT_TIME_ZONE): string {
  const date = parseTaskBridgeDate(value);
  if (!date) return "";
  return date.toLocaleString(locale, {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShanghaiTime(value: string | null, locale = "zh-CN", timeZone = DEFAULT_TIME_ZONE): string {
  const date = parseTaskBridgeDate(value);
  if (!date) return "";
  return date.toLocaleTimeString(locale, {
    timeZone: normalizeTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShanghaiDate(value: Date, locale = "zh-CN", timeZone = DEFAULT_TIME_ZONE): string {
  return value.toLocaleDateString(locale, {
    timeZone: normalizeTimeZone(timeZone),
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

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
};

function parseDateWord(value: string, now: Date, timeZone: string): DateParts | null {
  const date = getZonedDateParts(now, timeZone);
  if (value.includes("后天")) return addDays(date, 2);
  if (value.includes("明天")) return addDays(date, 1);
  if (value.includes("今天") || value.includes("今晚")) return date;
  return null;
}

function parseTime(match: RegExpMatchArray): { hour: number; minute: number } | null {
  const period = (match[1] ?? "").toLowerCase();
  const hourRaw = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;
  if (!Number.isFinite(hourRaw) || !Number.isFinite(minute)) return null;

  let hour = hourRaw;
  if ((period === "下午" || period === "晚上" || period === "中午" || period === "pm") && hour < 12) {
    hour += 12;
  }
  if ((period === "上午" || period === "am") && hour === 12) {
    hour = 0;
  }

  return {
    hour: Math.max(0, Math.min(23, hour)),
    minute: Math.max(0, Math.min(59, minute)),
  };
}

function buildIsoDateTime(date: DateParts, time: { hour: number; minute: number }, timeZone = DEFAULT_TIME_ZONE): string {
  const zone = normalizeTimeZone(timeZone);
  const localAsUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  let candidate = new Date(localAsUtc - getTimeZoneOffsetMs(zone, new Date(localAsUtc)));
  candidate = new Date(localAsUtc - getTimeZoneOffsetMs(zone, candidate));
  return candidate.toISOString();
}

function getZonedDateParts(date: Date, timeZone = DEFAULT_TIME_ZONE): DateParts {
  const parts = getZonedDateTimeParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function getZonedDateTimeParts(date: Date, timeZone = DEFAULT_TIME_ZONE): DateTimeParts {
  const map = dateTimePartsMap(date, normalizeTimeZone(timeZone));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
  return asUtc - date.getTime();
}

function dateTimePartsMap(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function parseLocalDateParts(value: string): DateParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function addDays(date: DateParts, days: number): DateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatLocalDateParts(date: DateParts): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}
