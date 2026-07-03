import type { AppLanguage } from "../src/i18n";

type TaskAction = "create" | "update" | "delete" | "complete" | "restore" | string;

export interface TaskPriorityOption {
  value: number;
  label: string;
}

export function shouldConfirmTaskAction(action: TaskAction): boolean {
  return action === "delete";
}

export function getTaskActionConfirmationMessage(
  action: TaskAction,
  taskTitle: string,
  language: AppLanguage = "zh-CN",
): string | null {
  if (!shouldConfirmTaskAction(action)) return null;
  const title = taskTitle.trim() || (language === "zh-CN" ? "该任务" : "this task");
  return language === "zh-CN"
    ? `确认删除「${title}」？删除后可以在回收站恢复。`
    : `Delete "${title}"? You can restore it from the recycle bin.`;
}

export function getTaskPriorityLabel(priority: number, language: AppLanguage = "zh-CN"): string {
  const labels = priorityLabelsFor(language);
  const normalizedPriority = Math.trunc(Number.isFinite(priority) ? priority : 0);
  return labels[Math.min(Math.max(normalizedPriority, 0), labels.length - 1)];
}

export function getTaskPriorityOptions(language: AppLanguage = "zh-CN"): TaskPriorityOption[] {
  return priorityLabelsFor(language).map((label, value) => ({ value, label }));
}

export function getTaskRepeatRuleLabel(repeatRule: string | null | undefined, language: AppLanguage = "zh-CN"): string {
  const raw = repeatRule?.trim() ?? "";
  const normalized = raw.toLowerCase();
  if (!normalized) return "";
  const labels = language === "en-US"
    ? { daily: "Daily", weekly: "Weekly", monthly: "Monthly" }
    : { daily: "每天", weekly: "每周", monthly: "每月" };
  return labels[normalized as keyof typeof labels] ?? raw;
}

export function getTaskListTypeLabel(listType: string | null | undefined, language: AppLanguage = "zh-CN"): string {
  const raw = listType?.trim() ?? "";
  const normalized = raw.toLowerCase();
  if (!normalized) return "";
  const labels = language === "en-US"
    ? { inbox: "Inbox", today: "Today" }
    : { inbox: "收件箱", today: "今日" };
  return labels[normalized as keyof typeof labels] ?? raw;
}

function priorityLabelsFor(language: AppLanguage): string[] {
  return language === "en-US"
    ? ["None", "Low", "Medium", "High", "Urgent", "Highest"]
    : ["无优先级", "低", "中", "高", "紧急", "最高"];
}
