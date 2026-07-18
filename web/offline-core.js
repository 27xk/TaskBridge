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

export function normalizeOfflineApiBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error("Offline API address is required");
  }
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Offline API address must use HTTP or HTTPS");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api/v1") ? path : `${path}/api/v1`;
  return url.toString().replace(/\/+$/, "");
}

export function buildOfflineWorkspaceKey(apiBaseUrl, userIdInput) {
  const userId = Number(userIdInput);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("Offline workspace requires a positive user id");
  }
  const serverNamespace = encodeURIComponent(normalizeOfflineApiBaseUrl(apiBaseUrl));
  return `server.${serverNamespace}.user.${Math.trunc(userId)}`;
}

export function buildOfflineDatabaseName(storagePrefix, apiBaseUrl, userId) {
  return `${storagePrefix}.offline.${buildOfflineWorkspaceKey(apiBaseUrl, userId)}`;
}

export function buildTaskDraftStorageKey(storagePrefix, apiBaseUrl, userIdInput) {
  const userId = Number(userIdInput);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("Task draft storage requires a positive user id");
  }
  const origin = new URL(normalizeOfflineApiBaseUrl(apiBaseUrl)).origin;
  return `${storagePrefix}.taskDraft.origin.${encodeURIComponent(origin)}.user.${Math.trunc(userId)}`;
}

export function clearAccountScopedInputs(inputs) {
  for (const input of inputs || []) {
    if (input && "value" in input) input.value = "";
  }
}

export function withClientRequestId(payload, idFactory = () => crypto.randomUUID()) {
  const existing = String(payload?.client_request_id || "").trim();
  if (existing) return { ...payload, client_request_id: existing };
  const generated = String(idFactory()).trim();
  if (!generated) throw new Error("Client request id is required");
  return { ...payload, client_request_id: generated };
}

export async function processIndependentMutationQueue({
  listRecords,
  processRecord,
  markFailed,
}) {
  const processedQueueIds = new Set();
  const blockedTaskIds = new Set();
  const failedQueueIds = [];

  const initialRecords = [...await listRecords()].sort(
    (left, right) => Number(left.offline_queue_id) - Number(right.offline_queue_id),
  );
  for (const record of initialRecords) {
    if (!isPersistedMutationFailure(record)) continue;
    processedQueueIds.add(String(record.offline_queue_id));
    blockedTaskIds.add(mutationTaskKey(record));
  }

  while (true) {
    const records = [...await listRecords()].sort(
      (left, right) => Number(left.offline_queue_id) - Number(right.offline_queue_id),
    );
    const record = records.find((candidate) => {
      const queueId = String(candidate.offline_queue_id);
      return !processedQueueIds.has(queueId) && !blockedTaskIds.has(mutationTaskKey(candidate));
    });
    if (!record) break;

    const queueId = String(record.offline_queue_id);
    const taskKey = mutationTaskKey(record);
    processedQueueIds.add(queueId);
    try {
      await processRecord(record);
    } catch (error) {
      await markFailed(record, error);
      blockedTaskIds.add(taskKey);
      failedQueueIds.push(queueId);
    }
  }

  return {
    blockedTaskIds: [...blockedTaskIds],
    failedQueueIds,
  };
}

function isPersistedMutationFailure(record) {
  return record?.offline_status === "sync_failed" || record?.offline_status === "conflict";
}

function mutationTaskKey(record) {
  const taskId = record?.task_id;
  return taskId === null || taskId === undefined
    ? `queue:${record?.offline_queue_id}`
    : String(taskId);
}

export function normalizeOfflineProfile(value, fallbackApiBaseUrl = "") {
  if (!value || typeof value !== "object") return null;
  const id = Number(value.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const username = String(value.username ?? "").trim();
  const email = String(value.email ?? "").trim();
  let apiBaseUrl;
  try {
    apiBaseUrl = normalizeOfflineApiBaseUrl(
      value.api_base_url ?? value.apiBaseUrl ?? fallbackApiBaseUrl,
    );
  } catch {
    return null;
  }
  return {
    id: Math.trunc(id),
    username,
    email,
    api_base_url: apiBaseUrl,
  };
}

export function isOfflineProfileForApi(profile, apiBaseUrl) {
  const normalizedProfile = normalizeOfflineProfile(profile);
  if (!normalizedProfile) return false;
  try {
    return normalizedProfile.api_base_url === normalizeOfflineApiBaseUrl(apiBaseUrl);
  } catch {
    return false;
  }
}

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

export function hasOfflineQueueId(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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
    return Boolean(task.offline_status || hasOfflineQueueId(task.offline_queue_id));
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
    return !isCompletedTask(task) && Number(task.priority || 0) >= 3;
  }
  return !isCompletedTask(task);
}

export function mapTaskViewForServer(view) {
  if (view === "pending" || view === "conflict") return null;
  return view === "high" ? "high_priority" : view;
}

export function reconcileCachedTaskSnapshot(cachedTasks, remoteTasks, viewContext = {}) {
  const remoteById = new Map(
    remoteTasks.map((task) => [String(task.id), task]),
  );
  const reconciled = [];

  for (const cachedTask of cachedTasks) {
    const taskId = String(cachedTask.id);
    const remoteTask = remoteById.get(taskId);
    if (cachedTask.offline_status || hasOfflineQueueId(cachedTask.offline_queue_id)) {
      reconciled.push(cachedTask);
      remoteById.delete(taskId);
      continue;
    }
    if (remoteTask) {
      reconciled.push(normalizeRemoteTaskForOffline(remoteTask));
      remoteById.delete(taskId);
      continue;
    }
    if (!matchesTaskView(cachedTask, viewContext)) {
      reconciled.push(cachedTask);
    }
  }

  for (const remoteTask of remoteById.values()) {
    reconciled.push(normalizeRemoteTaskForOffline(remoteTask));
  }
  return reconciled;
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
    if (task.offline_status || hasOfflineQueueId(task.offline_queue_id)) {
      counts.pending += 1;
    }
    if (task.offline_status === "conflict") {
      counts.conflict += 1;
    }
    if (isCompletedTask(task)) {
      counts.completed += 1;
      continue;
    }
    if (Number(task.priority || 0) >= 3) {
      counts.high += 1;
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
  if (task.offline_status || hasOfflineQueueId(task.offline_queue_id)) return "待同步";
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
  if (isCompletedTask(task)) return false;
  const now = normalizeNow(nowInput);
  if ((task.list_type || "inbox") === "today") {
    return true;
  }
  const today = formatLocalDateKey(now, options);
  const dueTime = task.due_at ?? task.due_time;
  const reminderTime = task.reminder_at ?? task.remind_time;
  const due = parseDate(dueTime);
  const dueDate = due ? formatLocalDateKey(due, options) : "";
  const reminderDate = reminderTime ? formatLocalDateKey(reminderTime, options) : "";
  return (
    task.planned_date === today ||
    dueDate === today ||
    reminderDate === today ||
    Boolean(due && due.getTime() < now.getTime())
  );
}

function isOverdueTask(task, nowInput = new Date(), options = {}) {
  if (isCompletedTask(task)) return false;
  const now = normalizeNow(nowInput);
  const dueTime = task.due_at ?? task.due_time;
  if (dueTime) {
    const due = new Date(dueTime);
    return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
  }
  if (task.planned_date) {
    return task.planned_date < formatLocalDateKey(now, options);
  }
  return false;
}

function isSnoozedTask(task, nowInput = new Date()) {
  if (isCompletedTask(task) || !task.snoozed_until) return false;
  const now = normalizeNow(nowInput);
  const snoozedUntil = new Date(task.snoozed_until);
  return !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil.getTime() > now.getTime();
}

function isCompletedTask(task) {
  return task?.status === "completed" || task?.status === "done";
}

export function createLatestRequestGate() {
  let sequence = 0;
  return {
    begin() {
      sequence += 1;
      return sequence;
    },
    isCurrent(requestSequence) {
      return requestSequence === sequence;
    },
  };
}

export function isMixedContentApiUrl(pageProtocol, apiBaseUrl) {
  if (pageProtocol !== "https:") return false;
  try {
    return new URL(apiBaseUrl).protocol === "http:";
  } catch {
    return false;
  }
}

export function isAuthHealthUsable(syncStatus) {
  return syncStatus?.status === "ready" || syncStatus?.status === "degraded";
}

export function shouldShowConnectionBadge(hasLocalWorkspace, syncStatus) {
  return Boolean(hasLocalWorkspace || syncStatus);
}

export function resetEndpointScopedConnectionState(
  state,
  nextServerBaseUrl,
  nextApiBaseUrl,
) {
  const endpointChanged =
    String(nextServerBaseUrl ?? "") !== String(state.serverBaseUrl ?? "") ||
    String(nextApiBaseUrl ?? "") !== String(state.apiBaseUrl ?? "");
  if (!endpointChanged) return false;

  state.registrationStatusKnown = false;
  state.registrationEnabled = false;
  state.syncStatus = null;
  return true;
}

export function isTerminalRefreshStatus(status) {
  return status === 401 || status === 403;
}

export function getTaskReminderAt(task) {
  if (!task || task.is_deleted || isCompletedTask(task)) return null;
  for (const value of [task.reminder_at, task.remind_time, task.due_at, task.due_time]) {
    if (value && parseDate(value)) return value;
  }
  return null;
}

export function buildTaskNotificationUrl(taskId, pageUrl) {
  const target = new URL("./", pageUrl);
  target.searchParams.set("task", String(taskId));
  return target.toString();
}

export function normalizeBrowserTimeZone(value) {
  const timeZone = String(value || "").trim();
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function buildPasswordChangePayload(currentPassword, newPassword, confirmation) {
  if (!currentPassword) throw new Error("Current password is required");
  if (String(newPassword || "").length < 8) {
    throw new Error("New password must be at least 8 characters");
  }
  if (newPassword !== confirmation) throw new Error("Password confirmation does not match");
  return {
    current_password: currentPassword,
    new_password: newPassword,
  };
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
