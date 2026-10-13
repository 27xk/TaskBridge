<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { ListChecks, SlidersHorizontal, X } from "lucide-vue-next";

import AppToast from "../components/AppToast.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import EditorDrawer from "../components/EditorDrawer.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskListSection from "../components/TaskListSection.vue";
import SavedTaskViews from "../components/SavedTaskViews.vue";
import TaskBatchSchedule from "../components/TaskBatchSchedule.vue";
import { useConfirmDialog, type ConfirmationOptions } from "../composables/useConfirmDialog";
import { useSettingsStore } from "../stores/settings";
import { useWorkspaceStore } from "../stores/workspace";
import { useCaptureStore } from "../stores/capture";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isCompletedStatus, isTaskOverdue, sortCompletedTasksByRecency } from "../utils/task-order";
import { parseTaskBridgeDate, todayLocalDate } from "../../shared/quick-add-parser";
import { getTaskActionConfirmationMessage, getTaskPriorityLabel, getTaskPriorityOptions } from "../../shared/task-ui-policy";
import { calendarWeekBounds, isValidCalendarDate, matchesTaskView } from "../../shared/workspace-view-state";
import type { TaskMutationResult } from "../../shared/task-mutation-policy";

const props = defineProps<{
  quickAddSignal?: number;
  searchSignal?: number;
  openTaskRequest?: { localId: string; nonce: number } | null;
}>();

const emit = defineEmits<{
  editorDirtyChange: [dirty: boolean];
}>();

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const captureStore = useCaptureStore();
let workspaceEpoch = 0;
const editorOpen = ref(false);
const editorDirty = ref(false);
const isSaving = ref(false);
const editorSaveError = ref("");
const editingTask = ref<TaskRecord | null>(null);
const search = computed({ get: () => workspaceStore.taskView.search, set: (value) => { workspaceStore.taskView.search = value; } });
const taskSearchInput = useTemplateRef<HTMLInputElement>("taskSearchInput");
const clearFiltersButton = useTemplateRef<HTMLButtonElement>("clearFiltersButton");
type TaskFilter = "all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates" | "trash";

const filter = computed<TaskFilter>({ get: () => workspaceStore.taskView.filter, set: (value) => { workspaceStore.taskView.filter = value; } });
const selectedProject = computed({ get: () => workspaceStore.taskView.project, set: (value) => { workspaceStore.taskView.project = value; } });
const selectedTag = computed({ get: () => workspaceStore.taskView.tag, set: (value) => { workspaceStore.taskView.tag = value; } });
const selectedPriority = computed({ get: () => workspaceStore.taskView.priority, set: (value) => { workspaceStore.taskView.priority = value; } });
const selectedStatus = computed({ get: () => workspaceStore.taskView.status, set: (value) => { workspaceStore.taskView.status = value; } });
const bulkBusy = ref(false);
const actionError = ref("");
const runningTaskActions = new Set<string>();
const priorityOptions = computed(() => getTaskPriorityOptions(settingsStore.language));
const todayDate = computed(() => todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone));
const statusOptions = computed(() => [
  { value: "all", label: settingsStore.language === "zh-CN" ? "全部状态" : "All statuses" },
  { value: "open", label: settingsStore.t("task.filterOpen") },
  { value: "completed", label: settingsStore.t("task.completedCountPrefix") },
]);
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

type ActiveFilterKey = "filter" | "project" | "tag" | "search" | "priority" | "status";
type ActiveFilterItem = { key: ActiveFilterKey; label: string };

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
  if (filter.value !== "all") {
    const option = [...primaryFilterOptions.value, ...secondaryFilterOptions.value].find((item) => item.value === filter.value);
    if (option) items.push({ key: "filter", label: option.label });
  }
  if (selectedProject.value) items.push({ key: "project", label: `${settingsStore.t("task.project")}: ${selectedProject.value}` });
  if (selectedTag.value) items.push({ key: "tag", label: `${settingsStore.t("task.tag")}: #${selectedTag.value}` });
  if (selectedPriority.value !== "all") items.push({ key: "priority", label: selectedPriority.value === "high" ? settingsStore.t("task.filterHigh") : `${settingsStore.t("task.priority")}: ${getTaskPriorityLabel(selectedPriority.value, settingsStore.language)}` });
  if (selectedStatus.value !== "all") items.push({ key: "status", label: statusOptions.value.find((option) => option.value === selectedStatus.value)?.label ?? "" });
  const keyword = search.value.trim();
  if (keyword) {
    items.push({ key: "search", label: settingsStore.language === "zh-CN" ? `搜索: ${keyword}` : `Search: ${keyword}` });
  }
  return items;
});
const hasActiveFilters = computed(() => activeFilterItems.value.length > 0);

const filteredTasks = computed(() => {
  const sourceTasks = filter.value === "trash" ? taskStore.trashTasks : taskStore.activeTasks;
  const today = todayDate.value;
  const week = calendarWeekBounds(today);
  return sourceTasks.filter((task) => matchesTaskView(task, workspaceStore.taskView, {
    today,
    week,
    taskDate: task.plannedDate ?? isoDate(task.dueTime),
    completed: isCompletedStatus(task.status),
    overdue: isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone),
  }));
});
const openFilteredTasks = computed(() => filteredTasks.value.filter((task) => !isCompletedStatus(task.status)));
const overdueFilteredTasks = computed(() =>
  openFilteredTasks.value.filter((task) => isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone)),
);
const pendingOpenFilteredTasks = computed(() =>
  openFilteredTasks.value.filter((task) => !isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone)),
);
const completedFilteredTasks = computed(() =>
  sortCompletedTasksByRecency(filteredTasks.value.filter((task) => isCompletedStatus(task.status))),
);
const shouldGroupByCompletion = computed(() => filter.value !== "completed" && filter.value !== "trash" && selectedStatus.value !== "completed");
const selectionMode = ref(false);
const selectedTaskIds = ref<Set<string>>(new Set());
const selectableOpenTasks = computed(() =>
  filter.value === "trash"
    ? filteredTasks.value
    : filter.value === "completed"
      ? []
    : openFilteredTasks.value.filter((task) => !task.isTemplate),
);
const bulkActionTargets = computed(() => selectableOpenTasks.value.filter((task) => selectedTaskIds.value.has(task.localId)));
const bulkActionCountLabel = computed(() =>
  `${bulkActionTargets.value.length} ${settingsStore.t("task.selectedCountSuffix")}`,
);
const canCreateIntoCurrentEmptyView = computed(
  () => createVisibleEmptyFilters.has(filter.value) && !selectedProject.value && !selectedTag.value && !search.value.trim() && selectedPriority.value === "all" && selectedStatus.value === "all",
);
const emptyTaskActionLabel = computed(() =>
  canCreateIntoCurrentEmptyView.value ? settingsStore.t("task.add") : settingsStore.t("task.showAllTasks"),
);
const emptyTaskStateText = computed(() => {
  if (filter.value === "trash") return settingsStore.t("task.emptyTrash");
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
  (value) => {
    if (value && value > 0) void openCreate();
  },
  { immediate: true },
);

watch(
  () => props.openTaskRequest,
  async (request) => {
    if (!request) return;
    const epoch = workspaceEpoch;
    try {
      if (taskStore.tasks.length === 0) await taskStore.load();
      if (epoch !== workspaceEpoch) return;
      const task = taskStore.tasks.find((item) => item.localId === request.localId);
      if (task) await openEdit(task);
    } catch (error) {
      if (epoch !== workspaceEpoch) return;
      actionError.value = settingsStore.language === "zh-CN" ? "暂时无法打开任务，请重试。" : "The task could not be opened. Please try again.";
      console.error("Unable to open requested task", error);
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
  if (editorOpen.value && !editingTask.value) return;
  const epoch = workspaceEpoch;
  if (!(await canLeaveEditor()) || epoch !== workspaceEpoch) return;
  editorSaveError.value = "";
  editorCreatePreset.value = filter.value === "today" ? "today" : "default";
  editingTask.value = null;
  setEditorDirty(false);
  editorOpen.value = true;
}

async function resetTaskFilters(): Promise<void> {
  filter.value = "all";
  selectedProject.value = "";
  selectedTag.value = "";
  selectedPriority.value = "all";
  selectedStatus.value = "all";
  search.value = "";
  clearSelectedTasks();
  await nextTick();
  taskSearchInput.value?.focus();
}

function setTaskFilter(nextFilter: TaskFilter): void {
  filter.value = nextFilter;
  if (nextFilter === "completed") selectedStatus.value = "all";
  clearSelectedTasks();
}

function changeStatusFilter(): void {
  if (filter.value === "completed" && selectedStatus.value === "open") filter.value = "all";
  clearSelectedTasks();
}

async function clearActiveFilter(key: ActiveFilterKey): Promise<void> {
  if (key === "filter") filter.value = "all";
  if (key === "project") selectedProject.value = "";
  if (key === "tag") selectedTag.value = "";
  if (key === "search") search.value = "";
  if (key === "priority") selectedPriority.value = "all";
  if (key === "status") selectedStatus.value = "all";
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

async function openEdit(task: TaskRecord): Promise<void> {
  if (editorOpen.value && editingTask.value?.localId === task.localId) return;
  const epoch = workspaceEpoch;
  if (!(await canLeaveEditor()) || epoch !== workspaceEpoch) return;
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
          :class="{ active: filter === option.value }"
          :disabled="bulkBusy"
          :aria-pressed="filter === option.value"
          @click="setTaskFilter(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <details class="filter-menu">
        <summary :aria-label="settingsStore.t('task.moreFilters')">
          <SlidersHorizontal :size="16" aria-hidden="true" />
          <span>{{ settingsStore.t("task.moreFilters") }}</span>
        </summary>
        <div class="filter-menu-panel">
          <section class="filter-menu-section">
            <span class="filter-menu-label">{{ settingsStore.t("task.moreFilters") }}</span>
            <button
              v-for="option in secondaryFilterOptions"
              :key="option.value"
              type="button"
              :class="{ active: filter === option.value }"
              :disabled="bulkBusy"
              :aria-pressed="filter === option.value"
              @click="setTaskFilter(option.value)"
            >
              {{ option.label }}
            </button>
          </section>
          <section class="filter-menu-section">
            <span class="filter-menu-label">{{ settingsStore.t("task.projectTagFilters") }}</span>
            <div class="filter-selects">
              <select
                v-model="selectedProject"
                :disabled="bulkBusy"
                :aria-label="settingsStore.t('task.allProjects')"
                @change="clearSelectedTasks"
              >
                <option value="">{{ settingsStore.t("task.allProjects") }}</option>
                <option v-for="project in taskStore.projects" :key="project" :value="project">{{ project }}</option>
              </select>
              <select
                v-model="selectedTag"
                :disabled="bulkBusy"
                :aria-label="settingsStore.t('task.allTags')"
                @change="clearSelectedTasks"
              >
                <option value="">{{ settingsStore.t("task.allTags") }}</option>
                <option v-for="tag in taskStore.tags" :key="tag" :value="tag">#{{ tag }}</option>
              </select>
            </div>
          </section>
          <section class="filter-menu-section">
            <span class="filter-menu-label">{{ settingsStore.language === "zh-CN" ? "状态与优先级" : "Status and priority" }}</span>
            <div class="filter-selects">
              <select v-model="selectedStatus" :disabled="bulkBusy" :aria-label="settingsStore.t('task.statusFilters')" @change="changeStatusFilter">
                <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-model="selectedPriority" :disabled="bulkBusy" :aria-label="settingsStore.t('task.priority')" @change="clearSelectedTasks">
                <option value="all">{{ settingsStore.language === "zh-CN" ? "全部优先级" : "All priorities" }}</option>
                <option value="high">{{ settingsStore.language === "zh-CN" ? "高及以上" : "High and above" }}</option>
                <option v-for="option in priorityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
          </section>
        </div>
      </details>
      <SavedTaskViews :disabled="bulkBusy" @applied="clearSelectedTasks" />
    </div>

    <div v-if="hasActiveFilters" class="active-filter-bar" aria-live="polite">
      <div class="active-filter-chips">
        <button
          v-for="item in activeFilterItems"
          :key="item.key"
          class="active-filter-chip"
          type="button"
          :disabled="bulkBusy"
          :aria-label="`${settingsStore.t('task.clearFilters')}: ${item.label}`"
          @click="clearActiveFilter(item.key)"
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
        <template v-if="filter === 'trash'">
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
      <template v-if="filter === 'trash'">
        <TaskListSection
          :tasks="filteredTasks"
          trash
          selectable
          :selection-mode="selectionMode"
          :selected-task-ids="selectedTaskIds"
          @selection-change="setTaskSelected"
          @restore="restoreTask"
          @purge="purgeTask"
        />
      </template>
      <template v-else-if="shouldGroupByCompletion">
        <TaskListSection
          :title="settingsStore.t('task.filterOverdue')"
          :tasks="overdueFilteredTasks"
          tone="overdue"
          selectable
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
        />

        <TaskListSection
          :title="settingsStore.t('task.filterOpen')"
          :tasks="pendingOpenFilteredTasks"
          selectable
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
        />

        <TaskListSection
          :title="settingsStore.t('task.completedCountPrefix')"
          :tasks="completedFilteredTasks"
          tone="completed"
          :selected-task-ids="selectedTaskIds"
          @edit="openEdit"
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
        />
      </template>
      <template v-else>
        <TaskListSection
          :tasks="completedFilteredTasks"
          :selected-task-ids="selectedTaskIds"
          @edit="openEdit"
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
        />
      </template>
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
