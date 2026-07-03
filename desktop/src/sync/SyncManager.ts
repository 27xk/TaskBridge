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

  constructor(
    private readonly onStatus: (status: SyncStatus, message: string) => void,
    private readonly onTasksChanged: () => Promise<void>,
  ) {}

  async start(): Promise<void> {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    await this.connectWebSocket();
    await this.syncNow();
  }

  stop(): void {
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
    if (!(await bridge().auth.hasTokens())) return;
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
        await this.ensureDeviceRegistered();
        await this.pushPendingChanges(currentForceRetry);
        await this.pullRemoteChanges();
        await this.setStatus("synced", "已同步");
        await this.onTasksChanged();
      } while (this.rerunRequested && navigator.onLine && (await bridge().auth.hasTokens()));
    } catch (error) {
      console.error("[TaskBridge] sync failed", error);
      await this.setStatus("error", "同步异常");
      await this.onTasksChanged();
    } finally {
      this.running = false;
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

  private async pushPendingChanges(forceRetry = false): Promise<void> {
    const settings = await bridge().app.getSettings();
    let processedBatches = 0;

    while (processedBatches < MAX_SYNC_PUSH_BATCHES) {
      const queue = await listSyncQueue(SYNC_PUSH_BATCH_SIZE, forceRetry);
      if (queue.length === 0) return;

      const response = await pushSync(settings.deviceId, queue.map(toPushChange));
      const queueByLocalId = new Map(queue.map((item) => [item.localId, item]));
      for (const result of response.results) {
        const queueItem = queueByLocalId.get(result.local_id);
        if (!queueItem?.id) continue;

        if (result.status === "applied") {
          await this.markQueueItemApplied(queueItem, result);
          await removeQueueItem(queueItem.id);
          continue;
        }

        if (result.status === "conflict") {
          await this.markQueueItemConflict(queueItem, result);
          await removeQueueItem(queueItem.id);
          continue;
        }

        if (result.status === "failed") {
          await this.markQueueItemFailed(queueItem);
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

  private async markQueueItemApplied(queueItem: SyncQueueRecord, result: SyncPushResult): Promise<void> {
    if (result.task) {
      await saveTask(serverTaskToLocal(result.task, queueItem.localId, "synced"));
      return;
    }

    const task = await getTask(queueItem.localId);
    if (!task) return;
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

  private async markQueueItemConflict(queueItem: SyncQueueRecord, result: SyncPushResult): Promise<void> {
    const task = await getTask(queueItem.localId);
    if (!task) {
      if (result.server_task) {
        await saveTask({
          ...serverTaskToLocal(result.server_task, queueItem.localId, "conflict"),
          conflictServerJson: JSON.stringify(result.server_task),
          conflictLocalJson: null,
        });
        return;
      }
      await this.markQueueItemFailed(queueItem);
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

  private async markQueueItemFailed(queueItem: SyncQueueRecord): Promise<void> {
    const task = await getTask(queueItem.localId);
    if (!task) return;
    await saveTask({
      ...task,
      syncStatus: "sync_failed",
      lastSyncAt: nowIso(),
      conflictServerJson: null,
      conflictLocalJson: null,
    });
  }

  private async pullRemoteChanges(): Promise<void> {
    const settings = await bridge().app.getSettings();
    let cursorUpdatedAt: string | null = null;
    let cursorId: number | null = null;

    while (true) {
      const response = await pullSync(settings.lastSyncTime, {
        limit: SYNC_PULL_PAGE_SIZE,
        cursorUpdatedAt,
        cursorId,
      });
      const pulledTasks = [...response.changed_tasks, ...response.deleted_tasks];
      const localTasks = await getTasksByServerIds(pulledTasks.map((task) => task.id));
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

  private async connectWebSocket(): Promise<void> {
    this.socket?.disconnect();
    this.socket = new WebSocketClient(
      async () => {
        try {
          if (!(await bridge().auth.hasTokens())) return null;
          const settings = await bridge().app.getSettings();
          await this.ensureDeviceRegistered(settings.deviceId);
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
    void this.connectWebSocket();
    this.scheduleSync();
  };

  private scheduleSync(delay = 350): void {
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
}
