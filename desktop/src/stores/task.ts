import { defineStore } from "pinia";
import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";

import {
  createNextOccurrence as createRemoteNextOccurrence,
  deleteTask as deleteRemoteTask,
  purgeTask as purgeRemoteTask,
} from "../api/task";
import { createEmptyTask, nowIso } from "../db/sqlite";
import { enqueueChange, removeQueueByLocalId } from "../db/sync-queue.dao";
import { commitTaskChange, readTaskMutationState, getTask, readTaskIndex, purgeLocalTask, saveRemoteTask, saveTask } from "../db/task.dao";
import type { TaskChangeCursor, TaskIndexUpdate } from "../../shared/task-index";
import type { ServerTaskDto } from "../api/task";
import { serverTaskToLocal } from "../sync/task-mapper";
import { isCompletedStatus, sortCompletedTasksByRecency, sortTasksByTimeline } from "../utils/task-order";
import {
  parseQuickTask,
  localDateAfterDays,
  parseTaskBridgeDate,
  todayLocalDate,
  shanghaiDayBounds,
} from "../../shared/quick-add-parser";
import {
  createTaskMutationSnapshot,
  taskCreationKey,
  TASK_COMMIT_RETRIES,
  emptyTaskMutationResult,
  onTaskMutationAcknowledged,
  planTaskToday,
  rescheduleTask,
  taskFieldEquals,
  taskMatchesPatch,
  taskMutationAction,
  validateTaskScheduleDate,
  type PendingTaskUndo,
  type TaskMutationKind,
  type TaskMutationPatch,
  type TaskMutationResult,
  type TaskMutationSnapshot,
} from "../../shared/task-mutation-policy";
import { useAuthStore } from "./auth";
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
  skipUndo?: boolean;
}

interface MutationScope {
  workspaceKey: string | null;
  generation: number;
}

interface UndoState extends MutationScope {
  id: string;
  kind: TaskMutationKind;
  entries: TaskMutationSnapshot[];
}

export const useTaskStore = defineStore("task", () => {
  const tasks = shallowRef<TaskRecord[]>([]);
  const todayTasks = shallowRef<TaskRecord[]>([]);
  const loading = ref(false);
  const authStore = useAuthStore();
  const settingsStore = useSettingsStore();
  const pendingUndo = shallowRef<PendingTaskUndo | null>(null);
  const undoing = ref(false);
  let undoState: UndoState | null = null;
  const stagedUndoEntries = new Map<TaskMutationSnapshot, MutationScope>();
  let workspaceGeneration = 0;
  let loadGeneration = 0;
  let indexCursor: TaskChangeCursor | null = null;
  let mutationTail: Promise<void> = Promise.resolve();
  const pendingCreateRetries = new Map<string, string>();
  const unsubscribeAcknowledgements = onTaskMutationAcknowledged((queued, task) => {
    const entries = new Set(undoState && isCurrentScope(undoState) ? undoState.entries : []);
    for (const [entry, scope] of stagedUndoEntries) if (isCurrentScope(scope)) entries.add(entry);
    for (const entry of entries) {
      if (entry.undoApplied || entry.localId !== queued.localId || !taskFieldEquals("updatedAt", entry.localUpdatedAt, queued.localUpdatedAt)) continue;
      if (!Object.entries(entry.after).every(([field, value]) => taskFieldEquals(field, value, field === "isDeleted" ? queued.action === "delete" : queued[field as keyof SyncQueueRecord]))) continue;
      // complete uses the server clock; this is the acknowledgement of this exact local action.
      entry.after = Object.fromEntries(Object.keys(entry.after).map((field) => [field, task[field as keyof TaskRecord]]));
      entry.localUpdatedAt = task.updatedAt;
    }
  });
  onScopeDispose(unsubscribeAcknowledgements);
  const timelineNow = ref(new Date());
  const timelineTimer = window.setInterval(() => {
    timelineNow.value = new Date();
    refreshTodayIndex();
  }, 60_000);
  onScopeDispose(() => window.clearInterval(timelineTimer));
  watch(() => settingsStore.displayTimeZone, refreshTodayIndex);

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
    const scope = currentScope();
    const generation = ++loadGeneration;
    loading.value = true;
    try {
      const update = await readTaskIndex(indexCursor);
      if (!isCurrentScope(scope) || generation !== loadGeneration) return;
      applyIndexUpdate(update);
      indexCursor = update.cursor;
    } finally {
      if (isCurrentScope(scope) && generation === loadGeneration) loading.value = false;
    }
  }

  function resetWorkspace(): void {
    workspaceGeneration += 1;
    loadGeneration += 1;
    indexCursor = null;
    mutationTail = Promise.resolve();
    undoState = null;
    pendingUndo.value = null;
    pendingCreateRetries.clear();
    stagedUndoEntries.clear();
    undoing.value = false;
    tasks.value = [];
    todayTasks.value = [];
    loading.value = false;
    timelineNow.value = new Date();
  }

  function currentScope(): MutationScope {
    return { workspaceKey: authStore.workspaceKey, generation: workspaceGeneration };
  }

  function isCurrentScope(scope: MutationScope): boolean {
    return scope.workspaceKey === authStore.workspaceKey && scope.generation === workspaceGeneration;
  }

  function assertCurrentScope(scope: MutationScope): asserts scope is MutationScope & { workspaceKey: string } {
    if (!scope.workspaceKey || !isCurrentScope(scope)) throw new Error("Workspace changed before applying the task action");
  }

  function serializeMutation<T>(work: () => Promise<T>): Promise<T> {
    const pending = mutationTail.then(work);
    mutationTail = pending.then(() => {}, () => {});
    return pending;
  }

  function publishUndo(state: UndoState): void {
    if (!isCurrentScope(state) || state.entries.length === 0) return;
    undoState = state;
    pendingUndo.value = { id: state.id, kind: state.kind, count: state.entries.length, expiresAt: Date.now() + 10_000 };
  }

  function dismissUndo(id?: string): void {
    if (id && pendingUndo.value?.id !== id) return;
    undoState = null;
    pendingUndo.value = null;
  }

  function updateVisibleTask(task: TaskRecord): void {
    tasks.value = tasks.value.some((item) => item.localId === task.localId)
      ? tasks.value.map((item) => item.localId === task.localId ? task : item)
      : [...tasks.value, task];
    refreshTodayIndex();
  }

  function applyIndexUpdate(update: TaskIndexUpdate<TaskRecord>): void {
    if (!update.reset && update.tasks.length === 0 && update.removedIds.length === 0) return;
    const previous = new Map(tasks.value.map((task) => [task.localId, task]));
    const changed = new Map(update.tasks.map((task) => {
      const existing = previous.get(task.localId);
      return [task.localId, existing && sameTaskRecord(existing, task) ? existing : task];
    }));
    const removed = new Set(update.removedIds);
    const next = update.reset ? [...changed.values()] : tasks.value
      .filter((task) => !removed.has(task.localId))
      .map((task) => changed.get(task.localId) ?? task);
    if (!update.reset) for (const [id, task] of changed) if (!previous.has(id) && !removed.has(id)) next.push(task);
    if (!sameTaskList(tasks.value, next)) tasks.value = next;
    refreshTodayIndex();
  }

  function refreshTodayIndex(): void {
    const now = timelineNow.value;
    const today = todayLocalDate(now, settingsStore.displayTimeZone);
    const bounds = shanghaiDayBounds(today, settingsStore.displayTimeZone);
    const start = Date.parse(bounds.startTime);
    const end = Date.parse(bounds.endTime);
    const next = tasks.value.filter((task) => {
      if (task.isDeleted) return false;
      const due = parseTaskBridgeDate(task.dueTime)?.getTime();
      const reminder = parseTaskBridgeDate(task.remindTime)?.getTime();
      return task.listType === "today" || task.plannedDate === today
        || (due !== undefined && ((due >= start && due < end) || (!isCompletedStatus(task.status) && due < now.getTime())))
        || (reminder !== undefined && reminder >= start && reminder < end);
    });
    if (!sameTaskList(todayTasks.value, next)) todayTasks.value = next;
  }

  function localMutation(current: TaskRecord, patch: TaskMutationPatch): TaskRecord {
    const next = { ...current, ...patch };
    const updatedAt = new Date(Math.max(Date.parse(nowIso()), (parseTaskBridgeDate(current.updatedAt)?.getTime() ?? 0) + 1)).toISOString();
    return {
      ...next,
      syncStatus: next.isDeleted ? (next.serverId ? "pending_delete" : "synced") : (next.serverId ? "pending_update" : "pending_create"),
      updatedAt,
      conflictServerJson: null,
      conflictLocalJson: null,
    };
  }

  function requestSync(scope: MutationScope): void {
    if (!isCurrentScope(scope)) return;
    void useSyncStore().syncNow().catch((error) => console.error("[TaskBridge] sync refresh failed", error));
  }

  async function mutateTasks(
    kind: TaskMutationKind,
    selected: TaskRecord[],
    buildPatch: (current: TaskRecord) => TaskMutationPatch | null,
    options: MutationOptions = {},
    action?: SyncQueueRecord["action"],
  ): Promise<{ result: TaskMutationResult; task?: TaskRecord; error?: unknown }> {
    const scope = currentScope();
    const targets = [...new Map(selected.map((item) => [item.localId, item])).values()];
    return serializeMutation(async () => {
      const result = emptyTaskMutationResult(targets.length);
      const entries: TaskMutationSnapshot[] = [];
      const stagedEntries: TaskMutationSnapshot[] = [];
      let lastTask: TaskRecord | undefined;
      let firstError: unknown;
      let queueChanged = false;
      for (const target of targets) {
        try {
          let settled = false;
          for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
            assertCurrentScope(scope);
            const state = await readTaskMutationState(target.localId, scope.workspaceKey);
            assertCurrentScope(scope);
            const current = state.task;
            const patch = current ? buildPatch(current) : null;
            const next = current && patch ? localMutation(current, patch) : null;
            const entry = current && next ? createTaskMutationSnapshot(current, next) : null;
            if (!current || !next || !entry) {
              lastTask = current ?? undefined;
              result.skipped++;
              result.skippedIds.push(target.localId);
              settled = true;
              break;
            }
            if (!options.skipUndo) {
              stagedEntries.push(entry);
              stagedUndoEntries.set(entry, scope);
            }
            const committed = await commitTaskChange({
              expectedWorkspaceKey: scope.workspaceKey,
              expected: current,
              expectedQueueId: state.queueId,
              task: next,
              queueAction: next.isDeleted && !next.serverId ? null : !next.serverId ? "create" : action ?? taskMutationAction(current, next),
            });
            assertCurrentScope(scope);
            if (!committed.applied) continue;
            if (!committed.task) throw new Error("Committed task is unavailable");
            lastTask = committed.task;
            entries.push(entry);
            updateVisibleTask(lastTask);
            queueChanged = true;
            result.succeeded++;
            result.succeededIds.push(target.localId);
            settled = true;
            break;
          }
          if (!settled) throw new Error("Task changed repeatedly before the action could be committed");
        } catch (error) {
          firstError ??= error;
          result.failed++;
          result.failedIds.push(target.localId);
        }
      }
      if (isCurrentScope(scope)) {
        if (entries.length > 0 && !options.skipUndo) publishUndo({ ...scope, id: crypto.randomUUID(), kind, entries });
        if (entries.length > 0 && options.reload !== false) {
          try { await load(); } catch { result.refreshFailed = true; }
        }
        if (queueChanged) requestSync(scope);
      }
      for (const entry of stagedEntries) stagedUndoEntries.delete(entry);
      return { result, task: lastTask, error: firstError };
    });
  }

  async function mutateOne(
    kind: TaskMutationKind,
    task: TaskRecord,
    buildPatch: (current: TaskRecord) => TaskMutationPatch | null,
    options: MutationOptions = {},
    action?: SyncQueueRecord["action"],
  ): Promise<TaskRecord> {
    const outcome = await mutateTasks(kind, [task], buildPatch, options, action);
    if (outcome.error) throw outcome.error;
    if (!outcome.task) throw new Error("Task is no longer available");
    return outcome.task;
  }

  async function undoLastAction(id?: string): Promise<TaskMutationResult> {
    const requestedUndo = undoState;
    if (!requestedUndo || (id && requestedUndo.id !== id) || undoing.value) return emptyTaskMutationResult();
    undoing.value = true;
    return serializeMutation(async () => {
      const result = emptyTaskMutationResult(requestedUndo.entries.length);
      const remaining: TaskMutationSnapshot[] = [];
      let changed = false;
      let queueChanged = false;
      try {
        if (!isCurrentScope(requestedUndo) || undoState?.id !== requestedUndo.id) {
          result.skipped = result.requested;
          result.skippedIds = requestedUndo.entries.map((entry) => entry.localId);
          return result;
        }
        for (const entry of requestedUndo.entries) {
          try {
            let settled = false;
            for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
              assertCurrentScope(requestedUndo);
              const expectedFields = entry.undoApplied ? entry.before : entry.after;
              const state = await readTaskMutationState(entry.localId, requestedUndo.workspaceKey);
              assertCurrentScope(requestedUndo);
              const current = state.task;
              if (!current || !taskMatchesPatch(current, expectedFields)) {
                // A completion acknowledgement can canonicalize the expected timestamp while this read is in flight.
                if (current && expectedFields !== (entry.undoApplied ? entry.before : entry.after)) continue;
                result.skipped++;
                result.skippedIds.push(entry.localId);
                settled = true;
                break;
              }
              const next = localMutation(current, entry.before);
              const action = next.serverId && entry.after.isDeleted === true && entry.before.isDeleted === false
                ? "restore" : taskMutationAction(current, next);
              const committed = await commitTaskChange({
                expectedWorkspaceKey: requestedUndo.workspaceKey,
                expected: current,
                expectedQueueId: state.queueId,
                task: next,
                queueAction: next.isDeleted && !next.serverId ? null : action,
              });
              assertCurrentScope(requestedUndo);
              if (!committed.applied) continue;
              if (!committed.task) throw new Error("Committed task is unavailable");
              changed = true;
              updateVisibleTask(committed.task);
              queueChanged = true;
              result.succeeded++;
              result.succeededIds.push(entry.localId);
              settled = true;
              break;
            }
            if (!settled) throw new Error("Task changed repeatedly before undo could be committed");
          } catch {
            result.failed++;
            result.failedIds.push(entry.localId);
            remaining.push(entry);
          }
        }
        if (isCurrentScope(requestedUndo)) {
          if (undoState?.id === requestedUndo.id) {
            if (remaining.length > 0) publishUndo({ ...requestedUndo, entries: remaining });
            else dismissUndo(requestedUndo.id);
          }
          if (changed) {
            try { await load(); } catch { result.refreshFailed = true; }
          }
          if (queueChanged) requestSync(requestedUndo);
        }
        return result;
      } finally {
        if (isCurrentScope(requestedUndo)) undoing.value = false;
      }
    });
  }

  async function addTask(draft: TaskDraft): Promise<TaskRecord> {
    const scope = currentScope();
    return serializeMutation(async () => {
      assertCurrentScope(scope);
      const parsed = parseQuickTask(draft.title, new Date(), settingsStore.displayTimeZone);
      const candidate: TaskRecord = {
        ...createEmptyTask(parsed.title),
        content: draft.content?.trim() || null,
        priority: draft.priority && draft.priority > 0 ? draft.priority : parsed.priority,
        tag: draft.tag?.trim() || parsed.tag,
        project: draft.project?.trim() || parsed.project,
        listType: draft.listType || "inbox",
        dueTime: draft.dueTime || parsed.dueTime,
        remindTime: draft.remindTime || null,
        repeatRule: draft.repeatRule || null,
        plannedDate: draft.plannedDate || parsed.plannedDate,
        checklistJson: checklistTextToJson(draft.checklistText, null, draft.checklistItems),
        isTemplate: draft.isTemplate ?? false,
        templateName: draft.templateName?.trim() || null,
      };
      // Quick capture and the full editor supply different empty fields and checklist IDs for the same payload.
      const signature = taskCreationKey(candidate);
      candidate.localId = pendingCreateRetries.get(signature) ?? candidate.localId;
      pendingCreateRetries.set(signature, candidate.localId);
      let task: TaskRecord | null = null;
      for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
        assertCurrentScope(scope);
        const state = await readTaskMutationState(candidate.localId, scope.workspaceKey);
        assertCurrentScope(scope);
        if (state.task?.isDeleted) throw new Error("The task from this submission was deleted");
        if (state.task && (state.queueId !== null || state.task.syncStatus === "synced")) {
          task = state.task;
          break;
        }
        const next = state.task ? localMutation(state.task, {}) : candidate;
        const committed = await commitTaskChange({
          expectedWorkspaceKey: scope.workspaceKey,
          expected: state.task,
          expectedQueueId: state.queueId,
          task: next,
          queueAction: next.serverId ? "update" : "create",
        });
        assertCurrentScope(scope);
        if (!committed.applied) continue;
        task = committed.task;
        break;
      }
      if (!task) throw new Error("Task changed repeatedly before it could be saved");
      pendingCreateRetries.delete(signature);
      updateVisibleTask(task);
      try { await load(); } catch { /* The durable task remains visible while a later refresh retries the read. */ }
      requestSync(scope);
      return task;
    });
  }

  async function updateTask(task: TaskRecord, draft: TaskDraft): Promise<TaskRecord> {
    const project = draft.project === undefined ? task.project : draft.project?.trim() || null;
    const templateName = draft.templateName === undefined ? task.templateName : draft.templateName?.trim() || null;
    const requested: TaskRecord = {
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
      plannedDate: draft.plannedDate === undefined ? task.plannedDate : draft.plannedDate || null,
      checklistJson: draft.checklistText === undefined ? task.checklistJson : checklistTextToJson(draft.checklistText, task.checklistJson, draft.checklistItems),
      isTemplate: draft.isTemplate ?? task.isTemplate,
      templateName,
    };
    const patch = createTaskMutationSnapshot(task, requested)?.after ?? {};
    return mutateOne("edit", task, () => patch);
  }

  async function completeTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    await mutateOne("complete", task, completionPatch, options, "complete");
  }

  function completionPatch(task: TaskRecord): TaskMutationPatch | null {
    return task.isDeleted || isCompletedStatus(task.status) ? null : { status: "completed", completedAt: nowIso() };
  }

  async function batchComplete(selected: TaskRecord[]): Promise<TaskMutationResult> {
    return (await mutateTasks("complete", selected, completionPatch, {}, "complete")).result;
  }

  async function batchDelete(selected: TaskRecord[]): Promise<TaskMutationResult> {
    return (await mutateTasks("delete", selected, (task) => task.isDeleted ? null : { isDeleted: true }, {}, "delete")).result;
  }

  async function batchRestore(selected: TaskRecord[]): Promise<TaskMutationResult> {
    return (await mutateTasks("restore", selected, () => ({ status: "todo", isDeleted: false, completedAt: null }), {}, "restore")).result;
  }

  async function batchPurge(selected: TaskRecord[]): Promise<TaskMutationResult> {
    return (await purgeTasks(selected)).result;
  }

  async function batchPlanToday(selected: TaskRecord[]): Promise<TaskMutationResult> {
    const now = new Date();
    const timeZone = settingsStore.displayTimeZone;
    return (await mutateTasks("schedule", selected, (task) => task.isDeleted ? null : planTaskToday(task, now, timeZone))).result;
  }

  async function batchReschedule(selected: TaskRecord[], date: string): Promise<TaskMutationResult> {
    validateTaskScheduleDate(date);
    const now = new Date();
    const timeZone = settingsStore.displayTimeZone;
    return (await mutateTasks("schedule", selected, (task) => task.isDeleted ? null : rescheduleTask(task, date, now, timeZone))).result;
  }

  async function batchSetPriority(selected: TaskRecord[], priority: number): Promise<TaskMutationResult> {
    if (!Number.isInteger(priority) || priority < 0 || priority > 5) throw new RangeError("Invalid task priority");
    return (await mutateTasks("priority", selected, (task) => task.isDeleted ? null : { priority })).result;
  }

  async function resolveConflictUseServer(task: TaskRecord): Promise<void> {
    await resolveTaskConflict(task, true);
  }

  async function forceOverwriteServer(task: TaskRecord): Promise<void> {
    await resolveTaskConflict(task, false);
  }

  async function resolveTaskConflict(task: TaskRecord, useServer: boolean): Promise<void> {
    const scope = currentScope();
    return serializeMutation(async () => {
      for (let attempt = 0; attempt < TASK_COMMIT_RETRIES; attempt++) {
        assertCurrentScope(scope);
        const state = await readTaskMutationState(task.localId, scope.workspaceKey);
        assertCurrentScope(scope);
        const current = state.task;
        if (!current || current.syncStatus !== "conflict" || !sameTaskRecord(current, task)) {
          throw new Error("The task conflict changed before it could be resolved");
        }
        const serverTask = useServer ? parseConflictServerTask(current.conflictServerJson) : null;
        if (useServer && (!serverTask || serverTask.id !== current.serverId)) {
          throw new Error("The cloud task for this conflict is unavailable");
        }
        const next = serverTask ? serverTaskToLocal(serverTask, current.localId, "synced") : localMutation(current, {});
        const committed = await commitTaskChange({
          expectedWorkspaceKey: scope.workspaceKey,
          expected: current,
          expectedQueueId: state.queueId,
          task: next,
          queueAction: useServer ? null : taskMutationAction(current, next),
        });
        assertCurrentScope(scope);
        if (!committed.applied) continue;
        if (!committed.task) throw new Error("Resolved task is unavailable");
        updateVisibleTask(committed.task);
        if (!useServer) requestSync(scope);
        try { await load(); } catch { /* Recovery is durable; a later refresh can retry the index read. */ }
        return;
      }
      throw new Error("Task changed repeatedly before its conflict could be resolved");
    });
  }

  async function restoreTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    await mutateOne("restore", task, () => ({ status: "todo", isDeleted: false, completedAt: null }), options, "restore");
  }

  async function postponeTomorrow(task: TaskRecord): Promise<void> {
    const now = new Date();
    const timeZone = settingsStore.displayTimeZone;
    const plannedDate = localDateAfterDays(now, 1, timeZone);
    await mutateOne("schedule", task, (current) => current.isDeleted ? null : rescheduleTask(current, plannedDate, now, timeZone, "09:00"));
  }

  async function snoozeOneHour(task: TaskRecord): Promise<void> {
    const snoozedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await mutateOne("snooze", task, (current) => current.isDeleted ? null : { snoozedUntil });
  }

  async function planToday(task: TaskRecord): Promise<void> {
    const now = new Date();
    const timeZone = settingsStore.displayTimeZone;
    await mutateOne("schedule", task, (current) => current.isDeleted ? null : planTaskToday(current, now, timeZone));
  }

  async function createNextOccurrence(task: TaskRecord, options: MutationOptions = {}): Promise<TaskRecord | null> {
    const workspaceKey = authStore.workspaceKey;
    if (!task.serverId || !task.repeatRule || !workspaceKey) return null;
    const remote = await createRemoteNextOccurrence(task.serverId, workspaceKey);
    if (authStore.workspaceKey !== workspaceKey) return null;
    const next = await saveRemoteTask(serverTaskToLocal(remote, `server-${remote.id}`, "synced"), workspaceKey);
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
    await mutateOne("delete", task, (current) => current.isDeleted ? null : { isDeleted: true }, options, "delete");
  }

  async function purgeTask(task: TaskRecord, options: MutationOptions = {}): Promise<void> {
    const outcome = await purgeTasks([task], options);
    if (outcome.error) throw outcome.error;
  }

  async function purgeTasks(selected: TaskRecord[], options: MutationOptions = {}): Promise<{ result: TaskMutationResult; error?: unknown }> {
    const scope = currentScope();
    const targets = [...new Map(selected.map((item) => [item.localId, item])).values()];
    return serializeMutation(async () => {
      const result = emptyTaskMutationResult(targets.length);
      let firstError: unknown;
      for (const target of targets) {
        try {
          assertCurrentScope(scope);
          const current = await getTask(target.localId);
          assertCurrentScope(scope);
          if (!current) { result.skipped++; result.skippedIds.push(target.localId); continue; }
          if (current.serverId) {
            try {
              await purgeRemoteTask(current.serverId);
            } catch {
              assertCurrentScope(scope);
              try { await deleteRemoteTask(current.serverId); } catch { /* Purge is the decisive operation. */ }
              assertCurrentScope(scope);
              await purgeRemoteTask(current.serverId);
            }
          }
          assertCurrentScope(scope);
          await removeQueueByLocalId(current.localId);
          assertCurrentScope(scope);
          await purgeLocalTask(current.localId);
          assertCurrentScope(scope);
          tasks.value = tasks.value.filter((item) => item.localId !== current.localId);
          todayTasks.value = todayTasks.value.filter((item) => item.localId !== current.localId);
          if (undoState) {
            const remaining = undoState.entries.filter((entry) => entry.localId !== current.localId);
            if (remaining.length > 0) publishUndo({ ...undoState, entries: remaining });
            else dismissUndo();
          }
          result.succeeded++;
          result.succeededIds.push(current.localId);
        } catch (error) {
          firstError ??= error;
          result.failed++;
          result.failedIds.push(target.localId);
        }
      }
      if (result.succeeded > 0 && options.reload !== false && isCurrentScope(scope)) {
        try { await load(); } catch { result.refreshFailed = true; }
      }
      return { result, error: firstError };
    });
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

  async function queueTaskChange(task: TaskRecord, action: SyncQueueRecord["action"], sync = true): Promise<void> {
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
    if (sync) requestSync(currentScope());
  }

  return {
    tasks,
    todayTasks,
    loading,
    pendingUndo,
    undoing,
    undoLastAction,
    dismissUndo,
    activeTasks,
    openTasks,
    completedTasks,
    trashTasks,
    projects,
    tags,
    timelineNow,
    resetWorkspace,
    load,
    addTask,
    updateTask,
    completeTask,
    batchComplete,
    batchDelete,
    batchRestore,
    batchPurge,
    batchPlanToday,
    batchReschedule,
    batchSetPriority,
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

function sameTaskRecord(left: TaskRecord, right: TaskRecord): boolean {
  return Object.keys(right).length === Object.keys(left).length
    && Object.entries(right).every(([key, value]) => left[key as keyof TaskRecord] === value);
}

function sameTaskList(left: TaskRecord[], right: TaskRecord[]): boolean {
  return left.length === right.length && left.every((task, index) => task === right[index]);
}

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
