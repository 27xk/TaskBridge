<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import AppToast from "../components/AppToast.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import EditorDrawer from "../components/EditorDrawer.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskListSection from "../components/TaskListSection.vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { useSettingsStore } from "../stores/settings";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isCompletedStatus, isTaskOverdue, sortCompletedTasksByRecency } from "../utils/task-order";
import { parseTaskBridgeDate, todayLocalDate } from "../../shared/quick-add-parser";
import { getTaskActionConfirmationMessage } from "../../shared/task-ui-policy";

const props = defineProps<{
  quickAddSignal?: number;
  openTaskRequest?: { localId: string; nonce: number } | null;
}>();

const emit = defineEmits<{
  editorDirtyChange: [dirty: boolean];
}>();

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const editorOpen = ref(false);
const editorDirty = ref(false);
const isSaving = ref(false);
const editorSaveError = ref("");
const editingTask = ref<TaskRecord | null>(null);
const search = ref("");
type TaskFilter = "all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates" | "trash";

const filter = ref<TaskFilter>("all");
const selectedProject = ref("");
const selectedTag = ref("");
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

const primaryFilterValues: TaskFilter[] = ["all", "today", "overdue", "completed"];
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
const secondaryFilter = computed<TaskFilter | "">({
  get: () => (primaryFilterValues.includes(filter.value) ? "" : filter.value),
  set: (value) => {
    filter.value = value || "all";
  },
});
const activeFilterLabels = computed(() => {
  const labels: string[] = [];
  if (filter.value !== "all") {
    const option = [...primaryFilterOptions.value, ...secondaryFilterOptions.value].find((item) => item.value === filter.value);
    if (option) labels.push(option.label);
  }
  if (selectedProject.value) labels.push(`${settingsStore.t("task.project")}: ${selectedProject.value}`);
  if (selectedTag.value) labels.push(`${settingsStore.t("task.tag")}: #${selectedTag.value}`);
  const keyword = search.value.trim();
  if (keyword) {
    labels.push(settingsStore.language === "zh-CN" ? `搜索: ${keyword}` : `Search: ${keyword}`);
  }
  return labels;
});
const hasActiveFilters = computed(() => activeFilterLabels.value.length > 0);

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const sourceTasks = filter.value === "trash" ? taskStore.trashTasks : taskStore.activeTasks;
  return sourceTasks.filter((task) => {
    if (selectedProject.value && task.project !== selectedProject.value) return false;
    if (selectedTag.value && task.tag !== selectedTag.value) return false;
    if (!matchesFilter(task, filter.value)) return false;
    if (!keyword) return true;
    return `${task.title} ${task.content ?? ""} ${task.tag ?? ""} ${task.project ?? ""}`.toLowerCase().includes(keyword);
  });
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
const shouldGroupByCompletion = computed(() => filter.value !== "completed" && filter.value !== "trash");
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
  `${bulkActionTargets.value.length} ${settingsStore.t(filter.value === "trash" ? "task.selectedCountSuffix" : "task.openCountSuffix")}`,
);
const canCreateIntoCurrentEmptyView = computed(
  () => createVisibleEmptyFilters.has(filter.value) && !selectedProject.value && !selectedTag.value && !search.value.trim(),
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
const editorCreatePreset = computed<"default" | "today">(() => (filter.value === "today" ? "today" : "default"));

function setEditorDirty(dirty: boolean): void {
  editorDirty.value = dirty;
  emit("editorDirtyChange", dirty);
}

watch(
  () => props.quickAddSignal,
  (value) => {
    if (value && value > 0) openCreate();
  },
  { immediate: true },
);

watch(
  () => props.openTaskRequest,
  async (request) => {
    if (!request) return;
    if (taskStore.tasks.length === 0) await taskStore.load();
    const task = taskStore.tasks.find((item) => item.localId === request.localId);
    if (task) openEdit(task);
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

function openCreate(): void {
  editorSaveError.value = "";
  editingTask.value = null;
  setEditorDirty(false);
  editorOpen.value = true;
}

function resetTaskFilters(): void {
  filter.value = "all";
  selectedProject.value = "";
  selectedTag.value = "";
  search.value = "";
  clearSelectedTasks();
}

function handleEmptyStateAction(): void {
  if (canCreateIntoCurrentEmptyView.value) {
    openCreate();
    return;
  }
  resetTaskFilters();
}

function openEdit(task: TaskRecord): void {
  editorSaveError.value = "";
  editingTask.value = task;
  setEditorDirty(false);
  editorOpen.value = true;
}

async function closeEditor(): Promise<void> {
  if (isSaving.value) return;
  if (
    editorDirty.value &&
    !(await requestConfirmation({
      message: settingsStore.t("task.discardChangesConfirm"),
      danger: true,
    }))
  ) {
    return;
  }
  editorOpen.value = false;
  editingTask.value = null;
  setEditorDirty(false);
}

async function save(draft: TaskDraft): Promise<void> {
  if (isSaving.value) return;
  editorSaveError.value = "";
  isSaving.value = true;
  try {
    if (editingTask.value) {
      await taskStore.updateTask(editingTask.value, draft);
    } else {
      await taskStore.addTask(draft);
    }
    editorOpen.value = false;
    editingTask.value = null;
    setEditorDirty(false);
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    editorSaveError.value = settingsStore.t("task.saveFailed");
  } finally {
    isSaving.value = false;
  }
}

async function completeTask(task: TaskRecord): Promise<void> {
  await taskStore.completeTask(task);
  showNotice(`${settingsStore.t("task.feedbackCompleted")}：${task.title}`);
}

async function restoreTask(task: TaskRecord): Promise<void> {
  await taskStore.restoreTask(task);
  showNotice(`${settingsStore.t("task.feedbackRestored")}：${task.title}`);
}

async function deleteTask(task: TaskRecord): Promise<void> {
  const message = getTaskActionConfirmationMessage("delete", task.title, settingsStore.language);
  if (
    message &&
    !(await requestConfirmation({
      message,
      confirmText: settingsStore.t("task.delete"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.deleteTask(task);
  showNotice(`${settingsStore.t("task.feedbackDeleted")}：${task.title}`, IMPORTANT_NOTICE_MS);
}

async function purgeTask(task: TaskRecord): Promise<void> {
  if (
    !(await requestConfirmation({
      message: settingsStore.t("task.purgeConfirm").replace("{title}", task.title),
      confirmText: settingsStore.t("task.purge"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.purgeTask(task);
  showNotice(`${settingsStore.t("task.feedbackPurged")}：${task.title}`, IMPORTANT_NOTICE_MS);
}

async function completeVisibleTasks(): Promise<void> {
  if (bulkActionTargets.value.length === 0) return;
  const count = bulkActionTargets.value.length;
  if (
    !(await requestConfirmation({
      message: settingsStore.t("task.completeVisibleConfirm").replace("{count}", String(count)),
      confirmText: settingsStore.t("task.completeVisible"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.batchComplete(bulkActionTargets.value);
  clearSelectedTasks();
  showNotice(settingsStore.t("task.feedbackBatchCompleted"), IMPORTANT_NOTICE_MS);
}

async function deleteVisibleTasks(): Promise<void> {
  const count = bulkActionTargets.value.length;
  if (count === 0) return;
  if (
    !(await requestConfirmation({
      message: settingsStore.t("task.deleteVisibleConfirm").replace("{count}", String(count)),
      confirmText: settingsStore.t("task.deleteVisible"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.batchDelete(bulkActionTargets.value);
  clearSelectedTasks();
  showNotice(settingsStore.t("task.feedbackBatchDeleted"), IMPORTANT_NOTICE_MS);
}

async function restoreSelectedTrashTasks(): Promise<void> {
  const count = bulkActionTargets.value.length;
  if (count === 0) return;
  await taskStore.batchRestore(bulkActionTargets.value);
  clearSelectedTasks();
  showNotice(settingsStore.t("task.feedbackBatchRestored"), IMPORTANT_NOTICE_MS);
}

async function purgeSelectedTrashTasks(): Promise<void> {
  const count = bulkActionTargets.value.length;
  if (count === 0) return;
  if (
    !(await requestConfirmation({
      message: settingsStore.t("task.purgeSelectedConfirm").replace("{count}", String(count)),
      confirmText: settingsStore.t("task.purgeSelectedTrash"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.batchPurge(bulkActionTargets.value);
  clearSelectedTasks();
  showNotice(settingsStore.t("task.feedbackBatchPurged"), IMPORTANT_NOTICE_MS);
}

function setTaskSelected(task: TaskRecord, selected: boolean): void {
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

async function resolveConflictUseServer(task: TaskRecord): Promise<void> {
  if (
    !(await requestConfirmation({
      message: settingsStore.t("sync.useCloudConfirm"),
      confirmText: settingsStore.t("sync.useServer"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.resolveConflictUseServer(task);
  showNotice(settingsStore.t("sync.useServer"), IMPORTANT_NOTICE_MS);
}

async function forceOverwriteServer(task: TaskRecord): Promise<void> {
  if (
    !(await requestConfirmation({
      message: settingsStore.t("sync.overwriteCloudConfirm"),
      confirmText: settingsStore.t("sync.overwriteServer"),
      danger: true,
    }))
  ) {
    return;
  }
  await taskStore.forceOverwriteServer(task);
  showNotice(settingsStore.t("sync.overwriteServer"), IMPORTANT_NOTICE_MS);
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
  if (noticeTimer !== undefined) {
    window.clearTimeout(noticeTimer);
    noticeTimer = undefined;
  }
});

function matchesFilter(task: TaskRecord, mode: TaskFilter): boolean {
  const today = todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone);
  const taskDate = task.plannedDate ?? isoDate(task.dueTime);
  switch (mode) {
    case "inbox":
      return task.listType === "inbox" && !isCompletedStatus(task.status);
    case "today":
      return taskDate === today || task.listType === "today";
    case "overdue":
      return isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone);
    case "week":
      return Boolean(
        taskDate &&
          taskDate >= today &&
          taskDate <= todayLocalDate(new Date(taskStore.timelineNow.getTime() + 7 * 86_400_000), settingsStore.displayTimeZone),
      );
    case "high":
      return !isCompletedStatus(task.status) && task.priority >= 3;
    case "completed":
      return isCompletedStatus(task.status);
    case "pending":
      return task.syncStatus !== "synced";
    case "conflict":
      return task.syncStatus === "conflict";
    case "templates":
      return task.isTemplate;
    case "trash":
      return task.isDeleted;
    default:
      return true;
  }
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const date = parseTaskBridgeDate(value);
  return date ? todayLocalDate(date, settingsStore.displayTimeZone) : null;
}

</script>

<template>
  <section class="view-shell">
    <header class="view-header">
      <div>
        <p class="eyebrow">{{ settingsStore.t("task.allTitle") }}</p>
        <h1>{{ taskStore.openTasks.length }} {{ settingsStore.t("task.openCountSuffix") }}</h1>
      </div>
      <button class="primary-button" type="button" @click="openCreate">{{ settingsStore.t("task.add") }}</button>
    </header>

    <div class="toolbar search-toolbar">
      <input
        v-model="search"
        type="search"
        :aria-label="settingsStore.t('task.search')"
        :placeholder="settingsStore.t('task.search')"
      />
      <button v-if="search.trim()" class="ghost-button" type="button" @click="search = ''">
        {{ settingsStore.t("task.clearSearch") }}
      </button>
      <span>{{ settingsStore.t("task.completedCountPrefix") }} {{ taskStore.completedTasks.length }}</span>
    </div>

    <div class="filter-toolbar">
      <div class="filter-strip" role="group" :aria-label="settingsStore.t('task.statusFilters')">
        <button
          v-for="option in primaryFilterOptions"
          :key="option.value"
          type="button"
          :class="{ active: filter === option.value }"
          :aria-pressed="filter === option.value"
          @click="filter = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="filter-selects">
        <select v-model="secondaryFilter" :aria-label="settingsStore.t('task.moreFilters')">
          <option value="">{{ settingsStore.t("task.moreFilters") }}</option>
          <option v-for="option in secondaryFilterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <details class="filter-advanced-details">
        <summary>{{ settingsStore.t("task.projectTagFilters") }}</summary>
        <div class="filter-selects">
          <select v-model="selectedProject" :aria-label="settingsStore.t('task.allProjects')">
            <option value="">{{ settingsStore.t("task.allProjects") }}</option>
            <option v-for="project in taskStore.projects" :key="project" :value="project">{{ project }}</option>
          </select>
          <select v-model="selectedTag" :aria-label="settingsStore.t('task.allTags')">
            <option value="">{{ settingsStore.t("task.allTags") }}</option>
            <option v-for="tag in taskStore.tags" :key="tag" :value="tag">#{{ tag }}</option>
          </select>
        </div>
      </details>
    </div>

    <div v-if="hasActiveFilters" class="active-filter-bar" aria-live="polite">
      <span class="active-filter-label">{{ settingsStore.t("task.currentFilters") }}</span>
      <div class="active-filter-chips">
        <span v-for="label in activeFilterLabels" :key="label" class="active-filter-chip">{{ label }}</span>
      </div>
      <button class="text-button" type="button" @click="resetTaskFilters">
        {{ settingsStore.t("task.clearFilters") }}
      </button>
    </div>

    <div v-if="bulkActionTargets.length > 0" class="bulk-action-toolbar" role="group" :aria-label="settingsStore.t('task.bulkActions')">
      <span>{{ bulkActionCountLabel }}</span>
      <template v-if="filter === 'trash'">
        <button class="secondary-button" type="button" @click="restoreSelectedTrashTasks">
          {{ settingsStore.t("task.restoreSelectedTrash") }}
        </button>
        <button class="secondary-button danger-outline-button" type="button" @click="purgeSelectedTrashTasks">
          {{ settingsStore.t("task.purgeSelectedTrash") }}
        </button>
      </template>
      <template v-else>
        <button class="secondary-button" type="button" @click="completeVisibleTasks">
          {{ settingsStore.t("task.completeVisible") }}
        </button>
        <button class="secondary-button danger-outline-button" type="button" @click="deleteVisibleTasks">
          {{ settingsStore.t("task.deleteVisible") }}
        </button>
      </template>
      <button class="text-button" type="button" @click="clearSelectedTasks">
        {{ settingsStore.t("task.clearSelection") }}
      </button>
    </div>

    <EditorDrawer
      v-if="editorOpen"
      :label="settingsStore.t(editingTask ? 'task.edit' : 'task.add')"
      @close="closeEditor"
    >
        <TaskEditor
          :task="editingTask"
          :create-preset="editorCreatePreset"
          :is-saving="isSaving"
          :error-message="editorSaveError"
          error-id="task-editor-save-error"
          @save="save"
          @cancel="closeEditor"
          @dirty-change="setEditorDirty"
        />
    </EditorDrawer>

    <AppToast :message="notice" />

    <div class="task-list">
      <template v-if="filter === 'trash'">
        <TaskListSection
          :tasks="filteredTasks"
          trash
          selectable
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
          :selected-task-ids="selectedTaskIds"
          @edit="openEdit"
          @selection-change="setTaskSelected"
          @complete="completeTask"
          @restore="restoreTask"
          @postpone="taskStore.postponeTomorrow"
          @snooze="taskStore.snoozeOneHour"
          @plan-today="taskStore.planToday"
          @next-occurrence="taskStore.createNextOccurrence"
          @instantiate-template="taskStore.instantiateTemplate"
          @use-server="resolveConflictUseServer"
          @overwrite-server="forceOverwriteServer"
          @delete="deleteTask"
        />

        <TaskListSection
          :title="settingsStore.t('task.filterOpen')"
          :tasks="pendingOpenFilteredTasks"
          selectable
          :selected-task-ids="selectedTaskIds"
          @edit="openEdit"
          @selection-change="setTaskSelected"
          @complete="completeTask"
          @restore="restoreTask"
          @postpone="taskStore.postponeTomorrow"
          @snooze="taskStore.snoozeOneHour"
          @plan-today="taskStore.planToday"
          @next-occurrence="taskStore.createNextOccurrence"
          @instantiate-template="taskStore.instantiateTemplate"
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
          @postpone="taskStore.postponeTomorrow"
          @snooze="taskStore.snoozeOneHour"
          @plan-today="taskStore.planToday"
          @next-occurrence="taskStore.createNextOccurrence"
          @instantiate-template="taskStore.instantiateTemplate"
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
          @postpone="taskStore.postponeTomorrow"
          @snooze="taskStore.snoozeOneHour"
          @plan-today="taskStore.planToday"
          @next-occurrence="taskStore.createNextOccurrence"
          @instantiate-template="taskStore.instantiateTemplate"
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
