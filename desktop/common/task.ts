export type SyncStatus = "synced" | "pending_create" | "pending_update" | "pending_delete" | "sync_failed" | "conflict";
export type SyncAction = "create" | "update" | "delete" | "complete" | "restore";

export interface TaskRecord {
  localId: string;
  serverId: number | null;
  title: string;
  content: string | null;
  status: string;
  priority: number;
  tag: string | null;
  project: string | null;
  listType: string;
  dueTime: string | null;
  remindTime: string | null;
  repeatRule: string | null;
  plannedDate: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  parentServerId: number | null;
  checklistJson: string;
  isTemplate: boolean;
  templateName: string | null;
  sortOrder: number;
  version: number;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  conflictServerJson: string | null;
  conflictLocalJson: string | null;
}

export interface SyncQueueRecord {
  id?: number;
  localId: string;
  serverId: number | null;
  action: SyncAction;
  title: string | null;
  content: string | null;
  status: string | null;
  priority: number | null;
  tag: string | null;
  project: string | null;
  listType: string | null;
  dueTime: string | null;
  remindTime: string | null;
  repeatRule: string | null;
  plannedDate: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  parentServerId: number | null;
  checklistJson: string | null;
  isTemplate: boolean | null;
  templateName: string | null;
  sortOrder: number | null;
  version: number;
  localUpdatedAt: string;
  createdAt: string;
  attemptCount?: number;
}

export interface SyncQueueCounts {
  total: number;
  pending: number;
  exhausted: number;
}

export interface FloatingTaskSummary {
  tasks: TaskListSummary[];
  totalOpen: number;
}

/** A read-only list projection. Missing detail fields must never be written back. */
export interface TaskListSummary extends Omit<TaskRecord, "content" | "checklistJson" | "conflictServerJson" | "conflictLocalJson"> {
  contentPreview: string | null;
  checklistTotal: number;
  checklistDone: number;
  hasServerConflict: boolean;
  changeRevision: number | null;
}

export type TaskListItem = TaskListSummary | TaskRecord;
