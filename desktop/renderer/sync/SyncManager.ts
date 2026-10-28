import type { TaskRecord, SyncQueueRecord } from "../../common/task";
import { pullSync, pushSync, type SyncPushResult } from "../api/sync";
import { createWebSocketTicket } from "../api/auth";
import { registerDevice } from "../api/device";
import type { ServerTaskDto } from "../api/task";
import { bridge, nowIso } from "../db/sqlite";
import { enqueueChange, incrementQueueAttempt, listSyncQueue } from "../db/sync-queue.dao";
import { commitTaskChange, readTaskMutationState, getTasksByServerIds } from "../db/task.dao";
import { useAuthStore } from "../stores/auth";
import { mergePulledTask, serverTaskToLocal, toPushChange } from "./task-mapper";
import { WebSocketClient, type SyncSocketMessage } from "./WebSocketClient";
import {
  TASK_MUTABLE_FIELDS,
  TASK_COMMIT_RETRIES,
  notifyTaskMutationAcknowledged,
  taskFieldEquals,
  taskMatchesQueuedMutation,
} from "../../common/task-mutation-policy";

type SyncStatus = "idle" | "syncing" | "offline" | "error" | "synced";

const SYNC_PUSH_BATCH_SIZE = 100;
const MAX_SYNC_PUSH_BATCHES = 25;
const SYNC_PULL_PAGE_SIZE = 200;

export class SyncManager {
  private running = false;
  private rerunRequested = false;
  private rerunForceRequested = false;
  private syncTimer: number | null = null;
  private socket: WebSocketClient | null = null;
  private generation = 0;
  private started = false;
  private tasksChanged = false;
  private lastHealthReportAt = Number.NEGATIVE_INFINITY;
  private lastSuccessAt: number | null = null;
  private lastSuccessWorkspaceKey: string | null = null;
  private healthWorkspaceKey: string | null = null;

  constructor(
    private readonly onStatus: (status: SyncStatus, message: string) => void,
    private readonly onTasksChanged: () => Promise<void>,
  ) {}

  async start(): Promise<void> {
    this.started = true;
    this.generation += 1;
    const generation = this.generation;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    await this.connectWebSocket(generation);
    if (this.isRunActive(generation)) await this.syncNow();
  }

  stop(): void {
    this.started = false;
    this.generation += 1;
    this.running = false;
    this.rerunRequested = false;
    this.rerunForceRequested = false;
    this.tasksChanged = false;
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }

  async syncNow(forceRetry = false): Promise<void> {
    const generation = this.generation;
    if (!this.isRunActive(generation) || !(await bridge().auth.hasTokens()) || !this.isRunActive(generation)) return;
    if (this.running) {
      this.rerunRequested = true;
      this.rerunForceRequested = this.rerunForceRequested || forceRetry;
      return;
    }

    if (!navigator.onLine) {
      await this.setStatus("offline", "离线");
      return;
    }

    this.running = true;
    let forceCurrentRun = forceRetry;
    try {
      do {
        const currentForceRetry = forceCurrentRun || this.rerunForceRequested;
        forceCurrentRun = false;
        this.rerunForceRequested = false;
        this.rerunRequested = false;
        await this.setStatus("syncing", "同步中");
        if (!this.isRunActive(generation)) return;
        await this.ensureDeviceRegistered();
        if (!this.isRunActive(generation)) return;
        await this.pushPendingChanges(currentForceRetry, generation);
        if (!this.isRunActive(generation)) return;
        await this.pullRemoteChanges(generation);
        if (!this.isRunActive(generation)) return;
        await this.setStatus("synced", "已同步");
        if (!this.isRunActive(generation)) return;
        await this.refreshChangedTasks();
        this.lastSuccessAt = Date.now();
        this.lastSuccessWorkspaceKey = useAuthStore().workspaceKey;
      } while (
        this.isRunActive(generation) &&
        this.rerunRequested &&
        navigator.onLine &&
        (await bridge().auth.hasTokens())
      );
    } catch (error) {
      if (!this.isRunActive(generation)) return;
      console.error("[TaskBridge] sync failed", error);
      await this.setStatus("error", "同步异常");
      await this.refreshChangedTasks();
    } finally {
      if (this.generation === generation) {
        this.running = false;
        void this.reportSyncHealth(generation);
      }
    }
  }

  private async reportSyncHealth(generation: number): Promise<void> {
    try {
      const workspaceKey = useAuthStore().workspaceKey;
      if (!workspaceKey || !this.isRunActive(generation) || !navigator.onLine) return;
      if (this.healthWorkspaceKey !== workspaceKey) {
        this.healthWorkspaceKey = workspaceKey;
        this.lastHealthReportAt = Number.NEGATIVE_INFINITY;
      }
      const now = Date.now();
      if (now - this.lastHealthReportAt < 60_000 || !(await bridge().auth.hasTokens())) return;
      if (!this.isRunActive(generation) || useAuthStore().workspaceKey !== workspaceKey || now - this.lastHealthReportAt < 60_000) return;
      // Reserve the interval even on failure, so an unavailable monitor never becomes a retry loop.
      this.lastHealthReportAt = now;
      const [settings, summary] = await Promise.all([bridge().app.getSettings(), bridge().db.getSyncHealthSummary()]);
      if (!this.isRunActive(generation) || useAuthStore().workspaceKey !== workspaceKey || !(await bridge().auth.hasTokens())) return;
      const oldest = summary.oldestPendingAt ? Date.parse(summary.oldestPendingAt) : Number.NaN;
      await bridge().api.request({ method: "POST", url: "/observability/sync-health", expectedWorkspaceKey: workspaceKey, data: {
        source: "desktop", device_id: settings.deviceId, pending_count: summary.pendingCount, conflict_count: summary.conflictCount,
        oldest_pending_seconds: Number.isFinite(oldest) ? Math.max(0, Math.floor((now - oldest) / 1_000)) : 0,
        last_success_age_seconds: this.lastSuccessAt === null || this.lastSuccessWorkspaceKey !== workspaceKey
          ? null : Math.max(0, Math.floor((now - this.lastSuccessAt) / 1_000)),
      } });
    } catch { /* Monitoring is best effort and must never alter synchronization or user feedback. */ }
  }

  private async refreshChangedTasks(): Promise<void> {
    if (!this.tasksChanged) return;
    await this.onTasksChanged();
    this.tasksChanged = false;
  }

  async enqueueTaskChange(task: TaskRecord, action: SyncQueueRecord["action"]): Promise<void> {
    await enqueueChange({
      localId: task.localId,
      serverId: task.serverId,
      action,
      title: task.title,
      content: task.content,
      status: task.status,
      priority: task.priority,
      tag: task.tag,
      project: task.project,
      listType: task.listType,
      dueTime: task.dueTime,
      remindTime: task.remindTime,
      repeatRule: task.repeatRule,
      plannedDate: task.plannedDate,
      completedAt: task.completedAt,
      snoozedUntil: task.snoozedUntil,
      parentServerId: task.parentServerId,
      checklistJson: task.checklistJson,
      isTemplate: task.isTemplate,
      templateName: task.templateName,
      sortOrder: task.sortOrder,
      version: task.version,
      localUpdatedAt: task.updatedAt,
      createdAt: nowIso(),
      attemptCount: 0,
    });
    this.scheduleSync();
  }

  private async pushPendingChanges(forceRetry: boolean, generation: number): Promise<void> {
    const settings = await bridge().app.getSettings();
    if (!this.isRunActive(generation)) return;
    let processedBatches = 0;

    while (processedBatches < MAX_SYNC_PUSH_BATCHES) {
      const queue = await listSyncQueue(SYNC_PUSH_BATCH_SIZE, forceRetry);
      if (!this.isRunActive(generation) || queue.length === 0) return;

      const response = await pushSync(settings.deviceId, queue.map(toPushChange));
      if (!this.isRunActive(generation)) return;
      const queueByLocalId = new Map(queue.map((item) => [item.localId, item]));
      for (const result of response.results) {
        if (!this.isRunActive(generation)) return;
        const queueItem = queueByLocalId.get(result.local_id);
        if (!queueItem?.id) continue;

        if (result.status === "applied") {
          await this.markQueueItemApplied(queueItem, result, generation);
          if (!this.isRunActive(generation)) return;
          continue;
        }

        if (result.status === "conflict") {
          await this.markQueueItemConflict(queueItem, result, generation);
          if (!this.isRunActive(generation)) return;
          continue;
        }

        if (result.status === "failed") {
          await this.markQueueItemFailed(queueItem, generation);
          if (!this.isRunActive(generation)) return;
          await incrementQueueAttempt(queueItem.id);
          continue;
        }

        await incrementQueueAttempt(queueItem.id);
      }

      processedBatches += 1;
      if (queue.length < SYNC_PUSH_BATCH_SIZE) return;
    }

    this.rerunRequested = true;
  }

  private async markQueueItemApplied(queueItem: SyncQueueRecord, result: SyncPushResult, generation: number): Promise<void> {
    const workspaceKey = useAuthStore().workspaceKey;
    if (!this.isRunActive(generation) || !workspaceKey) return;
    for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
      const state = await readTaskMutationState(queueItem.localId, workspaceKey);
      const task = state.task;
      if (!this.isRunActive(generation) || !task) return;
      const remote = result.task
        ? serverTaskToLocal(result.task, queueItem.localId, "synced")
        : {
          ...task,
          serverId: result.server_id ?? task.serverId,
          version: result.version ?? task.version,
          isDeleted: queueItem.action === "delete" ? true : queueItem.action === "restore" ? false : task.isDeleted,
          status: queueItem.action === "complete" ? "completed" : task.status,
          syncStatus: "synced" as const,
          lastSyncAt: nowIso(),
        };
      if (remote.version < task.version || (task.serverId && remote.serverId !== task.serverId)) return;
      const superseded = state.queueId !== queueItem.id || !taskMatchesQueuedMutation(task, queueItem);
      let needsFollowup = superseded;
      let next: TaskRecord = remote;
      if (superseded || ["complete", "delete", "restore"].includes(queueItem.action)) {
        next = {
          ...task,
          serverId: remote.serverId,
          version: remote.version,
          lastSyncAt: remote.lastSyncAt,
          syncStatus: "synced",
          conflictServerJson: null,
          conflictLocalJson: null,
        };
        if (!superseded) {
          next.isDeleted = remote.isDeleted;
          next.updatedAt = remote.updatedAt;
          if (queueItem.action === "complete") {
            next.status = remote.status;
            next.completedAt = remote.completedAt;
          }
          needsFollowup = !next.isDeleted && TASK_MUTABLE_FIELDS.some((field) => !taskFieldEquals(field, next[field], remote[field]));
        }
      }
      if (needsFollowup) {
        next.syncStatus = next.isDeleted ? "pending_delete" : "pending_update";
        next.updatedAt = task.updatedAt;
      }
      const completed = (status: string) => ["completed", "done"].includes(status.trim().toLowerCase());
      const action = next.isDeleted ? "delete" : remote.isDeleted ? "restore"
        : completed(next.status) && !completed(remote.status) ? "complete" : "update";
      const committed = await commitTaskChange({
        expectedWorkspaceKey: workspaceKey,
        expected: task,
        expectedQueueId: state.queueId,
        task: next,
        queueAction: needsFollowup ? action : undefined,
        removeQueueId: queueItem.id,
      });
      if (!this.isRunActive(generation)) return;
      if (!committed.applied) continue;
      this.tasksChanged = true;
      if (!superseded && committed.task) notifyTaskMutationAcknowledged(queueItem, committed.task);
      if (needsFollowup) this.rerunRequested = true;
      return;
    }
    throw new Error("Task changed repeatedly while applying its synchronization acknowledgement");
  }

  private async markQueueItemConflict(queueItem: SyncQueueRecord, result: SyncPushResult, generation: number): Promise<void> {
    const workspaceKey = useAuthStore().workspaceKey;
    if (!this.isRunActive(generation) || !workspaceKey) return;
    for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
      const state = await readTaskMutationState(queueItem.localId, workspaceKey);
      const task = state.task;
      if (!this.isRunActive(generation) || !task) return;
      const next: TaskRecord = {
        ...task,
        serverId: task.serverId ?? result.server_id ?? result.server_task?.id ?? null,
        version: Math.max(task.version, result.version ?? result.server_task?.version ?? task.version),
        syncStatus: "conflict",
        lastSyncAt: nowIso(),
        conflictServerJson: result.server_task ? JSON.stringify(result.server_task) : null,
        conflictLocalJson: JSON.stringify(task),
      };
      const committed = await commitTaskChange({
        expectedWorkspaceKey: workspaceKey, expected: task, expectedQueueId: state.queueId,
        task: next, removeQueueId: queueItem.id,
      });
      if (!this.isRunActive(generation)) return;
      if (committed.applied) { this.tasksChanged = true; return; }
    }
    throw new Error("Task changed repeatedly while recording its synchronization conflict");
  }

  private async markQueueItemFailed(queueItem: SyncQueueRecord, generation: number): Promise<void> {
    const workspaceKey = useAuthStore().workspaceKey;
    if (!this.isRunActive(generation) || !workspaceKey) return;
    for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
      const state = await readTaskMutationState(queueItem.localId, workspaceKey);
      const task = state.task;
      if (!this.isRunActive(generation) || !task || state.queueId !== queueItem.id || !taskMatchesQueuedMutation(task, queueItem)) return;
      const committed = await commitTaskChange({
        expectedWorkspaceKey: workspaceKey, expected: task, expectedQueueId: state.queueId,
        task: { ...task, syncStatus: "sync_failed", lastSyncAt: nowIso(), conflictServerJson: null, conflictLocalJson: null },
      });
      if (!this.isRunActive(generation)) return;
      if (committed.applied) { this.tasksChanged = true; return; }
    }
    throw new Error("Task changed repeatedly while recording its synchronization failure");
  }

  private async pullRemoteChanges(generation: number): Promise<void> {
    const workspaceKey = useAuthStore().workspaceKey;
    if (!workspaceKey || !this.isRunActive(generation)) return;
    const settings = await bridge().app.getSettings();
    if (!this.isRunActive(generation)) return;
    let cursorUpdatedAt: string | null = null;
    let cursorId: number | null = null;

    while (true) {
      const response = await pullSync(settings.lastSyncTime, {
        limit: SYNC_PULL_PAGE_SIZE,
        cursorUpdatedAt,
        cursorId,
      });
      if (!this.isRunActive(generation)) return;
      const pulledTasks = [...response.changed_tasks, ...response.deleted_tasks];
      const localTasks = await getTasksByServerIds(pulledTasks.map((task) => task.id));
      if (!this.isRunActive(generation)) return;
      const localByServerId = new Map(
        localTasks
          .filter((task): task is TaskRecord & { serverId: number } => task.serverId !== null)
          .map((task) => [task.serverId, task]),
      );
      for (const remote of pulledTasks) {
        await this.commitPulledTask(remote, localByServerId.get(remote.id)?.localId, workspaceKey, generation);
        if (!this.isRunActive(generation)) return;
      }

      if (!response.has_more) {
        await bridge().app.setSetting("lastSyncTime", response.server_time);
        return;
      }

      if (!response.next_cursor_updated_at || response.next_cursor_id === null) {
        throw new Error("sync pull response is missing the next cursor");
      }
      cursorUpdatedAt = response.next_cursor_updated_at;
      cursorId = response.next_cursor_id;
    }
  }

  private async commitPulledTask(remote: ServerTaskDto, knownLocalId: string | undefined, workspaceKey: string, generation: number): Promise<void> {
    for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
      if (!this.isRunActive(generation)) return;
      const state = await readTaskMutationState(knownLocalId ?? `server-${remote.id}`, workspaceKey);
      if (!this.isRunActive(generation)) return;
      if (knownLocalId && !state.task) return;
      if (state.task && (state.task.serverId !== remote.id || state.task.version >= remote.version)) return;
      const next = mergePulledTask(remote, state.task ?? undefined);
      const committed = await commitTaskChange({
        expectedWorkspaceKey: workspaceKey,
        expected: state.task,
        expectedQueueId: state.queueId,
        task: next,
      });
      if (!this.isRunActive(generation)) return;
      if (committed.applied) { this.tasksChanged = true; return; }
    }
    throw new Error("Task changed repeatedly while applying a synchronization pull");
  }

  private async connectWebSocket(generation = this.generation): Promise<void> {
    if (!this.isRunActive(generation)) return;
    this.socket?.disconnect();
    this.socket = new WebSocketClient(
      async () => {
        try {
          if (!(await bridge().auth.hasTokens())) return null;
          if (!this.isRunActive(generation)) return null;
          const settings = await bridge().app.getSettings();
          await this.ensureDeviceRegistered(settings.deviceId);
          if (!this.isRunActive(generation)) return null;
          const ticket = await createWebSocketTicket(settings.deviceId);
          return {
            wsUrl: settings.wsUrl,
            ticket: ticket.ticket,
            deviceId: settings.deviceId,
          };
        } catch {
          return null;
        }
      },
      (message) => void this.handleSocketMessage(message),
      (message) => void this.setStatus("idle", message),
    );
    await this.socket.connect();
  }

  private async handleSocketMessage(message: SyncSocketMessage): Promise<void> {
    if (message.event === "task_changed") {
      this.scheduleSync();
    }
  }

  private handleOnline = (): void => {
    void this.connectWebSocket(this.generation);
    this.scheduleSync();
  };

  private scheduleSync(delay = 350): void {
    if (!this.started) return;
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
    }
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      void this.syncNow();
    }, delay);
  }

  private async ensureDeviceRegistered(deviceId?: string): Promise<void> {
    const settings = await bridge().app.getSettings();
    await registerDevice({
      device_id: deviceId ?? settings.deviceId,
      device_name: "Windows 桌面端",
      device_type: "windows",
    });
  }

  private handleOffline = (): void => {
    void this.setStatus("offline", "离线");
  };

  private async setStatus(status: SyncStatus, message: string): Promise<void> {
    this.onStatus(status, message);
    await bridge().app.setSyncStatus(message);
  }

  private isRunActive(generation: number): boolean {
    return this.started && this.generation === generation;
  }
}
