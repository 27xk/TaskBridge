import type { AppSettings } from "./settings";
import type { MutableAppSettingKey } from "./settings-policy";
import type { TaskRecord, TaskListSummary, SyncQueueRecord, SyncQueueCounts, FloatingTaskSummary } from "./task";
import type { BackupImportResult, BackupImportPreview, BackupImportUndoResult } from "./backup";
import type { UpdateStatus } from "./update";
import type { TaskCommitRequest, TaskCommitResult, TaskMutationState } from "./task-mutation-policy";
import type { TaskChangeCursor, TaskChangesPage, TaskSnapshotPage, TaskSyncCounts, SyncHealthSummary } from "./task-index";

export interface TaskBridge {
  platform: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
  app: {
    getRenderingCapabilities: () => Promise<{ hardwareAcceleration: boolean; gpuCompositing: string }>;
    getSettings: () => Promise<AppSettings>;
    setSetting: <Key extends MutableAppSettingKey>(key: Key, value: AppSettings[Key]) => Promise<AppSettings>;
    setConnection: (baseUrl: string, wsUrl: string) => Promise<AppSettings>;
    setSyncStatus: (status: string) => Promise<void>;
    notify: (title: string, body: string, localId?: string) => Promise<void>;
    toggleFloating: () => Promise<boolean>;
    showFloating: () => Promise<boolean>;
    openExternal: (url: string) => Promise<boolean>;
    setAutoStart: (enabled: boolean) => Promise<AppSettings>;
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
      expectedWorkspaceKey?: string;
    }) => Promise<{
      code: number;
      message: string;
      data: T;
    }>;
  };
  db: {
    listTasks: (limit?: number, offset?: number, includeDeleted?: boolean) => Promise<TaskRecord[]>;
    listTodayTasks: (limit?: number, offset?: number) => Promise<TaskRecord[]>;
    listTaskSnapshotPage: (afterLocalId?: string | null, limit?: number) => Promise<TaskSnapshotPage<TaskListSummary>>;
    listTaskChanges: (cursor: TaskChangeCursor, limit?: number) => Promise<TaskChangesPage<TaskListSummary>>;
    searchTaskIds: (keyword: string) => Promise<string[]>;
    getTaskSyncCounts: () => Promise<TaskSyncCounts>;
    getSyncHealthSummary: () => Promise<SyncHealthSummary>;
    listFloatingTodayTasks: (limit?: number) => Promise<TaskListSummary[]>;
    getTask: (localId: string) => Promise<TaskRecord | null>;
    readTaskMutationState: (localId: string, workspaceKey: string) => Promise<TaskMutationState>;
    commitTaskChange: (request: TaskCommitRequest) => Promise<TaskCommitResult>;
    getTasksByServerIds: (serverIds: number[]) => Promise<TaskRecord[]>;
    upsertTask: (task: TaskRecord, preserveLocalChanges?: boolean, expectedWorkspaceKey?: string) => Promise<TaskRecord>;
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
    quickAddReady: () => Promise<boolean>;
    onQuickAdd: (callback: () => void) => () => void;
    onShowSettings: (callback: () => void) => () => void;
    onTasksChanged: (callback: () => void) => () => void;
    onSyncStatusChanged: (callback: () => void) => () => void;
    onOpenTaskDetail: (callback: (localId: string) => void) => () => void;
    onSyncNow: (callback: () => void) => () => void;
  };
  floating: {
    isVisible: () => Promise<boolean>;
    setDraftDurable: (durable: boolean) => Promise<void>;
    onVisibilityChanged: (callback: (visible: boolean) => void) => () => void;
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
    listToday: (limit?: number) => Promise<TaskListSummary[]>;
    getTodaySummary: (limit?: number) => Promise<FloatingTaskSummary>;
    quickAdd: (title: string, submissionId?: string, workspaceKey?: string) => Promise<TaskRecord | null>;
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
}
