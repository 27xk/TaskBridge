import type { SyncPushChange } from "../api/sync";
import type { ServerTaskDto } from "../api/task";
import { nowIso } from "../db/sqlite";

export function toPushChange(change: SyncQueueRecord): SyncPushChange {
  return {
    local_id: change.localId,
    server_id: change.serverId,
    action: change.action,
    title: change.title,
    content: change.content,
    status: change.status,
    priority: change.priority,
    tag: change.tag,
    project: change.project,
    list_type: change.listType,
    due_time: change.dueTime,
    remind_time: change.remindTime,
    repeat_rule: change.repeatRule,
    planned_date: change.plannedDate,
    completed_at: change.completedAt,
    snoozed_until: change.snoozedUntil,
    parent_task_id: change.parentServerId,
    checklist: parseChecklist(change.checklistJson),
    is_template: change.isTemplate,
    template_name: change.templateName,
    sort_order: change.sortOrder,
    version: change.version,
    local_updated_at: change.localUpdatedAt,
  };
}

export function serverTaskToLocal(
  task: ServerTaskDto,
  localId = `server-${task.id}`,
  syncStatus: TaskRecord["syncStatus"] = "synced",
): TaskRecord {
  return {
    localId,
    serverId: task.id,
    title: task.title,
    content: task.content,
    status: task.status,
    priority: task.priority,
    tag: task.tag,
    project: task.project ?? null,
    listType: task.list_type ?? "inbox",
    dueTime: task.due_time,
    remindTime: task.remind_time,
    repeatRule: task.repeat_rule,
    plannedDate: task.planned_date ?? null,
    completedAt: task.completed_at ?? null,
    snoozedUntil: task.snoozed_until ?? null,
    parentServerId: task.parent_task_id ?? null,
    checklistJson: JSON.stringify(task.checklist ?? []),
    isTemplate: task.is_template ?? false,
    templateName: task.template_name ?? null,
    sortOrder: task.sort_order ?? 0,
    version: task.version,
    isDeleted: task.is_deleted,
    syncStatus,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    lastSyncAt: nowIso(),
  };
}

export function mergePulledTask(task: ServerTaskDto, existing?: TaskRecord): TaskRecord {
  if (existing && isLocalPending(existing)) {
    return {
      ...existing,
      syncStatus: "conflict",
      lastSyncAt: nowIso(),
    };
  }
  return serverTaskToLocal(task, existing?.localId);
}

function isLocalPending(task: TaskRecord): boolean {
  return task.syncStatus.startsWith("pending_") || task.syncStatus === "conflict";
}

function parseChecklist(value: string | null): Array<{ id: string; title: string; done: boolean }> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item): item is { id: string; title: string; done: boolean } => {
        return (
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.done === "boolean"
        );
      })
      .slice(0, 100);
  } catch {
    return null;
  }
}
