const OFFLINE_LOCAL_ID_FLOOR = -9000000000;
const DEFAULT_DISPLAY_TIME_ZONE = "Asia/Shanghai";
const TASK_VIEW_LABELS = {
  "": "全部",
  today: "今日",
  inbox: "收件箱",
  overdue: "逾期",
  high: "高优先级",
  pending: "待同步",
  conflict: "冲突",
  completed: "已完成",
  trash: "回收站",
};

const TASK_PRIORITY_LABELS = {
  1: "低优先级",
  2: "中优先级",
  3: "高优先级",
  4: "紧急",
  5: "最高优先级",
};

export function makeOfflineTask(payload, options = {}) {
  const nowDate = normalizeNow(options.now);
  const now = nowDate.toISOString();
  const status = normalizeInitialTaskStatus(payload.status);
  return {
    id: makeOfflineTaskId(options),
    title: payload.title,
    content: payload.content ?? null,
    project: payload.project ?? null,
    tag: payload.tag ?? null,
    priority: Number(payload.priority || 0),
    list_type: payload.list_type || "inbox",
    planned_date: payload.planned_date ?? null,
    due_time: payload.due_time ?? null,
    remind_time: payload.remind_time ?? null,
    repeat_rule: payload.repeat_rule ?? null,
    snoozed_until: payload.snoozed_until ?? null,
    parent_task_id: payload.parent_task_id ?? null,
    checklist: normalizeChecklist(payload.checklist),
    is_template: Boolean(payload.is_template),
    template_name: payload.template_name ?? null,
    sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0,
    status,
    is_deleted: Boolean(payload.is_deleted ?? payload.isDeleted),
    version: 0,
    created_at: payload.created_at ?? payload.createdAt ?? now,
    updated_at: payload.updated_at ?? payload.updatedAt ?? now,
    completed_at: payload.completed_at ?? payload.completedAt ?? null,
    offline_status: "pending:create",
    offline_queue_id: null,
    offline_error: null,
  };
}

function normalizeInitialTaskStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return status === "completed" || status === "done" ? "completed" : "open";
}

export function makeTaskPayloadFromTemplate(template) {
  const templateId = Number(template?.id);
  return {
    title: String(template?.title ?? "").trim() || "未命名任务",
    content: template?.content ?? null,
    project: template?.project ?? null,
    tag: template?.tag ?? null,
    priority: Number(template?.priority || 0),
    list_type: "inbox",
    planned_date: template?.planned_date ?? null,
    due_time: template?.due_time ?? null,
    remind_time: template?.remind_time ?? null,
    repeat_rule: template?.repeat_rule ?? null,
    snoozed_until: null,
    parent_task_id: Number.isFinite(templateId) && templateId > 0 ? templateId : null,
    checklist: resetChecklist(template?.checklist),
    is_template: false,
    template_name: null,
    sort_order: Number.isFinite(Number(template?.sort_order)) ? Number(template.sort_order) : 0,
  };
}

export function makeTaskFromTemplate(template, options = {}) {
  return makeOfflineTask(makeTaskPayloadFromTemplate(template), options);
}

export function applyOfflineTaskAction(task, action, offlineQueueId, nowInput = new Date()) {
  const now = normalizeNow(nowInput).toISOString();
  const next = {
    ...task,
    updated_at: now,
    version: Number(task.version || 0) + 1,
    offline_status: `pending:${action}`,
    offline_queue_id: offlineQueueId,
    offline_error: null,
  };
  if (action === "complete") {
    next.status = "completed";
    next.completed_at = task.completed_at || now;
  } else if (action === "undo-complete") {
    next.status = "open";
    next.completed_at = null;
  } else if (action === "delete") {
    next.is_deleted = true;
  } else if (action === "restore") {
    next.is_deleted = false;
  } else {
    throw new Error("Unsupported action");
  }
  return next;
}

export function normalizeRemoteTaskForOffline(task) {
  return {
    ...task,
    offline_status: null,
    offline_queue_id: null,
    offline_error: null,
    conflictLocalJson: null,
    conflictServerJson: null,
    conflict_local_json: null,
    conflict_server_json: null,
    offline_conflict_local_json: null,
    offline_conflict_server_json: null,
  };
}

export function canResolveTaskConflict(task) {
  const id = Number(task?.id);
  return task?.offline_status === "conflict" && Number.isFinite(id) && id > 0;
}

export function buildConflictOverwritePayload(task) {
  return {
    title: task?.title ?? "",
    content: task?.content ?? null,
    status: task?.status ?? "open",
    priority: Number(task?.priority || 0),
    tag: task?.tag ?? null,
    project: task?.project ?? null,
    list_type: task?.list_type ?? "inbox",
    due_time: task?.due_time ?? null,
    remind_time: task?.remind_time ?? null,
    repeat_rule: task?.repeat_rule ?? null,
    planned_date: task?.planned_date ?? null,
    completed_at: task?.completed_at ?? null,
    snoozed_until: task?.snoozed_until ?? null,
    parent_task_id: task?.parent_task_id ?? null,
    checklist: normalizeChecklist(task?.checklist),
    is_template: Boolean(task?.is_template),
    template_name: task?.template_name ?? null,
    sort_order: Number.isFinite(Number(task?.sort_order)) ? Number(task.sort_order) : 0,
  };
}

export function matchesTaskView(task, options = {}) {
  const view = options.view ?? "";
  if (!matchesTaskSearch(task, options.search ?? "")) {
    return false;
  }
  if (view === "trash") {
    return Boolean(task.is_deleted);
  }
  if (task.is_deleted) {
    return false;
  }
  if (view === "pending") {
    return Boolean(task.offline_status || Number.isFinite(task.offline_queue_id));
  }
  if (view === "conflict") {
    return task.offline_status === "conflict";
  }
  if (view === "completed") {
    return task.status === "completed";
  }
  if (view === "today") {
    return isTodayTask(task, options.now, options);
  }
  if (view === "inbox") {
    return (task.list_type || "inbox") === "inbox" && task.status !== "completed";
  }
  if (view === "overdue") {
    return isOverdueTask(task, options.now, options);
  }
  if (view === "high") {
    return Number(task.priority || 0) >= 3;
  }
  return task.status !== "completed";
}

export function compareCachedTasks(left, right, options = {}) {
  const leftPending = left.offline_status ? 1 : 0;
  const rightPending = right.offline_status ? 1 : 0;
  if (leftPending !== rightPending) {
    return rightPending - leftPending;
  }
  const leftBucket = getTaskSortBucket(left, options.now, options);
  const rightBucket = getTaskSortBucket(right, options.now, options);
  if (leftBucket !== rightBucket) {
    return rightBucket - leftBucket;
  }
  return getTaskSortTime(right) - getTaskSortTime(left);
}

export function buildLocalMeta(tasks, nowInput = new Date(), options = {}) {
  const counts = {
    open: 0,
    today: 0,
    inbox: 0,
    overdue: 0,
    high: 0,
    pending: 0,
    conflict: 0,
    completed: 0,
    trash: 0,
  };
  for (const task of tasks) {
    if (task.is_deleted) {
      counts.trash += 1;
      continue;
    }
    if (task.offline_status || Number.isFinite(task.offline_queue_id)) {
      counts.pending += 1;
    }
    if (task.offline_status === "conflict") {
      counts.conflict += 1;
    }
    if (Number(task.priority || 0) >= 3) {
      counts.high += 1;
    }
    if (task.status === "completed") {
      counts.completed += 1;
      continue;
    }
    counts.open += 1;
    if ((task.list_type || "inbox") === "inbox") {
      counts.inbox += 1;
    }
    if (isTodayTask(task, nowInput, options)) {
      counts.today += 1;
    }
    if (isOverdueTask(task, nowInput, options)) {
      counts.overdue += 1;
    }
  }
  return { counts };
}

export function getTaskViewLabel(view) {
  return TASK_VIEW_LABELS[view ?? ""] || TASK_VIEW_LABELS[""];
}

export function getTaskStatusLabel(task) {
  if (task.offline_status === "conflict") return "同步冲突";
  if (task.offline_error) return "同步失败";
  if (task.offline_status || Number.isFinite(task.offline_queue_id)) return "待同步";
  if (task.is_deleted) return "已删除";
  if (task.status === "completed" || task.status === "done") return "已完成";
  return "进行中";
}

export function getTaskPriorityLabel(priority) {
  const normalized = Math.trunc(Number(priority || 0));
  return TASK_PRIORITY_LABELS[normalized] || "";
}

export function buildTaskMetaLabels(task) {
  const labels = [];
  if (task.project) labels.push(`项目 ${task.project}`);
  if (task.tag) labels.push(`#${task.tag}`);
  if (task.list_type) labels.push(getTaskViewLabel(task.list_type));
  const priorityLabel = getTaskPriorityLabel(task.priority);
  if (priorityLabel) labels.push(priorityLabel);
  if (task.planned_date) labels.push(`计划 ${task.planned_date}`);
  if (task.due_time) labels.push(`截止 ${formatTaskDateTime(task.due_time)}`);
  if (task.remind_time) labels.push(`提醒 ${formatTaskDateTime(task.remind_time)}`);
  if (task.snoozed_until) labels.push(`稍后 ${formatTaskDateTime(task.snoozed_until)}`);
  if (task.completed_at) labels.push(`完成 ${formatTaskDateTime(task.completed_at)}`);
  const checklistCount = normalizeChecklist(task.checklist).length;
  if (checklistCount > 0) labels.push(`清单 ${checklistCount} 项`);
  const statusLabel = getTaskStatusLabel(task);
  if (statusLabel !== "进行中" && statusLabel !== "已完成" && statusLabel !== "已删除") {
    labels.push(statusLabel);
  }
  return labels;
}

export function shouldConfirmTaskAction(action) {
  return action === "delete";
}

function makeOfflineTaskId(options = {}) {
  const nowMs = typeof options.nowMs === "function" ? options.nowMs() : Date.now();
  const random = typeof options.random === "function" ? options.random() : Math.random();
  return OFFLINE_LOCAL_ID_FLOOR - nowMs - Math.floor(random * 1000000);
}

function matchesTaskSearch(task, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;
  return [task.title, task.content, task.project, task.tag]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function getTaskSortTime(task) {
  const value = task.updated_at || task.created_at || task.due_time || task.planned_date;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function getTaskSortBucket(task, nowInput = new Date(), options = {}) {
  if (task.is_deleted) return 0;
  if (task.status === "completed") return 1;
  if (isSnoozedTask(task, nowInput)) return 2;
  if (isOverdueTask(task, nowInput, options)) return 4;
  return 3;
}

function isTodayTask(task, nowInput = new Date(), options = {}) {
  if ((task.list_type || "inbox") === "today") {
    return true;
  }
  const today = formatLocalDateKey(normalizeNow(nowInput), options);
  const dueDate = task.due_time ? formatLocalDateKey(task.due_time, options) : "";
  return task.planned_date === today || dueDate === today;
}

function isOverdueTask(task, nowInput = new Date(), options = {}) {
  if (task.status === "completed") return false;
  const now = normalizeNow(nowInput);
  if (task.due_time) {
    const due = new Date(task.due_time);
    return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
  }
  if (task.planned_date) {
    return task.planned_date < formatLocalDateKey(now, options);
  }
  return false;
}

function isSnoozedTask(task, nowInput = new Date()) {
  if (task.status === "completed" || !task.snoozed_until) return false;
  const now = normalizeNow(nowInput);
  const snoozedUntil = new Date(task.snoozed_until);
  return !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil.getTime() > now.getTime();
}

function formatTaskDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (part) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("/") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatLocalDateKey(value, options = {}) {
  const date = parseDate(value) || new Date();
  const timeZone = normalizeTimeZone(options.timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (valueByType.year && valueByType.month && valueByType.day) {
      return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
    }
  } catch {
    // Fall back to UTC when a stored user time zone is no longer supported by the browser.
  }
  return date.toISOString().slice(0, 10);
}

function normalizeNow(value) {
  return parseDate(value) || new Date();
}

function parseDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeTimeZone(value) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_DISPLAY_TIME_ZONE;
}

function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: String(item?.id ?? "").trim(),
      title: String(item?.title ?? "").trim(),
      done: Boolean(item?.done),
    }))
    .filter((item) => item.id && item.title);
}

function resetChecklist(value) {
  return normalizeChecklist(value).map((item) => ({ ...item, done: false }));
}
