import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import { createEmptyTask, nowIso } from "../db/sqlite";
import { enqueueChange, removeQueueByLocalId } from "../db/sync-queue.dao";
import { listTasks, listTodayTasks, saveTask } from "../db/task.dao";
import { sortCompletedTasksByRecency } from "../utils/task-order";
import { parseQuickTask, parseTaskBridgeDate, shanghaiDateTimeInputToIso, todayLocalDate } from "../../shared/quick-add-parser";
import { useSettingsStore } from "./settings";
import { useSyncStore } from "./sync";

export interface TaskDraft {
  title: string;
  content?: string | null;
  priority?: number;
  tag?: string | null;
  project?: string | null;
  listType?: string | null;
  dueTime?: string | null;
  remindTime?: string | null;
  repeatRule?: string | null;
  plannedDate?: string | null;
  checklistText?: string | null;
  isTemplate?: boolean;
  templateName?: string | null;
}

interface MutationOptions {
  reload?: boolean;
}

export const useTaskStore = defineStore("task", () => {
  const tasks = shallowRef<TaskRecord[]>([]);
  const todayTasks = shallowRef<TaskRecord[]>([]);
  const loading = ref(false);
  const settingsStore = useSettingsStore();

  const activeTasks = computed(() => tasks.value.filter((task) => !task.isDeleted));
  const openTasks = computed(() => activeTasks.value.filter((task) => task.status !== "completed"));
  const completedTasks = computed(() => sortCompletedTasksByRecency(activeTasks.value.filter((task) => task.status === "completed")));
  const projects = computed(() => uniqueSorted(activeTasks.value.map((task) => task.project)));
  const tags = computed(() => uniqueSorted(activeTasks.value.map((task) => task.tag)));

  async function load(): Promise<void> {
    loading.value = true;
    try {
      tasks.value = await listTasks();
      todayTasks.value = await listTodayTasks();
    } finally {
      loading.value = false;
    }
  }

  async function addTask(draft: TaskDraft): Promise<TaskRecord> {
    const parsed = parseQuickTask(draft.title, new Date(), settingsStore.displayTimeZone);
    const dueTime = draft.dueTime || parsed.dueTime;
    const plannedDate = draft.plannedDate || parsed.plannedDate;
    const task = {
      ...createEmptyTask(parsed.title),
      content: draft.content?.trim() || null,
      priority: draft.priority && draft.priority > 0 ? draft.priority : parsed.priority,
      tag: draft.tag?.trim() || parsed.tag,
      project: draft.project?.trim() || null,
      listType: draft.listType || (plannedDate ? "today" : "inbox"),
      dueTime,
      remindTime: draft.remindTime || null,
      repeatRule: draft.repeatRule || null,
      plannedDate,
      checklistJson: checklistTextToJson(draft.checklistText),
      isTemplate: draft.isTemplate ?? false,
      templateName: draft.templateName?.trim() || null,
    };
    await saveTask(task);
    await queueTaskChange(task, "create");
    await load();
    return task;
  }

  async function updateTask(task: TaskRecord, draft: TaskDraft): Promise<TaskRecord> {
    const now = nowIso();
    const project = draft.project === undefined ? task.project : draft.project?.trim() || null;
    const templateName = draft.templateName === undefined ? task.templateName : draft.templateName?.trim() || null;
    const next: TaskRecord = {
      ...task,
      title: draft.title.trim(),
      content: draft.content?.trim() || null,
      priority: draft.priority ?? task.priority,
      tag: draft.tag?.trim() || null,
      project,
      listType: draft.listType || task.listType,
      dueTime: draft.dueTime || null,
      remindTime: draft.remindTime || null,
      repeatRule: draft.repeatRule || null,
      plannedDate: draft.plannedDate ?? task.plannedDate,
      checklistJson: draft.checklistText === undefined ? task.checklistJson : checklistTextToJson(draft.checklistText),
      isTemplate: draft.isTemplate ?? task.isTemplate,
      templateName,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: now,
    };
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "update" : "create");
    await load();
    return next;
  }

  async function completeTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    const now = nowIso();
    const next = {
      ...task,
      status: "completed",
      completedAt: now,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: now,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "complete" : "create");
    if (!task.serverId && task.repeatRule) {
      await createNextOccurrence(task, { reload: false });
    }
    if (options.reload !== false) await load();
  }

  async function batchComplete(selected: TaskRecord[]): Promise<void> {
    const targets = selected.filter((item) => item.status !== "completed");
    for (const task of targets) {
      await completeTask(task, { reload: false });
    }
    if (targets.length > 0) await load();
  }

  async function batchDelete(selected: TaskRecord[]): Promise<void> {
    for (const task of selected) {
      await deleteTask(task, { reload: false });
    }
    if (selected.length > 0) await load();
  }

  async function resolveConflictUseServer(task: TaskRecord): Promise<void> {
    const next = {
      ...task,
      syncStatus: "synced",
      updatedAt: nowIso(),
    } satisfies TaskRecord;
    await saveTask(next);
    await removeQueueByLocalId(task.localId);
    await load();
  }

  async function forceOverwriteServer(task: TaskRecord): Promise<void> {
    const next = {
      ...task,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: nowIso(),
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "update" : "create");
    await load();
  }

  async function restoreTask(task: TaskRecord): Promise<void> {
    const next = {
      ...task,
      status: "todo",
      isDeleted: false,
      completedAt: null,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: nowIso(),
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "restore" : "create");
    await load();
  }

  async function postponeTomorrow(task: TaskRecord): Promise<void> {
    const plannedDate = todayLocalDate(new Date(Date.now() + 86_400_000), settingsStore.displayTimeZone);
    const now = nowIso();
    const next = {
      ...task,
      dueTime: shanghaiDateTimeInputToIso(`${plannedDate}T09:00`, settingsStore.displayTimeZone),
      plannedDate,
      snoozedUntil: null,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: now,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "update" : "create");
    await load();
  }

  async function snoozeOneHour(task: TaskRecord): Promise<void> {
    const now = nowIso();
    const snoozedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const next = {
      ...task,
      snoozedUntil,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: now,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "update" : "create");
    await load();
  }

  async function planToday(task: TaskRecord): Promise<void> {
    const now = nowIso();
    const next = {
      ...task,
      listType: "today",
      plannedDate: todayLocalDate(new Date(), settingsStore.displayTimeZone),
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: now,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "update" : "create");
    await load();
  }

  async function createNextOccurrence(task: TaskRecord, options: MutationOptions = {}): Promise<TaskRecord | null> {
    const days = repeatDays(task.repeatRule);
    if (!days) return null;
    const next = {
      ...task,
      localId: `local-${crypto.randomUUID()}`,
      serverId: null,
      status: "todo",
      dueTime: shiftIso(task.dueTime, days),
      remindTime: shiftIso(task.remindTime, days),
      plannedDate: shiftDate(task.plannedDate, days, settingsStore.displayTimeZone),
      completedAt: null,
      snoozedUntil: null,
      parentServerId: task.serverId,
      checklistJson: resetChecklist(task.checklistJson),
      isTemplate: false,
      templateName: null,
      version: 0,
      isDeleted: false,
      syncStatus: "pending_create",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastSyncAt: null,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, "create");
    if (options.reload !== false) await load();
    return next;
  }

  async function instantiateTemplate(task: TaskRecord): Promise<TaskRecord | null> {
    if (!task.isTemplate) return null;
    const next = {
      ...task,
      localId: `local-${crypto.randomUUID()}`,
      serverId: null,
      status: "todo",
      listType: "inbox",
      completedAt: null,
      snoozedUntil: null,
      parentServerId: task.serverId,
      checklistJson: resetChecklist(task.checklistJson),
      isTemplate: false,
      templateName: null,
      version: 0,
      isDeleted: false,
      syncStatus: "pending_create",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastSyncAt: null,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, "create");
    await load();
    return next;
  }

  async function deleteTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    const next = {
      ...task,
      isDeleted: true,
      syncStatus: task.serverId ? "pending_delete" : "synced",
      updatedAt: nowIso(),
    } satisfies TaskRecord;
    await saveTask(next);
    if (task.serverId) {
      await queueTaskChange(next, "delete");
    } else {
      await removeQueueByLocalId(task.localId);
    }
    if (options.reload !== false) await load();
  }

  async function renameProject(oldValue: string, newValue: string): Promise<void> {
    await renameTaskMeta("project", oldValue, newValue);
  }

  async function renameTag(oldValue: string, newValue: string): Promise<void> {
    await renameTaskMeta("tag", oldValue, newValue);
  }

  async function renameTaskMeta(field: "project" | "tag", oldValue: string, newValue: string): Promise<void> {
    const normalizedOld = oldValue.trim();
    if (!normalizedOld) return;
    const normalizedNew = newValue.trim() || null;
    for (const task of activeTasks.value.filter((item) => item[field] === normalizedOld)) {
      const next = {
        ...task,
        [field]: normalizedNew,
        syncStatus: task.serverId ? "pending_update" : "pending_create",
        updatedAt: nowIso(),
      } satisfies TaskRecord;
      await saveTask(next);
      await queueTaskChange(next, task.serverId ? "update" : "create");
    }
    await load();
  }

  async function queueTaskChange(task: TaskRecord, action: SyncQueueRecord["action"]): Promise<void> {
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
    void useSyncStore().syncNow();
  }

  return {
    tasks,
    todayTasks,
    loading,
    activeTasks,
    openTasks,
    completedTasks,
    projects,
    tags,
    load,
    addTask,
    updateTask,
    completeTask,
    batchComplete,
    batchDelete,
    resolveConflictUseServer,
    forceOverwriteServer,
    restoreTask,
    deleteTask,
    postponeTomorrow,
    snoozeOneHour,
    planToday,
    renameProject,
    renameTag,
    createNextOccurrence,
    instantiateTemplate,
  };
});

function checklistTextToJson(value?: string | null): string {
  if (!value?.trim()) return "[]";
  const items = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((title) => ({ id: crypto.randomUUID(), title, done: false }));
  return JSON.stringify(items);
}

function resetChecklist(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return "[]";
    return JSON.stringify(parsed.map((item) => ({ ...item, done: false })));
  } catch {
    return "[]";
  }
}

function repeatDays(rule?: string | null): number | null {
  const normalized = rule?.trim().toLowerCase();
  if (normalized === "daily" || normalized === "every_day" || normalized === "every day") return 1;
  if (normalized === "weekly" || normalized === "every_week" || normalized === "every week") return 7;
  if (normalized === "monthly" || normalized === "every_month" || normalized === "every month") return 30;
  return null;
}

function shiftIso(value: string | null, days: number): string | null {
  if (!value) return null;
  const date = parseTaskBridgeDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function shiftDate(value: string | null, days: number, timeZone: string): string | null {
  if (!value) return null;
  const date = parseTaskBridgeDate(`${value}T00:00:00Z`);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return todayLocalDate(date, timeZone);
}

function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b));
}
