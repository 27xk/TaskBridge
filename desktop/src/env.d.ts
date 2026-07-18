/// <reference types="vite/client" />

import type { DesktopThemeId } from "../shared/desktop-theme";

export {};

declare global {
  interface TaskBridgeSettings {
    baseUrl: string;
    wsUrl: string;
    currentUserId: number | null;
    language: "zh-CN" | "en-US";
    desktopTheme: DesktopThemeId;
    displayTimeZone: string;
    deviceId: string;
    lastSyncTime: string;
    autoStart: boolean;
    floatingOpacity: number;
    floatingVisibleOnStart: boolean;
    floatingX: number | null;
    floatingY: number | null;
    floatingWidth: number;
    floatingHeight: number;
  }

  type TaskBridgeMutableSettingKey =
    | "language"
    | "desktopTheme"
    | "displayTimeZone"
    | "lastSyncTime"
    | "autoStart"
    | "floatingOpacity"
    | "floatingVisibleOnStart";

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
    syncStatus: "synced" | "pending_create" | "pending_update" | "pending_delete" | "sync_failed" | "conflict";
    createdAt: string;
    updatedAt: string;
    lastSyncAt: string | null;
    conflictServerJson: string | null;
    conflictLocalJson: string | null;
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

  interface SyncQueueCounts {
    total: number;
    pending: number;
    exhausted: number;
  }

  interface FloatingTaskSummary {
    tasks: TaskRecord[];
    totalOpen: number;
  }

  interface BackupImportError {
    code: "file_too_large" | "invalid_json" | "unsupported_format" | "missing_tasks" | "too_many_tasks";
    message: string;
  }

  interface BackupImportResult {
    canceled: boolean;
    importedCount?: number;
    scannedCount?: number;
    skippedCount?: number;
    importedLocalIds?: string[];
    error?: BackupImportError;
  }

  interface BackupImportUndoResult {
    undoneCount: number;
    skippedChangedCount: number;
  }

  interface BackupImportPreview {
    canceled: boolean;
    filePath?: string;
    importableCount?: number;
    scannedCount?: number;
    skippedCount?: number;
    error?: BackupImportError;
  }

  type UpdateState =
    | "disabled"
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";

  interface UpdateStatus {
    state: UpdateState;
    message: string;
    version?: string;
    percent?: number;
    error?: string;
    checkedAt: string;
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
        setSetting: <Key extends TaskBridgeMutableSettingKey>(key: Key, value: TaskBridgeSettings[Key]) => Promise<TaskBridgeSettings>;
        setConnection: (baseUrl: string, wsUrl: string) => Promise<TaskBridgeSettings>;
        setSyncStatus: (status: string) => Promise<void>;
        notify: (title: string, body: string, localId?: string) => Promise<void>;
        toggleFloating: () => Promise<boolean>;
        showFloating: () => Promise<boolean>;
        openExternal: (url: string) => Promise<boolean>;
        setAutoStart: (enabled: boolean) => Promise<TaskBridgeSettings>;
        getUpdateStatus: () => Promise<UpdateStatus>;
        checkForUpdates: () => Promise<UpdateStatus>;
        onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
      };
      auth: {
        hasTokens: () => Promise<boolean>;
        clearTokens: () => Promise<void>;
        onSessionExpired: (callback: (reason: "refresh-rejected" | "server-changed") => void) => () => void;
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
        upsertTasks: (tasks: TaskRecord[]) => Promise<TaskRecord[]>;
        deleteLocalTask: (localId: string) => Promise<void>;
        purgeLocalTask: (localId: string) => Promise<void>;
        clearLocalDeviceData: () => Promise<{ tasks: number; queue: number }>;
        completeLocalTask: (localId: string) => Promise<TaskRecord | null>;
        listQueue: (limit?: number, includeExhausted?: boolean) => Promise<SyncQueueRecord[]>;
        getQueueCounts: () => Promise<SyncQueueCounts>;
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
        getTodaySummary: (limit?: number) => Promise<FloatingTaskSummary>;
        quickAdd: (title: string) => Promise<TaskRecord | null>;
        complete: (localId: string) => Promise<TaskRecord | null>;
        openDetail: (localId: string) => Promise<void>;
        exportJson: () => Promise<{ canceled: boolean; filePath?: string; exportedCount?: number }>;
        chooseImportJson: () => Promise<BackupImportPreview>;
        confirmImportJson: () => Promise<BackupImportResult>;
        getLastImportUndoSummary: () => Promise<{ count: number; localIds: string[] }>;
        undoLastImportJson: () => Promise<BackupImportUndoResult>;
        importJson: () => Promise<BackupImportResult>;
        exportDiagnostics: () => Promise<{ canceled: boolean; filePath?: string }>;
      };
      sync: {
        getStatus: () => Promise<string>;
      };
    };
  }
}
