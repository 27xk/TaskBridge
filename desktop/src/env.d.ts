/// <reference types="vite/client" />

export {};

declare global {
  interface TaskBridgeTokens {
    accessToken: string;
    refreshToken: string;
    userId?: number;
  }

  interface TaskBridgeSettings {
    baseUrl: string;
    wsUrl: string;
    language: "zh-CN" | "en-US";
    displayTimeZone: string;
    deviceId: string;
    lastSyncTime: string;
    autoStart: boolean;
    floatingOpacity: number;
    floatingVisibleOnStart: boolean;
    floatingMiniMode: boolean;
    floatingX: number | null;
    floatingY: number | null;
    floatingWidth: number;
    floatingHeight: number;
  }

  interface TaskRecord {
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
    syncStatus: "synced" | "pending_create" | "pending_update" | "pending_delete" | "conflict";
    createdAt: string;
    updatedAt: string;
    lastSyncAt: string | null;
  }

  interface SyncQueueRecord {
    id?: number;
    localId: string;
    serverId: number | null;
    action: "create" | "update" | "delete" | "complete" | "restore";
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

  interface Window {
    taskBridge?: {
      platform: string;
      versions: {
        chrome: string;
        electron: string;
        node: string;
      };
      app: {
        getSettings: () => Promise<TaskBridgeSettings>;
        setSetting: (key: keyof TaskBridgeSettings, value: TaskBridgeSettings[keyof TaskBridgeSettings]) => Promise<TaskBridgeSettings>;
        setSyncStatus: (status: string) => Promise<void>;
        notify: (title: string, body: string) => Promise<void>;
        toggleFloating: () => Promise<boolean>;
        showFloating: () => Promise<boolean>;
        setAutoStart: (enabled: boolean) => Promise<TaskBridgeSettings>;
      };
      auth: {
        hasTokens: () => Promise<boolean>;
        setTokens: (tokens: TaskBridgeTokens) => Promise<void>;
        clearTokens: () => Promise<void>;
      };
      api: {
        request: <T = unknown>(payload: {
          method: "GET" | "POST" | "PUT" | "DELETE";
          url: string;
          data?: unknown;
          params?: Record<string, unknown>;
        }) => Promise<{
          code: number;
          message: string;
          data: T;
        }>;
      };
      db: {
        listTasks: (limit?: number, offset?: number, includeDeleted?: boolean) => Promise<TaskRecord[]>;
        listTodayTasks: (limit?: number) => Promise<TaskRecord[]>;
        listFloatingTodayTasks: (limit?: number) => Promise<TaskRecord[]>;
        getTask: (localId: string) => Promise<TaskRecord | null>;
        getTasksByServerIds: (serverIds: number[]) => Promise<TaskRecord[]>;
        upsertTask: (task: TaskRecord) => Promise<TaskRecord>;
        deleteLocalTask: (localId: string) => Promise<void>;
        completeLocalTask: (localId: string) => Promise<TaskRecord | null>;
        listQueue: (limit?: number, includeExhausted?: boolean) => Promise<SyncQueueRecord[]>;
        enqueueChange: (change: SyncQueueRecord) => Promise<number>;
        removeQueueItem: (id: number) => Promise<void>;
        removeQueueByLocalId: (localId: string) => Promise<void>;
        incrementAttempt: (id: number) => Promise<void>;
      };
      window: {
        openMain: () => Promise<void>;
        quickAdd: () => Promise<void>;
        onQuickAdd: (callback: () => void) => () => void;
        onShowSettings: (callback: () => void) => () => void;
        onTasksChanged: (callback: () => void) => () => void;
        onSyncStatusChanged: (callback: () => void) => () => void;
        onOpenTaskDetail: (callback: (localId: string) => void) => () => void;
        onSyncNow: (callback: () => void) => () => void;
      };
      floating: {
        show: () => Promise<boolean>;
        hide: () => Promise<boolean>;
        toggle: () => Promise<boolean>;
        setOpacity: (opacity: number) => Promise<number>;
        onOpacityChanged: (callback: (opacity: number) => void) => () => void;
        getPosition: () => Promise<{ x: number | null; y: number | null }>;
        savePosition: (x?: number, y?: number) => Promise<{ x: number | null; y: number | null }>;
        getSize: () => Promise<{ width: number; height: number }>;
        setSize: (width: number, height: number) => Promise<{ width: number; height: number }>;
      };
      task: {
        listToday: (limit?: number) => Promise<TaskRecord[]>;
        quickAdd: (title: string) => Promise<TaskRecord | null>;
        complete: (localId: string) => Promise<TaskRecord | null>;
        openDetail: (localId: string) => Promise<void>;
        exportJson: () => Promise<{ canceled: boolean; filePath?: string }>;
        importJson: () => Promise<{ canceled: boolean; importedCount?: number }>;
      };
      sync: {
        getStatus: () => Promise<string>;
      };
    };
  }
}
