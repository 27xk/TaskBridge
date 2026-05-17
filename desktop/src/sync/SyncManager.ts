import { pullSync, pushSync } from "../api/sync";
import { createWebSocketTicket } from "../api/auth";
import { registerDevice } from "../api/device";
import { bridge, nowIso } from "../db/sqlite";
import { enqueueChange, incrementQueueAttempt, listSyncQueue, removeQueueItem } from "../db/sync-queue.dao";
import { listTasks, saveTask, saveTasks } from "../db/task.dao";
import { mergePulledTask, serverTaskToLocal, toPushChange } from "./task-mapper";
import { WebSocketClient, type SyncSocketMessage } from "./WebSocketClient";

type SyncStatus = "idle" | "syncing" | "offline" | "error" | "synced";

export class SyncManager {
  private running = false;
  private rerunRequested = false;
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

  async syncNow(): Promise<void> {
    if (!(await bridge().auth.hasTokens())) return;
    if (this.running) {
      this.rerunRequested = true;
      return;
    }

    if (!navigator.onLine) {
      await this.setStatus("offline", "Offline");
      return;
    }

    this.running = true;
    try {
      do {
        this.rerunRequested = false;
        await this.setStatus("syncing", "Syncing");
        await this.ensureDeviceRegistered();
        await this.pushPendingChanges();
        await this.pullRemoteChanges();
        await this.setStatus("synced", "Synced");
        await this.onTasksChanged();
      } while (this.rerunRequested && navigator.onLine && (await bridge().auth.hasTokens()));
    } catch {
      await this.setStatus("error", "Sync error");
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

  private async pushPendingChanges(): Promise<void> {
    const settings = await bridge().app.getSettings();
    const queue = await listSyncQueue();
    if (queue.length === 0) return;

    const response = await pushSync(settings.deviceId, queue.map(toPushChange));
    const queueByLocalId = new Map(queue.map((item) => [item.localId, item]));
    for (const result of response.results) {
      const queueItem = queueByLocalId.get(result.local_id);
      if (!queueItem?.id) continue;

      if (result.status === "applied" && result.task) {
        await saveTask(serverTaskToLocal(result.task, queueItem.localId, "synced"));
        await removeQueueItem(queueItem.id);
        continue;
      }

      if (result.status === "conflict" && result.server_task) {
        await saveTask(serverTaskToLocal(result.server_task, queueItem.localId, "conflict"));
        await removeQueueItem(queueItem.id);
        continue;
      }

      await incrementQueueAttempt(queueItem.id);
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    const settings = await bridge().app.getSettings();
    const response = await pullSync(settings.lastSyncTime);
    const localTasks = await listTasks();
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
    await bridge().app.setSetting("lastSyncTime", response.server_time);
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
      device_name: "Windows desktop",
      device_type: "windows",
    });
  }

  private handleOffline = (): void => {
    void this.setStatus("offline", "Offline");
  };

  private async setStatus(status: SyncStatus, message: string): Promise<void> {
    this.onStatus(status, message);
    await bridge().app.setSyncStatus(message);
  }
}
