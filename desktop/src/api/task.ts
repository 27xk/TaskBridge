import { request, unwrap } from "./request";

export interface ServerTaskDto {
  id: number;
  user_id: number;
  title: string;
  content: string | null;
  status: string;
  priority: number;
  tag: string | null;
  project?: string | null;
  list_type?: string | null;
  due_time: string | null;
  remind_time: string | null;
  repeat_rule: string | null;
  planned_date?: string | null;
  completed_at?: string | null;
  snoozed_until?: string | null;
  parent_task_id?: number | null;
  checklist?: Array<{ id: string; title: string; done: boolean }>;
  is_template?: boolean;
  template_name?: string | null;
  sort_order?: number;
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskCreatePayload {
  title: string;
  content?: string | null;
  priority?: number;
  tag?: string | null;
  project?: string | null;
  list_type?: string | null;
  due_time?: string | null;
  remind_time?: string | null;
  repeat_rule?: string | null;
  planned_date?: string | null;
  completed_at?: string | null;
  snoozed_until?: string | null;
  parent_task_id?: number | null;
  checklist?: Array<{ id: string; title: string; done: boolean }>;
  is_template?: boolean;
  template_name?: string | null;
  sort_order?: number;
}

export interface TaskUpdatePayload extends Partial<TaskCreatePayload> {
  status?: string;
  expected_version?: number;
}

export interface TaskListQuery {
  q?: string;
  view?: string;
  now?: string;
  status?: string;
  tag?: string;
  project?: string;
  listType?: string;
  plannedDate?: string;
  includeDeleted?: boolean;
  templatesOnly?: boolean;
  cursorId?: number;
  cursorUpdatedAt?: string;
  offset?: number;
  limit?: number;
  timezone?: string;
}

export interface TaskMetaDto {
  projects: string[];
  tags: string[];
  counts: {
    open: number;
    completed: number;
    inbox: number;
    today: number;
    overdue: number;
    templates: number;
    trash: number;
  };
}

export interface ChecklistItemPayload {
  id: string;
  title: string;
  done: boolean;
}

export interface ChecklistItemUpdatePayload {
  title?: string | null;
  done?: boolean | null;
}

export interface TaskHistoryDto {
  id: number;
  task_id: number | null;
  operation: string;
  result: string;
  version: number;
  device_id: string | null;
  local_id: string | null;
  server_id: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface TemplateInstantiatePayload {
  title?: string | null;
  content?: string | null;
  project?: string | null;
  tag?: string | null;
  list_type?: string | null;
  due_time?: string | null;
  remind_time?: string | null;
  planned_date?: string | null;
}

export function fetchTasks(query: TaskListQuery = {}): Promise<ServerTaskDto[]> {
  const params = taskListQueryParams(query);
  return unwrap(request.get("/tasks", { params }));
}

export function fetchTask(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.get(`/tasks/${taskId}`));
}

export function fetchTaskMeta(timezone: string, now?: string): Promise<TaskMetaDto> {
  const params = new URLSearchParams();
  params.set("timezone", timezone.trim());
  appendStringParam(params, "now", now);
  return unwrap(request.get("/tasks/meta", { params: toRequestParams(params) }));
}

export function fetchTaskHistory(taskId: number): Promise<TaskHistoryDto[]> {
  return unwrap(request.get(`/tasks/${taskId}/history`));
}

export function createTask(payload: TaskCreatePayload): Promise<ServerTaskDto> {
  return unwrap(request.post("/tasks", payload));
}

export function updateTask(taskId: number, payload: TaskUpdatePayload): Promise<ServerTaskDto> {
  return unwrap(request.put(`/tasks/${taskId}`, payload));
}

export function deleteTask(taskId: number, expectedVersion?: number): Promise<ServerTaskDto> {
  return unwrap(request.delete(`/tasks/${taskId}`, { params: expectedVersionParams(expectedVersion) }));
}

export function purgeTask(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.delete(`/tasks/${taskId}/purge`));
}

export function addChecklistItem(taskId: number, payload: ChecklistItemPayload): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/${taskId}/checklist`, payload));
}

export function updateChecklistItem(
  taskId: number,
  itemId: string,
  payload: ChecklistItemUpdatePayload,
): Promise<ServerTaskDto> {
  return unwrap(request.put(`/tasks/${taskId}/checklist/${itemId}`, payload));
}

export function deleteChecklistItem(taskId: number, itemId: string): Promise<ServerTaskDto> {
  return unwrap(request.delete(`/tasks/${taskId}/checklist/${itemId}`));
}

export function completeTask(taskId: number, expectedVersion?: number): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/${taskId}/complete`, undefined, { params: expectedVersionParams(expectedVersion) }));
}

export function restoreTask(taskId: number, expectedVersion?: number): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/${taskId}/restore`, undefined, { params: expectedVersionParams(expectedVersion) }));
}

export function createNextOccurrence(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/${taskId}/next-occurrence`));
}

export function instantiateTemplate(
  templateId: number,
  payload: TemplateInstantiatePayload,
): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/templates/${templateId}/instantiate`, payload));
}

function expectedVersionParams(expectedVersion?: number): Record<string, unknown> {
  return Number.isFinite(expectedVersion) ? { expected_version: expectedVersion } : {};
}

function taskListQueryParams(query: TaskListQuery): Record<string, unknown> {
  const params = new URLSearchParams();
  appendStringParam(params, "q", query.q);
  appendStringParam(params, "view", query.view);
  appendStringParam(params, "now", query.now);
  appendStringParam(params, "status", query.status);
  appendStringParam(params, "tag", query.tag);
  appendStringParam(params, "project", query.project);
  appendStringParam(params, "list_type", query.listType);
  appendStringParam(params, "planned_date", query.plannedDate);
  appendBooleanParam(params, "include_deleted", query.includeDeleted);
  appendBooleanParam(params, "templates_only", query.templatesOnly);
  appendNumberParam(params, "cursor_id", query.cursorId);
  appendStringParam(params, "cursor_updated_at", query.cursorUpdatedAt);
  appendNumberParam(params, "offset", query.offset);
  appendNumberParam(params, "limit", query.limit);
  if (query.timezone?.trim()) params.set("timezone", query.timezone.trim());
  return toRequestParams(params);
}

function toRequestParams(params: URLSearchParams): Record<string, unknown> {
  return Object.fromEntries(params.entries());
}

function appendStringParam(params: URLSearchParams, key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
}

function appendBooleanParam(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value !== undefined) params.set(key, String(value));
}

function appendNumberParam(params: URLSearchParams, key: string, value: number | undefined): void {
  if (Number.isFinite(value)) params.set(key, String(value));
}
