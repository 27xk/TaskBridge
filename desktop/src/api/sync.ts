import type { ServerTaskDto } from "./task";
import { request, unwrap } from "./request";

export interface SyncPullResponse {
  changed_tasks: ServerTaskDto[];
  deleted_tasks: ServerTaskDto[];
  server_time: string;
  has_more: boolean;
  next_cursor_updated_at: string | null;
  next_cursor_id: number | null;
}

export interface SyncPullOptions {
  limit?: number;
  cursorUpdatedAt?: string | null;
  cursorId?: number | null;
}

export interface SyncPushChange {
  local_id: string;
  server_id: number | null;
  action: "create" | "update" | "delete" | "complete" | "restore";
  title: string | null;
  content: string | null;
  status: string | null;
  priority: number | null;
  tag: string | null;
  project: string | null;
  list_type: string | null;
  due_time: string | null;
  remind_time: string | null;
  repeat_rule: string | null;
  planned_date: string | null;
  completed_at: string | null;
  snoozed_until: string | null;
  parent_task_id: number | null;
  checklist: Array<{ id: string; title: string; done: boolean }> | null;
  is_template: boolean | null;
  template_name: string | null;
  sort_order: number | null;
  version: number;
  local_updated_at: string;
}

export interface SyncPushResult {
  local_id: string;
  server_id: number | null;
  action: SyncPushChange["action"];
  status: "applied" | "conflict" | "failed";
  version: number | null;
  message: string | null;
  task: ServerTaskDto | null;
  server_task: ServerTaskDto | null;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
  server_time: string;
}

export function pullSync(lastSyncTime: string, options: SyncPullOptions = {}): Promise<SyncPullResponse> {
  return unwrap(
    request.get("/sync/pull", {
      params: {
        last_sync_time: lastSyncTime,
        limit: options.limit,
        cursor_updated_at: options.cursorUpdatedAt ?? undefined,
        cursor_id: options.cursorId ?? undefined,
      },
    }),
  );
}

export function pushSync(deviceId: string, changes: SyncPushChange[]): Promise<SyncPushResponse> {
  return unwrap(
    request.post("/sync/push", {
      device_id: deviceId,
      changes,
    }),
  );
}
