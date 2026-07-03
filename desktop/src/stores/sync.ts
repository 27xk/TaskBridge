import { defineStore } from "pinia";
import { ref } from "vue";

import { bridge } from "../db/sqlite";
import { getSyncQueueCounts, listSyncQueue } from "../db/sync-queue.dao";
import { listTasks } from "../db/task.dao";
import { SyncManager } from "../sync/SyncManager";

export interface SyncDiagnostics {
  pendingQueueCount: number;
  exhaustedQueueCount: number;
  failedCount: number;
  recoverableSyncIssueCount: number;
  conflictCount: number;
  lastSyncTime: string;
  updatedAt: string;
  exhaustedQueueItems: SyncQueueIssue[];
}

export interface SyncQueueIssue {
  id: number;
  localId: string;
  title: string;
  action: SyncQueueRecord["action"];
  attemptCount: number;
  createdAt: string;
}

export const useSyncStore = defineStore("sync", () => {
  const status = ref<"idle" | "syncing" | "offline" | "error" | "synced">("idle");
  const message = ref("已同步");
  const manager = ref<SyncManager | null>(null);
  const diagnostics = ref<SyncDiagnostics>({
    pendingQueueCount: 0,
    exhaustedQueueCount: 0,
    failedCount: 0,
    recoverableSyncIssueCount: 0,
    conflictCount: 0,
    lastSyncTime: "",
    updatedAt: "",
    exhaustedQueueItems: [],
  });

  function init(onTasksChanged: () => Promise<void>): void {
    if (manager.value) return;
    manager.value = new SyncManager(
      (nextStatus, nextMessage) => {
        status.value = nextStatus;
        message.value = nextMessage;
      },
      onTasksChanged,
    );
  }

  async function start(onTasksChanged: () => Promise<void>): Promise<void> {
    init(onTasksChanged);
    await manager.value?.start();
    await refreshDiagnostics();
  }

  function stop(): void {
    manager.value?.stop();
    manager.value = null;
  }

  async function syncNow(forceRetry = false): Promise<void> {
    await manager.value?.syncNow(forceRetry);
    await refreshDiagnostics();
  }

  async function refreshDiagnostics(): Promise<void> {
    const [queue, queueCounts, tasks, settings]: [
      SyncQueueRecord[],
      SyncQueueCounts,
      TaskRecord[],
      TaskBridgeSettings,
    ] = await Promise.all([
      listSyncQueue(500, true),
      getSyncQueueCounts(),
      listTasks(500, 0, true),
      bridge().app.getSettings(),
    ]);
    const failedCount = tasks.filter((task) => task.syncStatus === "sync_failed").length;
    diagnostics.value = {
      pendingQueueCount: queueCounts.pending,
      exhaustedQueueCount: queueCounts.exhausted,
      failedCount,
      recoverableSyncIssueCount: queueCounts.pending + queueCounts.exhausted + failedCount,
      conflictCount: tasks.filter((task) => task.syncStatus === "conflict").length,
      lastSyncTime: settings.lastSyncTime,
      updatedAt: new Date().toISOString(),
      exhaustedQueueItems: queue
        .filter((item) => (item.attemptCount ?? 0) >= 8)
        .slice(0, 20)
        .map(toSyncQueueIssue),
    };
  }

  async function retryExhaustedQueue(): Promise<void> {
    await syncNow(true);
    await refreshDiagnostics();
  }

  return {
    status,
    message,
    diagnostics,
    init,
    start,
    stop,
    syncNow,
    retryExhaustedQueue,
    refreshDiagnostics,
  };
});

function toSyncQueueIssue(item: SyncQueueRecord): SyncQueueIssue {
  return {
    id: item.id ?? 0,
    localId: item.localId,
    title: item.title?.trim() || item.localId,
    action: item.action,
    attemptCount: item.attemptCount ?? 0,
    createdAt: item.createdAt,
  };
}
