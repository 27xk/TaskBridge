<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { ArrowDownWideNarrow, ListChecks, X } from "lucide-vue-next";

import AppToast from "../components/AppToast.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import EditorDrawer from "../components/EditorDrawer.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskListSection from "../components/TaskListSection.vue";
import TaskFilterPanel from "../components/TaskFilterPanel.vue";
import SavedTaskViews from "../components/SavedTaskViews.vue";
import TaskBatchSchedule from "../components/TaskBatchSchedule.vue";
import { useConfirmDialog, type ConfirmationOptions } from "../composables/useConfirmDialog";
import { useSettingsStore } from "../stores/settings";
import { useWorkspaceStore } from "../stores/workspace";
import { useCaptureStore } from "../stores/capture";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isCompletedStatus, isTaskOverdue } from "../utils/task-order";
import { groupTasksByCategory, sortTasksBySchedule } from "../utils/task-view-order";
import { parseTaskBridgeDate, todayLocalDate } from "../../shared/quick-add-parser";
import { getTaskActionConfirmationMessage, getTaskPriorityLabel } from "../../shared/task-ui-policy";
import { calendarWeekBounds, isValidCalendarDate, matchesTaskView, type TaskViewFilter, type TaskViewSelectionKey } from "../../shared/workspace-view-state";
import type { TaskMutationResult } from "../../shared/task-mutation-policy";

const props = defineProps<{
  quickAddSignal?: number;
  searchSignal?: number;
  openTaskRequest?: { localId: string; nonce: number } | null;
}>();

const emit = defineEmits<{
  editorDirtyChange: [dirty: boolean];
  taskRequestConsumed: [nonce: number];
  quickAddConsumed: [signal: number];
}>();

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const captureStore = useCaptureStore();
let workspaceEpoch = 0;
let openRequestGeneration = 0;
const editorOpen = ref(false);
const editorDirty = ref(false);
const isSaving = ref(false);
const editorSaveError = ref("");
const editingTask = ref<TaskRecord | null>(null);
const search = computed({ get: () => workspaceStore.taskView.search, set: (value) => { workspaceStore.taskView.search = value; } });
const taskSearchInput = useTemplateRef<HTMLInputElement>("taskSearchInput");
const clearFiltersButton = useTemplateRef<HTMLButtonElement>("clearFiltersButton");
type TaskFilter = TaskViewFilter;
const criteria = computed(() => workspaceStore.taskView);
const filter = computed(() => criteria.value.filter);
const trashOnly = computed(() => criteria.value.lists.length === 1 && criteria.value.lists[0] === "trash");
const bulkBusy = ref(false);
const actionError = ref("");
const runningTaskActions = new Set<string>();
const todayDate = computed(() => todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone));
const notice = ref("");
const SHORT_NOTICE_MS = 1800;
const IMPORTANT_NOTICE_MS = 4500;
const createVisibleEmptyFilters = new Set<TaskFilter>(["all", "inbox", "today"]);
let noticeTimer: number | undefined;
const {
  confirmDialog,
  requestConfirmation,
  confirmRequestedAction,
  cancelRequestedAction,
} = useConfirmDialog(() => settingsStore.language);

type ActiveFilterKey = TaskViewSelectionKey | "search";
type ActiveFilterItem = { id: string; key: ActiveFilterKey; value: string | number; label: string };

const primaryFilterOptions = computed<Array<{ value: TaskFilter; label: string }>>(() => [
  { value: "all", label: settingsStore.t("nav.all") },
  { value: "today", label: settingsStore.t("nav.today") },
  { value: "overdue", label: settingsStore.t("task.filterOverdue") },
  { value: "completed", label: settingsStore.t("task.completedCountPrefix") },
]);
const secondaryFilterOptions = computed<Array<{ value: TaskFilter; label: string }>>(() => [
  { value: "inbox", label: settingsStore.t("task.inbox") },
  { value: "week", label: settingsStore.t("task.filterWeek") },
  { value: "high", label: settingsStore.t("task.filterHigh") },
  { value: "pending", label: settingsStore.t("task.filterPending") },
  { value: "conflict", label: settingsStore.t("sync.conflict") },
  { value: "templates", label: settingsStore.t("task.template") },
  { value: "trash", label: settingsStore.t("task.trash") },
]);
const activeFilterItems = computed<ActiveFilterItem[]>(() => {
  const items: ActiveFilterItem[] = [];
  const add = (key: ActiveFilterKey, value: string | number, label: string) => items.push({ id: `${key}:${value}`, key, value, label });
  for (const list of criteria.value.lists) {
    const option = [...primaryFilterOptions.value, ...secondaryFilterOptions.value].find((item) => item.value === list);
    if (option) add("lists", list, option.label);
  }
  for (const project of criteria.value.projects) add("projects", project, `${settingsStore.t("task.project")}: ${project || (settingsStore.language === "zh-CN" ? "无项目" : "No project")}`);
  for (const category of criteria.value.categories) add("categories", category, `${settingsStore.t("task.tag")}: ${category || (settingsStore.language === "zh-CN" ? "未分类" : "Uncategorized")}`);
  for (const priority of criteria.value.priorities) add("priorities", priority, priority === "high" ? settingsStore.t("task.filterHigh") : `${settingsStore.t("task.priority")}: ${getTaskPriorityLabel(priority, settingsStore.language)}`);
  for (const status of criteria.value.statuses) add("statuses", status, settingsStore.t(status === "open" ? "task.filterOpen" : "task.completedCountPrefix"));
  const keyword = search.value.trim();
  if (keyword) {
    add("search", keyword, settingsStore.language === "zh-CN" ? `搜索: ${keyword}` : `Search: ${keyword}`);
  }
  return items;
});
const hasActiveFilters = computed(() => activeFilterItems.value.length > 0);

const filteredTasks = computed(() => {
  const sourceTasks = criteria.value.lists.includes("trash") ? [...taskStore.activeTasks, ...taskStore.trashTasks] : taskStore.activeTasks;
  const today = todayDate.value;
  const week = calendarWeekBounds(today);
  return sortTasksBySchedule(sourceTasks.filter((task) => matchesTaskView(task, criteria.value, {
    today,
    week,
    taskDate: task.plannedDate ?? isoDate(task.dueTime),
    completed: isCompletedStatus(task.status),
    overdue: isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone),
  })), settingsStore.displayTimeZone);
});
const openFilteredTasks = computed(() => filteredTasks.value.filter((task) => !task.isDeleted && !isCompletedStatus(task.status)));
const taskSections = computed(() => {
  const deleted = filteredTasks.value.filter((task) => task.isDeleted);
  const active = filteredTasks.value.filter((task) => !task.isDeleted);
  if (criteria.value.sortMode === "category") {
    const uncategorized = settingsStore.language === "zh-CN" ? "未分类" : "Uncategorized";
    return [
      ...groupTasksByCategory(active, settingsStore.language).map(group => ({ key: `category:${group.category}`, title: group.category || uncategorized, tasks: group.tasks, trash: false, tone: "default" as const })),
      ...(deleted.length ? [{ key: "trash", title: settingsStore.t("task.trash"), tasks: deleted, trash: true, tone: "default" as const }] : []),
    ];
  }
  return [
    { key: "tasks", title: "", tasks: active, trash: false, tone: "default" as const },
    { key: "trash", title: settingsStore.t("task.trash"), tasks: deleted, trash: true, tone: "default" as const },
  ].filter(section => section.tasks.length > 0);
});
const selectionMode = ref(false);
const selectedTaskIds = ref<Set<string>>(new Set());
const selectableOpenTasks = computed(() =>
  trashOnly.value
    ? filteredTasks.value
    : openFilteredTasks.value.filter((task) => !task.isTemplate),
);
const bulkActionTargets = computed(() => selectableOpenTasks.value.filter((task) => selectedTaskIds.value.has(task.localId)));
const bulkActionCountLabel = computed(() =>
  `${bulkActionTargets.value.length} ${settingsStore.t("task.selectedCountSuffix")}`,
);
const canCreateIntoCurrentEmptyView = computed(
  () => createVisibleEmptyFilters.has(filter.value) && !hasActiveFilters.value,
);
const emptyTaskActionLabel = computed(() =>
  canCreateIntoCurrentEmptyView.value ? settingsStore.t("task.add") : settingsStore.t("task.showAllTasks"),
);
const emptyTaskStateText = computed(() => {
  if (trashOnly.value) return settingsStore.t("task.emptyTrash");
  if (search.value.trim()) return settingsStore.t("task.emptySearch");
  if (hasActiveFilters.value && !canCreateIntoCurrentEmptyView.value) return settingsStore.t("task.emptyFiltered");
  if (filter.value === "today") return settingsStore.t("task.emptyToday");
  return settingsStore.t("task.empty");
});
const editorCreatePreset = ref<"default" | "today">("default");

function setEditorDirty(dirty: boolean): void {
  editorDirty.value = dirty;
  emit("editorDirtyChange", Boolean(editingTask.value && dirty));
}

function updateCaptureDraft(draft: TaskDraft): void {
  if (!editingTask.value) captureStore.updateDraft(draft);
}

watch(() => workspaceStore.workspaceKey, () => {
  workspaceEpoch += 1;
  openRequestGeneration += 1;
  cancelRequestedAction();
  editorOpen.value = false;
  editingTask.value = null;
  isSaving.value = false;
  editorSaveError.value = "";
  setEditorDirty(false);
  bulkBusy.value = false;
  actionError.value = "";
  notice.value = "";
  runningTaskActions.clear();
  exitSelectionMode();
}, { flush: "sync" });

// Only a new Ctrl+F request should focus search; remounting must preserve the saved scroll.
watch(() => props.searchSignal, async (signal) => {
  if (!signal) return;
  await nextTick();
  taskSearchInput.value?.focus();
  taskSearchInput.value?.select();
});

watch(
  () => props.quickAddSignal,
  async (value) => {
    if (!value) return;
    const generation = ++openRequestGeneration;
    const epoch = workspaceEpoch;
    try {
      await openCreateIfCurrent(() => generation === openRequestGeneration && epoch === workspaceEpoch);
    } finally {
      emit("quickAddConsumed", value);
    }
  },
  { immediate: true },
);

watch(
  () => props.openTaskRequest,
  async (request) => {
    if (!request) return;
    const generation = ++openRequestGeneration;
    const epoch = workspaceEpoch;
    const isCurrent = () => generation === openRequestGeneration && epoch === workspaceEpoch;
    try {
      if (taskStore.tasks.length === 0) await taskStore.load();
      if (!isCurrent()) return;
      const task = taskStore.tasks.find((item) => item.localId === request.localId);
      if (task) await openEdit(task, isCurrent);
    } catch (error) {
      if (!isCurrent()) return;
      actionError.value = settingsStore.language === "zh-CN" ? "暂时无法打开任务，请重试。" : "The task could not be opened. Please try again.";
      console.error("Unable to open requested task", error);
    } finally {
      emit("taskRequestConsumed", request.nonce);
    }
  },
  { immediate: true },
);

watch(
  selectableOpenTasks,
  (tasks) => {
    const selectableIds = new Set(tasks.map((task) => task.localId));
    const nextSelectedIds = new Set([...selectedTaskIds.value].filter((id) => selectableIds.has(id)));
    if (nextSelectedIds.size !== selectedTaskIds.value.size || [...nextSelectedIds].some((id) => !selectedTaskIds.value.has(id))) {
      selectedTaskIds.value = nextSelectedIds;
    }
  },
);

async function openCreate(): Promise<void> {
  const generation = ++openRequestGeneration;
  await openCreateIfCurrent(() => generation === openRequestGeneration);
}

async function openCreateIfCurrent(isCurrent: () => boolean = () => true): Promise<void> {
  if (editorOpen.value && !editingTask.value) return;
  const epoch = workspaceEpoch;
  if (!(await canLeaveEditor()) || epoch !== workspaceEpoch || !isCurrent()) return;
  editorSaveError.value = "";
  editorCreatePreset.value = criteria.value.lists.includes("today") ? "today" : "default";
  editingTask.value = null;
  setEditorDirty(false);
  editorOpen.value = true;
}

async function resetTaskFilters(): Promise<void> {
  workspaceStore.applyTaskView({ sortMode: criteria.value.sortMode });
  clearSelectedTasks();
  await nextTick();
  taskSearchInput.value?.focus();
}

function setTaskFilter(nextFilter: TaskFilter): void {
  workspaceStore.setTaskViewFilter(isPrimaryFilterSelected(nextFilter) ? "all" : nextFilter);
  clearSelectedTasks();
}

function isPrimaryFilterSelected(value: TaskFilter): boolean {
  const { lists, statuses, priorities } = criteria.value;
  if (priorities.length) return false;
  if (value === "all") return !lists.length && !statuses.length;
  if (value === "completed") return !lists.length && statuses.length === 1 && statuses[0] === "completed";
  return lists.length === 1 && lists[0] === value && !statuses.length;
}

function toggleSelection(key: TaskViewSelectionKey, value: string | number): void {
  if (key === "lists") workspaceStore.toggleTaskViewSelection(key, value as typeof criteria.value.lists[number]);
  if (key === "statuses") workspaceStore.toggleTaskViewSelection(key, value as typeof criteria.value.statuses[number]);
  if (key === "priorities") workspaceStore.toggleTaskViewSelection(key, value as typeof criteria.value.priorities[number]);
  if (key === "projects" || key === "categories") workspaceStore.toggleTaskViewSelection(key, String(value));
  clearSelectedTasks();
}

async function clearActiveFilter(key: ActiveFilterKey, value: string | number): Promise<void> {
  if (key === "search") search.value = "";
  else toggleSelection(key, value);
  clearSelectedTasks();
  await focusAfterActiveFilterRemoval();
}

async function focusAfterActiveFilterRemoval(): Promise<void> {
  await nextTick();
  (clearFiltersButton.value ?? taskSearchInput.value)?.focus();
}

async function clearSearch(): Promise<void> {
  search.value = "";
  await nextTick();
  taskSearchInput.value?.focus();
}

function handleEmptyStateAction(): void {
  if (canCreateIntoCurrentEmptyView.value) {
    openCreate();
    return;
  }
  resetTaskFilters();
}

async function openEdit(task: TaskRecord, requestIsCurrent?: () => boolean): Promise<void> {
  const generation = requestIsCurrent ? openRequestGeneration : ++openRequestGeneration;
  const isCurrent = requestIsCurrent ?? (() => generation === openRequestGeneration);
  if (editorOpen.value && editingTask.value?.localId === task.localId) return;
  const epoch = workspaceEpoch;
  if (!(await canLeaveEditor()) || epoch !== workspaceEpoch || !isCurrent()) return;
  editorSaveError.value = "";
  editingTask.value = task;
  setEditorDirty(false);
  editorOpen.value = true;
}

async function canLeaveEditor(): Promise<boolean> {
  if (isSaving.value) return false;
  if (!editingTask.value || !editorDirty.value) return true;
  return requestConfirmation({
    message: settingsStore.t("task.discardChangesConfirm"),
    danger: true,
  });
}

async function closeEditor(): Promise<void> {
  const epoch = workspaceEpoch;
  if (!(await canLeaveEditor()) || epoch !== workspaceEpoch) return;
  openRequestGeneration += 1;
  editorOpen.value = false;
  editingTask.value = null;
  setEditorDirty(false);
}

async function save(draft: TaskDraft): Promise<void> {
  if (isSaving.value) return;
  editorSaveError.value = "";
  isSaving.value = true;
  const epoch = workspaceEpoch;
  const task = editingTask.value;
  const capture = task ? null : captureStore.snapshot();
  try {
    if (task) {
      await taskStore.updateTask(task, draft);
    } else {
      await taskStore.addTask(draft);
      if (capture) captureStore.clearIfCurrent(capture);
    }
    if (epoch !== workspaceEpoch) return;
    editorOpen.value = false;
    editingTask.value = null;
    setEditorDirty(false);
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    if (epoch === workspaceEpoch) editorSaveError.value = settingsStore.t("task.saveFailed");
  } finally {
    if (epoch === workspaceEpoch) isSaving.value = false;
  }
}

async function runTaskAction(task: TaskRecord, action: () => Promise<unknown>, success: string, confirmation?: ConfirmationOptions): Promise<void> {
  if (bulkBusy.value || runningTaskActions.has(task.localId)) return;
  const epoch = workspaceEpoch;
  const previousUndoId = taskStore.pendingUndo?.id;
  notice.value = "";
  runningTaskActions.add(task.localId);
  actionError.value = "";
  try {
    if (confirmation && !(await requestConfirmation(confirmation))) return;
    if (epoch !== workspaceEpoch) return;
    await action();
    if (epoch === workspaceEpoch && (!taskStore.pendingUndo || taskStore.pendingUndo.id === previousUndoId)) {
      showNotice(`${success}：${task.title}`, IMPORTANT_NOTICE_MS);
    }
  } catch (error) {
    if (epoch !== workspaceEpoch) return;
    actionError.value = settingsStore.language === "zh-CN" ? `未能对「${task.title}」完成此操作，请重试。` : `The action on “${task.title}” could not finish. Please try again.`;
    showNotice(actionError.value, IMPORTANT_NOTICE_MS);
    console.error("Task action failed", error);
  } finally {
    if (epoch === workspaceEpoch) runningTaskActions.delete(task.localId);
  }
}

async function completeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.completeTask(task), settingsStore.t("task.feedbackCompleted"));
}

async function restoreTask(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.restoreTask(task), settingsStore.t("task.feedbackRestored"));
}

async function deleteTask(task: TaskRecord): Promise<void> {
  const message = getTaskActionConfirmationMessage("delete", task.title, settingsStore.language);
  await runTaskAction(task, () => taskStore.deleteTask(task), settingsStore.t("task.feedbackDeleted"), message ? {
    message,
    confirmText: settingsStore.t("task.delete"),
    danger: true,
  } : undefined);
}

async function purgeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.purgeTask(task), settingsStore.t("task.feedbackPurged"), {
    message: settingsStore.t("task.purgeConfirm").replace("{title}", task.title),
    confirmText: settingsStore.t("task.purge"),
    danger: true,
  });
}

async function planTaskToday(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.planToday(task), settingsStore.language === "zh-CN" ? "已安排到今天" : "Planned for today");
}

async function postponeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.postponeTomorrow(task), settingsStore.language === "zh-CN" ? "已推迟到明天" : "Postponed until tomorrow");
}

async function snoozeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.snoozeOneHour(task), settingsStore.language === "zh-CN" ? "已稍后提醒" : "Reminder snoozed");
}

async function createNextOccurrence(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.createNextOccurrence(task), settingsStore.language === "zh-CN" ? "已创建下次任务" : "Next occurrence created");
}

async function instantiateTemplate(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.instantiateTemplate(task), settingsStore.language === "zh-CN" ? "已从模板创建任务" : "Task created from template");
}

async function runBulkAction(action: (tasks: TaskRecord[]) => Promise<TaskMutationResult>, actionLabel: string, confirmation?: ConfirmationOptions): Promise<void> {
  if (bulkBusy.value || bulkActionTargets.value.length === 0) return;
  const targets = [...bulkActionTargets.value];
  const epoch = workspaceEpoch;
  const previousUndoId = taskStore.pendingUndo?.id;
  bulkBusy.value = true;
  actionError.value = "";
  try {
    if (confirmation && !(await requestConfirmation(confirmation))) return;
    if (epoch !== workspaceEpoch) return;
    const result = await action(targets);
    if (epoch !== workspaceEpoch) return;
    const skipped = result.skipped > 0
      ? settingsStore.language === "zh-CN" ? `，${result.skipped} 项无需更改` : `; ${result.skipped} unchanged`
      : "";
    const summary = settingsStore.language === "zh-CN"
      ? `${actionLabel}：成功 ${result.succeeded} 项${skipped}`
      : `${actionLabel}: ${result.succeeded} succeeded${skipped}`;
    if (result.failed > 0) {
      const selectableIds = new Set(selectableOpenTasks.value.map((task) => task.localId));
      const queueFailedIds = new Set(result.queueFailedIds ?? []);
      const failedToSave = result.failed - queueFailedIds.size;
      selectedTaskIds.value = new Set(result.failedIds.filter((id) => !queueFailedIds.has(id) && selectableIds.has(id)));
      selectionMode.value = selectedTaskIds.value.size > 0;
      const retryHint = selectionMode.value
        ? settingsStore.language === "zh-CN" ? `${selectedTaskIds.value.size} 项仍已选中，可重试。` : `${selectedTaskIds.value.size} remain selected for retry.`
        : settingsStore.language === "zh-CN" ? "请查看任务的最新状态后重试。" : "Check the latest task state before retrying.";
      const failureMessage = failedToSave > 0
        ? settingsStore.language === "zh-CN" ? `，${failedToSave} 项失败。${retryHint}` : `; ${failedToSave} failed. ${retryHint}`
        : settingsStore.language === "zh-CN" ? "。" : ".";
      const savedMessage = queueFailedIds.size > 0
        ? settingsStore.language === "zh-CN"
          ? `另有 ${queueFailedIds.size} 项已保存在本机，暂时无法同步。可使用“撤销”恢复后重试。`
          : ` ${queueFailedIds.size} more were saved on this device but cannot sync yet. Undo these changes before retrying.`
        : "";
      actionError.value = `${summary}${failureMessage}${savedMessage}`;
    } else {
      exitSelectionMode();
      if (!taskStore.pendingUndo || taskStore.pendingUndo.id === previousUndoId) showNotice(summary, IMPORTANT_NOTICE_MS);
    }
    if (result.refreshFailed) {
      const refreshMessage = settingsStore.language === "zh-CN"
        ? "更改已保存，但列表刷新失败。请刷新后查看最新状态。"
        : "Changes were saved, but the list could not refresh. Refresh to see the latest state.";
      actionError.value = actionError.value ? `${actionError.value} ${refreshMessage}` : refreshMessage;
    }
  } catch (error) {
    if (epoch !== workspaceEpoch) return;
    actionError.value = settingsStore.language === "zh-CN"
      ? `${actionLabel}未完成，请重试。所选任务仍保留。`
      : `${actionLabel} could not finish. Your selection is kept; please try again.`;
    console.error("Batch task action failed", error);
  } finally {
    if (epoch === workspaceEpoch) bulkBusy.value = false;
  }
}

async function completeVisibleTasks(): Promise<void> {
  await runBulkAction((tasks) => taskStore.batchComplete(tasks), settingsStore.t("task.completeVisible"));
}

async function deleteVisibleTasks(): Promise<void> {
  await runBulkAction((tasks) => taskStore.batchDelete(tasks), settingsStore.t("task.deleteVisible"), {
    message: settingsStore.t("task.deleteVisibleConfirm").replace("{count}", String(bulkActionTargets.value.length)),
    confirmText: settingsStore.t("task.deleteVisible"),
    danger: true,
  });
}

async function restoreSelectedTrashTasks(): Promise<void> {
  await runBulkAction((tasks) => taskStore.batchRestore(tasks), settingsStore.t("task.restoreSelectedTrash"));
}

async function purgeSelectedTrashTasks(): Promise<void> {
  await runBulkAction((tasks) => taskStore.batchPurge(tasks), settingsStore.t("task.purgeSelectedTrash"), {
    message: settingsStore.t("task.purgeSelectedConfirm").replace("{count}", String(bulkActionTargets.value.length)),
    confirmText: settingsStore.t("task.purgeSelectedTrash"),
    danger: true,
  });
}

async function planSelectedToday(): Promise<void> {
  await runBulkAction((tasks) => taskStore.batchPlanToday(tasks), settingsStore.language === "zh-CN" ? "安排到今天" : "Plan for today");
}

async function rescheduleSelected(date: string): Promise<void> {
  if (!isValidCalendarDate(date)) {
    actionError.value = settingsStore.language === "zh-CN" ? "请选择有效日期。" : "Choose a valid date.";
    return;
  }
  await runBulkAction((tasks) => taskStore.batchReschedule(tasks, date), settingsStore.language === "zh-CN" ? "设置日期" : "Set date");
}

async function setSelectedPriority(priority: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
  await runBulkAction((tasks) => taskStore.batchSetPriority(tasks, priority), settingsStore.language === "zh-CN" ? "设置优先级" : "Set priority");
}

function setTaskSelected(task: TaskRecord, selected: boolean): void {
  if (bulkBusy.value) return;
  const nextSelectedIds = new Set(selectedTaskIds.value);
  if (selected) {
    nextSelectedIds.add(task.localId);
  } else {
    nextSelectedIds.delete(task.localId);
  }
  selectedTaskIds.value = nextSelectedIds;
}

function clearSelectedTasks(): void {
  selectedTaskIds.value = new Set();
}

function enterSelectionMode(): void {
  selectionMode.value = true;
  clearSelectedTasks();
}

function exitSelectionMode(): void {
  clearSelectedTasks();
  selectionMode.value = false;
}

async function resolveConflictUseServer(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.resolveConflictUseServer(task), settingsStore.t("sync.useServer"), {
    message: settingsStore.t("sync.useCloudConfirm"),
    confirmText: settingsStore.t("sync.useServer"),
    danger: true,
  });
}

async function forceOverwriteServer(task: TaskRecord): Promise<void> {
  await runTaskAction(task, () => taskStore.forceOverwriteServer(task), settingsStore.t("sync.overwriteServer"), {
    message: settingsStore.t("sync.overwriteCloudConfirm"),
    confirmText: settingsStore.t("sync.overwriteServer"),
    danger: true,
  });
}

function showNotice(message: string, duration = SHORT_NOTICE_MS): void {
  notice.value = message;
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = "";
    noticeTimer = undefined;
  }, duration);
}

onBeforeUnmount(() => {
  workspaceEpoch += 1;
  openRequestGeneration += 1;
  cancelRequestedAction();
  if (noticeTimer !== undefined) {
    window.clearTimeout(noticeTimer);
    noticeTimer = undefined;
  }
});

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const date = parseTaskBridgeDate(value);
  return date ? todayLocalDate(date, settingsStore.displayTimeZone) : null;
}

</script>

<template>
  <section class="view-shell task-workspace-view" :class="{ 'has-editor': editorOpen }">
    <header class="view-header">
      <div>
        <h1>{{ settingsStore.t("task.allTitle") }}</h1>
        <p class="view-subtitle">{{ taskStore.openTasks.length }} {{ settingsStore.t("task.openCountSuffix") }}</p>
      </div>
    </header>

    <div class="task-command-bar">
      <div class="task-search-field">
        <input
          ref="taskSearchInput"
          v-model="search"
          :disabled="bulkBusy"
          type="search"
          :aria-label="settingsStore.t('task.search')"
          :placeholder="settingsStore.t('task.search')"
        />
        <button
          v-if="search.trim()"
          class="icon-button"
          type="button"
          :aria-label="settingsStore.t('task.clearSearch')"
          :title="settingsStore.t('task.clearSearch')"
          :disabled="bulkBusy"
          @click="clearSearch"
        >
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
      <div class="task-command-actions">
        <button
          class="icon-button"
          type="button"
          :disabled="bulkBusy || selectableOpenTasks.length === 0"
          :aria-label="settingsStore.t('task.enterSelectionMode')"
          :title="settingsStore.t('task.enterSelectionMode')"
          @click="enterSelectionMode"
        >
          <ListChecks :size="17" aria-hidden="true" />
        </button>
        <button class="primary-button" type="button" :disabled="isSaving || bulkBusy" @click="openCreate">{{ settingsStore.t("task.add") }}</button>
      </div>
    </div>

    <div class="task-filter-toolbar">
      <div class="segment-control task-filter-segments" role="group" :aria-label="settingsStore.t('task.statusFilters')">
        <button
          v-for="option in primaryFilterOptions"
          :key="option.value"
          type="button"
          :class="{ active: isPrimaryFilterSelected(option.value) }"
          :disabled="bulkBusy"
          :aria-pressed="isPrimaryFilterSelected(option.value)"
          @click="setTaskFilter(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <TaskFilterPanel
        :criteria="criteria"
        :projects="taskStore.projects"
        :categories="taskStore.tags"
        :disabled="bulkBusy"
        @selection-change="toggleSelection"
      />
      <label class="task-sort-control">
        <ArrowDownWideNarrow :size="15" aria-hidden="true" />
        <select v-model="criteria.sortMode" :disabled="bulkBusy" :aria-label="settingsStore.language === 'zh-CN' ? '排序方式' : 'Sort tasks'">
          <option value="time">{{ settingsStore.language === "zh-CN" ? "按时间" : "By time" }}</option>
          <option value="category">{{ settingsStore.language === "zh-CN" ? "分类优先，组内按时间" : "Category, then time" }}</option>
        </select>
      </label>
      <SavedTaskViews :disabled="bulkBusy" @applied="clearSelectedTasks" />
    </div>

    <div v-if="hasActiveFilters" class="active-filter-bar" aria-live="polite">
      <div class="active-filter-chips">
        <button
          v-for="item in activeFilterItems"
          :key="item.id"
          class="active-filter-chip"
          type="button"
          :disabled="bulkBusy"
          :aria-label="`${settingsStore.t('task.clearFilters')}: ${item.label}`"
          @click="clearActiveFilter(item.key, item.value)"
        >
          <span>{{ item.label }}</span>
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
      <button ref="clearFiltersButton" class="text-button" type="button" :disabled="bulkBusy" @click="resetTaskFilters">
        {{ settingsStore.t("task.clearFilters") }}
      </button>
    </div>

    <div v-if="selectionMode" class="bulk-action-toolbar" role="group" :aria-label="settingsStore.t('task.bulkActions')" :aria-busy="bulkBusy">
      <span>{{ bulkActionCountLabel }}</span>
      <template v-if="bulkActionTargets.length > 0">
        <template v-if="trashOnly">
          <button class="secondary-button" type="button" :disabled="bulkBusy" @click="restoreSelectedTrashTasks">
            {{ settingsStore.t("task.restoreSelectedTrash") }}
          </button>
          <button class="secondary-button danger-outline-button" type="button" :disabled="bulkBusy" @click="purgeSelectedTrashTasks">
            {{ settingsStore.t("task.purgeSelectedTrash") }}
          </button>
        </template>
        <template v-else>
          <button class="secondary-button" type="button" :disabled="bulkBusy" @click="completeVisibleTasks">
            {{ settingsStore.t("task.completeVisible") }}
          </button>
          <TaskBatchSchedule :busy="bulkBusy" :default-date="todayDate" @plan-today="planSelectedToday" @reschedule="rescheduleSelected" @set-priority="setSelectedPriority" />
          <button class="secondary-button danger-outline-button" type="button" :disabled="bulkBusy" @click="deleteVisibleTasks">
            {{ settingsStore.t("task.deleteVisible") }}
          </button>
        </template>
      </template>
      <button class="text-button" type="button" :disabled="bulkBusy" @click="exitSelectionMode">
        {{ settingsStore.t("task.clearSelection") }}
      </button>
    </div>

    <p v-if="actionError" class="task-operation-error" role="alert">{{ actionError }}</p>

    <EditorDrawer
      v-if="editorOpen"
      :label="settingsStore.t(editingTask ? 'task.edit' : 'task.add')"
      @close="closeEditor"
    >
        <TaskEditor
          :key="editingTask?.localId ?? 'create'"
          :task="editingTask"
          :draft="editingTask ? undefined : captureStore.draft"
          :create-preset="editorCreatePreset"
          :is-saving="isSaving"
          :error-message="editorSaveError"
          error-id="task-editor-save-error"
          @save="save"
          @cancel="closeEditor"
          @dirty-change="setEditorDirty"
          @draft-change="updateCaptureDraft"
        />
    </EditorDrawer>

    <AppToast :message="notice" />

    <div class="task-list" :inert="bulkBusy" :aria-busy="bulkBusy">
      <TaskListSection
        v-for="section in taskSections"
        :key="section.key"
        :title="section.title"
        :tasks="section.tasks"
        :tone="section.tone"
        :trash="section.trash"
        :selectable="!section.trash || trashOnly"
        :selection-mode="selectionMode"
        :selected-task-ids="selectedTaskIds"
        @edit="openEdit"
        @selection-change="setTaskSelected"
        @complete="completeTask"
        @restore="restoreTask"
        @postpone="postponeTask"
        @snooze="snoozeTask"
        @plan-today="planTaskToday"
        @next-occurrence="createNextOccurrence"
        @instantiate-template="instantiateTemplate"
        @use-server="resolveConflictUseServer"
        @overwrite-server="forceOverwriteServer"
        @delete="deleteTask"
        @purge="purgeTask"
      />
      <div v-if="filteredTasks.length === 0" class="empty-state empty-state-action">
        <span>{{ emptyTaskStateText }}</span>
        <button class="secondary-button" type="button" @click="handleEmptyStateAction">{{ emptyTaskActionLabel }}</button>
      </div>
    </div>

    <ConfirmDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText"
      :cancel-text="confirmDialog.cancelText"
      :danger="confirmDialog.danger"
      @confirm="confirmRequestedAction"
      @cancel="cancelRequestedAction"
    />
  </section>
</template>

<style scoped>
.task-operation-error { margin: 0; padding: 8px 0; color: var(--danger); font-size: 13px; line-height: 1.6; }
</style>
