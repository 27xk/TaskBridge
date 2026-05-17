export interface ParsedQuickTask {
  title: string;
  priority: number;
  tag: string | null;
  dueTime: string | null;
  plannedDate: string | null;
}

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

  const plannedDate = date ? formatLocalDate(date) : null;
  const dueTime = date || time
    ? buildIsoDateTime(date ?? now, time ?? { hour: 18, minute: 0 })
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
  return formatLocalDate(now);
}

function parseDateWord(value: string, now: Date): Date | null {
  const date = new Date(now);
  if (value.includes("后天")) {
    date.setDate(date.getDate() + 2);
    return date;
  }
  if (value.includes("明天")) {
    date.setDate(date.getDate() + 1);
    return date;
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

function buildIsoDateTime(date: Date, time: { hour: number; minute: number }): string {
  const next = new Date(date);
  next.setHours(time.hour, time.minute, 0, 0);
  return next.toISOString();
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
