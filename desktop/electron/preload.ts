import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type Listener<Args extends unknown[] = []> = (...args: Args) => void;

function on<Args extends unknown[]>(channel: string, callback: Listener<Args>): () => void {
  const listener = (_event: IpcRendererEvent, ...args: Args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("taskBridge", {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  app: {
    getSettings: () => ipcRenderer.invoke("app:get-settings"),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke("app:set-setting", key, value),
    setSyncStatus: (status: string) => ipcRenderer.invoke("app:set-sync-status", status),
    notify: (title: string, body: string) => ipcRenderer.invoke("app:notify", title, body),
    toggleFloating: () => ipcRenderer.invoke("app:toggle-floating"),
    showFloating: () => ipcRenderer.invoke("app:show-floating"),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke("app:set-auto-start", enabled),
  },
  auth: {
    hasTokens: () => ipcRenderer.invoke("auth:has-tokens"),
    setTokens: (tokens: unknown) => ipcRenderer.invoke("auth:set-tokens", tokens),
    clearTokens: () => ipcRenderer.invoke("auth:clear-tokens"),
  },
  api: {
    request: (payload: unknown) => ipcRenderer.invoke("api:request", payload),
  },
  db: {
    listTasks: (limit?: number, offset?: number, includeDeleted?: boolean) => {
      return ipcRenderer.invoke("db:tasks:list", limit, offset, includeDeleted);
    },
    listTodayTasks: (limit?: number) => ipcRenderer.invoke("db:tasks:today", limit),
    listFloatingTodayTasks: (limit?: number) => ipcRenderer.invoke("db:tasks:floating-today", limit),
    getTask: (localId: string) => ipcRenderer.invoke("db:tasks:get", localId),
    getTasksByServerIds: (serverIds: number[]) => ipcRenderer.invoke("db:tasks:get-by-server-ids", serverIds),
    upsertTask: (task: unknown) => ipcRenderer.invoke("db:tasks:upsert", task),
    deleteLocalTask: (localId: string) => ipcRenderer.invoke("db:tasks:delete-local", localId),
    completeLocalTask: (localId: string) => ipcRenderer.invoke("db:tasks:complete-local", localId),
    listQueue: (limit?: number, includeExhausted?: boolean) => ipcRenderer.invoke("db:queue:list", limit, includeExhausted),
    enqueueChange: (change: unknown) => ipcRenderer.invoke("db:queue:enqueue", change),
    removeQueueItem: (id: number) => ipcRenderer.invoke("db:queue:remove", id),
    removeQueueByLocalId: (localId: string) => ipcRenderer.invoke("db:queue:remove-by-local", localId),
    incrementAttempt: (id: number) => ipcRenderer.invoke("db:queue:increment-attempt", id),
  },
  window: {
    openMain: () => ipcRenderer.invoke("window:open-main"),
    quickAdd: () => ipcRenderer.invoke("window:quick-add"),
    onQuickAdd: (callback: Listener) => on("taskbridge:quick-add", callback),
    onShowSettings: (callback: Listener) => on("taskbridge:show-settings", callback),
    onTasksChanged: (callback: Listener) => on("taskbridge:tasks-changed", callback),
    onSyncStatusChanged: (callback: Listener) => on("taskbridge:sync-status-changed", callback),
    onOpenTaskDetail: (callback: Listener<[string]>) => on("taskbridge:open-task-detail", callback),
    onSyncNow: (callback: Listener) => on("taskbridge:sync-now", callback),
  },
  floating: {
    show: () => ipcRenderer.invoke("floating:show"),
    hide: () => ipcRenderer.invoke("floating:hide"),
    toggle: () => ipcRenderer.invoke("floating:toggle"),
    setOpacity: (opacity: number) => ipcRenderer.invoke("floating:set-opacity", opacity),
    onOpacityChanged: (callback: Listener<[number]>) => on("taskbridge:floating-opacity-changed", callback),
    getPosition: () => ipcRenderer.invoke("floating:get-position"),
    savePosition: (x?: number, y?: number) => ipcRenderer.invoke("floating:save-position", x, y),
  },
  task: {
    listToday: (limit?: number) => ipcRenderer.invoke("task:list-today", limit),
    quickAdd: (title: string) => ipcRenderer.invoke("task:quick-add", title),
    complete: (localId: string) => ipcRenderer.invoke("task:complete", localId),
    openDetail: (localId: string) => ipcRenderer.invoke("task:open-detail", localId),
    exportJson: () => ipcRenderer.invoke("task:export-json"),
    importJson: () => ipcRenderer.invoke("task:import-json"),
  },
  sync: {
    getStatus: () => ipcRenderer.invoke("sync:get-status"),
  },
});
