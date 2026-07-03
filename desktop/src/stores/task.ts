import { defineStore } from "pinia";
import { computed, onScopeDispose, ref, shallowRef } from "vue";

import { deleteTask as deleteRemoteTask, purgeTask as purgeRemoteTask } from "../api/task";
import { createEmptyTask, nowIso } from "../db/sqlite";
import { enqueueChange, removeQueueByLocalId } from "../db/sync-queue.dao";
import { listTasks, listTodayTasks, purgeLocalTask, saveTask } from "../db/task.dao";
import type { ServerTaskDto } from "../api/task";
import { serverTaskToLocal } from "../sync/task-mapper";
import { isCompletedStatus, sortCompletedTasksByRecency, sortTasksByTimeline } from "../utils/task-order";
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
  checklistItems?: ChecklistDraftItem[] | null;
  isTemplate?: boolean;
  templateName?: string | null;
}

export interface ChecklistDraftItem {
  id?: string | null;
  title: string;
  done?: boolean;
}

interface MutationOptions {
  reload?: boolean;
}

export const useTaskStore = defineStore("task", () => {
  const tasks = shallowRef<TaskRecord[]>([]);
  const todayTasks = shallowRef<TaskRecord[]>([]);
  const loading = ref(false);
  const settingsStore = useSettingsStore();
  const timelineNow = ref(new Date());
  const timelineTimer = window.setInterval(() => {
    timelineNow.value = new Date();
  }, 60_000);
  onScopeDispose(() => window.clearInterval(timelineTimer));

  const activeTasks = computed(() =>
    sortTasksByTimeline(tasks.value.filter((task) => !task.isDeleted), {
      now: timelineNow.value,
      displayTimeZone: settingsStore.displayTimeZone,
    }),
  );
  const openTasks = computed(() => activeTasks.value.filter((task) => !isCompletedStatus(task.status)));
  const completedTasks = computed(() => sortCompletedTasksByRecency(activeTasks.value.filter((task) => isCompletedStatus(task.status))));
  const trashTasks = computed(() =>
    sortCompletedTasksByRecency(tasks.value.filter((task) => task.isDeleted)),
  );
  const projects = computed(() => uniqueSorted(activeTasks.value.map((task) => task.project)));
  const tags = computed(() => uniqueSorted(activeTasks.value.map((task) => task.tag)));

  async function load(): Promise<void> {
    loading.value = true;
    try {
      tasks.value = await listTasks(undefined, 0, true);
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
      project: draft.project?.trim() || parsed.project,
      listType: draft.listType || "inbox",
      dueTime,
      remindTime: draft.remindTime || null,
      repeatRule: draft.repeatRule || null,
      plannedDate,
      checklistJson: checklistTextToJson(draft.checklistText, null, draft.checklistItems),
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
      checklistJson: draft.checklistText === undefined ? task.checklistJson : checklistTextToJson(draft.checklistText, task.checklistJson, draft.checklistItems),
      isTemplate: draft.isTemplate ?? task.isTemplate,
      templateName,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: now,
      conflictServerJson: null,
      conflictLocalJson: null,
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
      conflictServerJson: null,
      conflictLocalJson: null,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "complete" : "create");
    if (!task.serverId && task.repeatRule) {
      await createNextOccurrence(task, { reload: false });
    }
    if (options.reload !== false) await load();
  }

  async function batchComplete(selected: TaskRecord[]): Promise<void> {
    const targets = selected.filter((item) => !isCompletedStatus(item.status));
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

  async function batchRestore(selected: TaskRecord[]): Promise<void> {
    for (const task of selected) {
      await restoreTask(task, { reload: false });
    }
    if (selected.length > 0) await load();
  }

  async function batchPurge(selected: TaskRecord[]): Promise<void> {
    for (const task of selected) {
      await purgeTask(task, { reload: false });
    }
    if (selected.length > 0) await load();
  }

  async function resolveConflictUseServer(task: TaskRecord): Promise<void> {
    const serverTask = parseConflictServerTask(task.conflictServerJson);
    if (!serverTask) return;
    const next = {
      ...serverTaskToLocal(serverTask, task.localId, "synced"),
      conflictServerJson: null,
      conflictLocalJson: null,
    };
    await saveTask(next);
    await removeQueueByLocalId(task.localId);
    await load();
  }

  async function forceOverwriteServer(task: TaskRecord): Promise<void> {
    const next = {
      ...task,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: nowIso(),
      conflictServerJson: null,
      conflictLocalJson: null,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "update" : "create");
    await load();
  }

  async function restoreTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    const next = {
      ...task,
      status: "todo",
      isDeleted: false,
      completedAt: null,
      syncStatus: task.serverId ? "pending_update" : "pending_create",
      updatedAt: nowIso(),
      conflictServerJson: null,
      conflictLocalJson: null,
    } satisfies TaskRecord;
    await saveTask(next);
    await queueTaskChange(next, task.serverId ? "restore" : "create");
    if (options.reload !== false) await load();
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
      conflictServerJson: null,
      conflictLocalJson: null,
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
      conflictServerJson: null,
      conflictLocalJson: null,
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
      conflictServerJson: null,
      conflictLocalJson: null,
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
      conflictServerJson: null,
      conflictLocalJson: null,
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
      conflictServerJson: null,
      conflictLocalJson: null,
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
      conflictServerJson: null,
      conflictLocalJson: null,
    } satisfies TaskRecord;
    await saveTask(next);
    if (task.serverId) {
      await queueTaskChange(next, "delete");
    } else {
      await removeQueueByLocalId(task.localId);
    }
    if (options.reload !== false) await load();
  }

  async function purgeTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    if (task.serverId) {
      try {
        await purgeRemoteTask(task.serverId);
      } catch {
        try {
          await deleteRemoteTask(task.serverId);
        } catch {
          // The server may already have the task in trash; purge below is the decisive operation.
        }
        await purgeRemoteTask(task.serverId);
      }
    }
    await removeQueueByLocalId(task.localId);
    await purgeLocalTask(task.localId);
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
        conflictServerJson: null,
        conflictLocalJson: null,
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
    trashTasks,
    projects,
    tags,
    timelineNow,
    load,
    addTask,
    updateTask,
    completeTask,
    batchComplete,
    batchDelete,
    batchRestore,
    batchPurge,
    resolveConflictUseServer,
    forceOverwriteServer,
    restoreTask,
    deleteTask,
    purgeTask,
    postponeTomorrow,
    snoozeOneHour,
    planToday,
    renameProject,
    renameTag,
    createNextOccurrence,
    instantiateTemplate,
  };
});

interface ChecklistItem {
  id?: string;
  title?: string;
  done?: boolean;
}

function checklistTextToJson(value?: string | null, existingJson?: string | null, draftItems?: ChecklistDraftItem[] | null): string {
  if (!value?.trim()) return "[]";
  const existing = parseChecklistJson(existingJson);
  const submitted = Array.isArray(draftItems) ? draftItems : [];
  const usedIndexes = new Set<number>();
  const items = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((title, index) => {
      const draftItem = submitted[index]?.title.trim() === title ? submitted[index] : null;
      const previous = draftItem ?? preserveChecklistItemState(title, index, existing, usedIndexes);
      return {
        id: previous?.id || crypto.randomUUID(),
        title,
        done: previous?.done ?? false,
      };
    });
  return JSON.stringify(items);
}

function parseChecklistJson(value?: string | null): ChecklistItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChecklistItem => typeof item?.title === "string");
  } catch {
    return [];
  }
}

function preserveChecklistItemState(
  title: string,
  index: number,
  existing: ChecklistItem[],
  usedIndexes: Set<number>,
): ChecklistItem | null {
  const direct = existing[index];
  if (direct && !usedIndexes.has(index) && direct.title?.trim() === title) {
    usedIndexes.add(index);
    return direct;
  }
  const matchingIndex = existing.findIndex((item, itemIndex) => !usedIndexes.has(itemIndex) && item.title?.trim() === title);
  if (matchingIndex >= 0) {
    usedIndexes.add(matchingIndex);
    return existing[matchingIndex];
  }
  return null;
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

function parseConflictServerTask(value: string | null): ServerTaskDto | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ServerTaskDto>;
    if (
      typeof parsed.id !== "number" ||
      typeof parsed.user_id !== "number" ||
      typeof parsed.title !== "string" ||
      typeof parsed.status !== "string" ||
      typeof parsed.priority !== "number" ||
      typeof parsed.version !== "number" ||
      typeof parsed.is_deleted !== "boolean" ||
      typeof parsed.created_at !== "string" ||
      typeof parsed.updated_at !== "string"
    ) {
      return null;
    }
    return parsed as ServerTaskDto;
  } catch {
    return null;
  }
}
