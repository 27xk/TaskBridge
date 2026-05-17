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

export function fetchTasks(): Promise<ServerTaskDto[]> {
  return unwrap(request.get("/tasks"));
}

export function fetchTask(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.get(`/tasks/${taskId}`));
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

export function deleteTask(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.delete(`/tasks/${taskId}`));
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

export function completeTask(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/${taskId}/complete`));
}

export function restoreTask(taskId: number): Promise<ServerTaskDto> {
  return unwrap(request.post(`/tasks/${taskId}/restore`));
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
