export interface TaskChangeCursor {
  epoch: string;
  revision: number;
}

export interface TaskSnapshotPage<T> {
  tasks: T[];
  nextLocalId: string | null;
  cursor: TaskChangeCursor;
}

export interface TaskChangesPage<T> {
  tasks: T[];
  removedIds: string[];
  cursor: TaskChangeCursor;
  hasMore: boolean;
  resetRequired: boolean;
}

export interface TaskIndexUpdate<T> {
  tasks: T[];
  removedIds: string[];
  cursor: TaskChangeCursor;
  reset: boolean;
}

export interface TaskSyncCounts {
  failed: number;
  conflicts: number;
}

export interface SyncHealthSummary {
  pendingCount: number;
  conflictCount: number;
  oldestPendingAt: string | null;
}
