import { pullSync, pushSync, type SyncPushResult } from "../api/sync";
import { createWebSocketTicket } from "../api/auth";
import { registerDevice } from "../api/device";
import { bridge, nowIso } from "../db/sqlite";
import { enqueueChange, incrementQueueAttempt, listSyncQueue, removeQueueItem } from "../db/sync-queue.dao";
import { getTask, getTasksByServerIds, saveTask, saveTasks } from "../db/task.dao";
import { mergePulledTask, serverTaskToLocal, toPushChange } from "./task-mapper";
import { WebSocketClient, type SyncSocketMessage } from "./WebSocketClient";

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
        await this.onTasksChanged();
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
      await this.onTasksChanged();
    } finally {
      if (this.generation === generation) this.running = false;
    }
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
          await removeQueueItem(queueItem.id);
          continue;
        }

        if (result.status === "conflict") {
          await this.markQueueItemConflict(queueItem, result, generation);
          if (!this.isRunActive(generation)) return;
          await removeQueueItem(queueItem.id);
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
    if (!this.isRunActive(generation)) return;
    if (result.task) {
      await saveTask(serverTaskToLocal(result.task, queueItem.localId, "synced"));
      return;
    }

    const task = await getTask(queueItem.localId);
    if (!this.isRunActive(generation) || !task) return;
    await saveTask({
      ...task,
      serverId: result.server_id ?? task.serverId,
      version: result.version ?? task.version,
      syncStatus: "synced",
      lastSyncAt: nowIso(),
      conflictServerJson: null,
      conflictLocalJson: null,
    });
  }

  private async markQueueItemConflict(queueItem: SyncQueueRecord, result: SyncPushResult, generation: number): Promise<void> {
    if (!this.isRunActive(generation)) return;
    const task = await getTask(queueItem.localId);
    if (!this.isRunActive(generation)) return;
    if (!task) {
      if (result.server_task) {
        await saveTask({
          ...serverTaskToLocal(result.server_task, queueItem.localId, "conflict"),
          conflictServerJson: JSON.stringify(result.server_task),
          conflictLocalJson: null,
        });
        return;
      }
      await this.markQueueItemFailed(queueItem, generation);
      return;
    }

    await saveTask({
      ...task,
      serverId: result.server_id ?? task.serverId ?? result.server_task?.id ?? null,
      version: result.version ?? result.server_task?.version ?? task.version,
      syncStatus: "conflict",
      lastSyncAt: nowIso(),
      conflictServerJson: result.server_task ? JSON.stringify(result.server_task) : null,
      conflictLocalJson: JSON.stringify(task),
    });
  }

  private async markQueueItemFailed(queueItem: SyncQueueRecord, generation: number): Promise<void> {
    if (!this.isRunActive(generation)) return;
    const task = await getTask(queueItem.localId);
    if (!this.isRunActive(generation) || !task) return;
    await saveTask({
      ...task,
      syncStatus: "sync_failed",
      lastSyncAt: nowIso(),
      conflictServerJson: null,
      conflictLocalJson: null,
    });
  }

  private async pullRemoteChanges(generation: number): Promise<void> {
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
      const changed = response.changed_tasks.map((task) => {
        return mergePulledTask(task, localByServerId.get(task.id));
      });
      const deleted = response.deleted_tasks.map((task) => {
        return mergePulledTask(task, localByServerId.get(task.id));
      });

      await saveTasks([...changed, ...deleted]);
      if (!this.isRunActive(generation)) return;

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
