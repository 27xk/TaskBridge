export function bridge() {
  if (!window.taskBridge) {
    throw new Error("TaskBridge preload bridge is not available");
  }
  return window.taskBridge;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newLocalId(): string {
  return `local-${crypto.randomUUID()}`;
}

export function createEmptyTask(title = ""): TaskRecord {
  const now = nowIso();
  return {
    localId: newLocalId(),
    serverId: null,
    title,
    content: null,
    status: "todo",
    priority: 0,
    tag: null,
    project: null,
    listType: "inbox",
    dueTime: null,
    remindTime: null,
    repeatRule: null,
    plannedDate: null,
    completedAt: null,
    snoozedUntil: null,
    parentServerId: null,
    checklistJson: "[]",
    isTemplate: false,
    templateName: null,
    sortOrder: 0,
    version: 0,
    isDeleted: false,
    syncStatus: "pending_create",
    createdAt: now,
    updatedAt: now,
    lastSyncAt: null,
  };
}
