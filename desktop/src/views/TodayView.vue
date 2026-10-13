<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";

import AppToast from "../components/AppToast.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import EditorDrawer from "../components/EditorDrawer.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskListSection from "../components/TaskListSection.vue";
import WorkspaceQuickAdd from "../components/WorkspaceQuickAdd.vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { useCaptureStore } from "../stores/capture";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isCompletedStatus, isTaskOverdue, sortTasksByTimeline } from "../utils/task-order";
import { todayLocalDate } from "../../shared/quick-add-parser";
import { getTaskActionConfirmationMessage } from "../../shared/task-ui-policy";

interface WorkspaceQuickAddHandle {
  clear(submittedTitle: string): boolean;
  focus(): void;
}

const taskStore = useTaskStore();
const authStore = useAuthStore();
const captureStore = useCaptureStore();
const captureTitle = computed({
  get: () => captureStore.draft.title,
  set: (title: string) => captureStore.updateDraft({ ...captureStore.draft, title }),
});
const actionBusy = ref(false);
const settingsStore = useSettingsStore();
const emit = defineEmits<{
  editorDirtyChange: [dirty: boolean];
}>();
const editorOpen = ref(false);
const editorDirty = ref(false);
const isSaving = ref(false);
const editingTask = ref<TaskRecord | null>(null);
const quickAddRef = useTemplateRef<WorkspaceQuickAddHandle>("quickAdd");
const quickAddError = ref("");
const editorSaveError = ref("");
const isQuickAdding = ref(false);
const notice = ref("");
let noticeTimer: number | undefined;
const {
  confirmDialog,
  requestConfirmation,
  confirmRequestedAction,
  cancelRequestedAction,
} = useConfirmDialog(() => settingsStore.language);

const openTodayTasks = computed(() =>
  sortTasksByTimeline(
    taskStore.todayTasks.filter((task) => !task.isDeleted && !isCompletedStatus(task.status)),
    { now: taskStore.timelineNow, displayTimeZone: settingsStore.displayTimeZone },
  ),
);
const overdueTodayTasks = computed(() =>
  openTodayTasks.value.filter((task) => isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone)),
);
const upcomingTodayTasks = computed(() =>
  openTodayTasks.value.filter((task) => !isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone)),
);

function setEditorDirty(dirty: boolean): void {
  editorDirty.value = dirty;
  emit("editorDirtyChange", Boolean(editingTask.value && dirty));
}

async function canSwitchEditor(): Promise<boolean> {
  if (isSaving.value) return false;
  if (!editingTask.value || !editorDirty.value) return true;
  return requestConfirmation({ message: settingsStore.t("task.discardChangesConfirm"), danger: true });
}

async function openCreate(): Promise<void> {
  if (editorOpen.value && !editingTask.value) return;
  const workspaceKey = authStore.workspaceKey;
  if (!(await canSwitchEditor()) || workspaceKey !== authStore.workspaceKey) return;
  editorSaveError.value = "";
  editingTask.value = null;
  setEditorDirty(false);
  editorOpen.value = true;
}

async function openEdit(task: TaskRecord): Promise<void> {
  if (editorOpen.value && editingTask.value?.localId === task.localId) return;
  const workspaceKey = authStore.workspaceKey;
  if (!(await canSwitchEditor()) || workspaceKey !== authStore.workspaceKey) return;
  editorSaveError.value = "";
  editingTask.value = task;
  setEditorDirty(false);
  editorOpen.value = true;
}

function updateCreateDraft(draft: TaskDraft): void {
  if (!editingTask.value) captureStore.updateDraft(draft);
}

async function closeEditor(): Promise<void> {
  if (isSaving.value) return;
  if (
    editingTask.value && editorDirty.value &&
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
  const workspaceKey = authStore.workspaceKey;
  const task = editingTask.value;
  if (!task) captureStore.updateDraft(draft);
  const captured = captureStore.snapshot();
  editorSaveError.value = "";
  isSaving.value = true;
  try {
    if (task) await taskStore.updateTask(task, draft);
    else await taskStore.addTask(draft);
    if (workspaceKey !== authStore.workspaceKey) return;
    if (!task) captureStore.clearIfCurrent(captured);
    editorOpen.value = false;
    editingTask.value = null;
    setEditorDirty(false);
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    if (workspaceKey === authStore.workspaceKey) editorSaveError.value = settingsStore.t("task.saveFailed");
  } finally {
    isSaving.value = false;
  }
}

async function quickAddTask(title: string): Promise<void> {
  if (isQuickAdding.value) return;
  const captured = captureStore.snapshot();
  isQuickAdding.value = true;
  quickAddError.value = "";
  try {
    await taskStore.addTask({
      ...captured.draft,
      title,
      listType: captured.draft.listType || "today",
      plannedDate: captured.draft.plannedDate ?? todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone),
    });
    if (captured.workspaceKey !== authStore.workspaceKey) return;
    captureStore.clearIfCurrent(captured);
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    if (captured.workspaceKey === authStore.workspaceKey) quickAddError.value = settingsStore.t("task.saveFailed");
  } finally {
    isQuickAdding.value = false;
    await nextTick();
    quickAddRef.value?.focus();
  }
}

async function runTaskAction(action: () => Promise<unknown>, message?: string): Promise<void> {
  if (actionBusy.value) return;
  const previousUndoId = taskStore.pendingUndo?.id;
  notice.value = "";
  actionBusy.value = true;
  try {
    await action();
    if (message && (!taskStore.pendingUndo || taskStore.pendingUndo.id === previousUndoId)) showNotice(message);
  } catch {
    showNotice(settingsStore.language === "zh-CN" ? "操作未完成，请重试。" : "The action could not be completed. Try again.");
  } finally {
    actionBusy.value = false;
  }
}

async function completeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(() => taskStore.completeTask(task));
}

async function restoreTask(task: TaskRecord): Promise<void> {
  await runTaskAction(() => taskStore.restoreTask(task), `${settingsStore.t("task.feedbackRestored")}：${task.title}`);
}

async function deleteTask(task: TaskRecord): Promise<void> {
  const message = getTaskActionConfirmationMessage("delete", task.title, settingsStore.language);
  if (message && !(await requestConfirmation({ message, confirmText: settingsStore.t("task.delete"), danger: true }))) return;
  await runTaskAction(() => taskStore.deleteTask(task));
}

async function postponeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(() => taskStore.postponeTomorrow(task));
}

async function planTaskToday(task: TaskRecord): Promise<void> {
  await runTaskAction(() => taskStore.planToday(task));
}

async function snoozeTask(task: TaskRecord): Promise<void> {
  await runTaskAction(() => taskStore.snoozeOneHour(task));
}

async function resolveConflictUseServer(task: TaskRecord): Promise<void> {
  const workspaceKey = authStore.workspaceKey;
  if (actionBusy.value || !(await requestConfirmation({
    message: settingsStore.t("sync.useCloudConfirm"), confirmText: settingsStore.t("sync.useServer"), danger: true,
  }))) return;
  if (workspaceKey !== authStore.workspaceKey) return;
  await runTaskAction(() => taskStore.resolveConflictUseServer(task), settingsStore.t("sync.useServer"));
}

async function forceOverwriteServer(task: TaskRecord): Promise<void> {
  const workspaceKey = authStore.workspaceKey;
  if (actionBusy.value || !(await requestConfirmation({
    message: settingsStore.t("sync.overwriteCloudConfirm"), confirmText: settingsStore.t("sync.overwriteServer"), danger: true,
  }))) return;
  if (workspaceKey !== authStore.workspaceKey) return;
  await runTaskAction(() => taskStore.forceOverwriteServer(task), settingsStore.t("sync.overwriteServer"));
}

function showNotice(message: string): void {
  notice.value = message;
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = "";
    noticeTimer = undefined;
  }, 1800);
}

onBeforeUnmount(() => {
  cancelRequestedAction();
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
});

</script>

<template>
  <section class="view-shell today-view" :class="{ 'has-editor': editorOpen }">
    <header class="view-header">
      <div>
        <h1>{{ settingsStore.t("nav.today") }}</h1>
        <p class="view-count">{{ openTodayTasks.length }} {{ settingsStore.t("task.todayCountSuffix") }}</p>
      </div>
    </header>

    <WorkspaceQuickAdd
      ref="quickAdd"
      v-model="captureTitle"
      :disabled="isQuickAdding"
      :editor-open="editorOpen && !editingTask"
      :invalid="Boolean(quickAddError)"
      :error-id="'today-quick-add-error'"
      @submit="quickAddTask"
      @open-editor="openCreate"
    />
    <p id="today-quick-add-error" v-if="quickAddError" class="inline-error quick-add-error" role="alert" aria-live="assertive">
      {{ quickAddError }}
    </p>

    <EditorDrawer
      v-if="editorOpen"
      :label="settingsStore.t(editingTask ? 'task.edit' : 'task.todayTitle')"
      @close="closeEditor"
    >
        <TaskEditor
          :key="editingTask?.localId ?? 'create'"
          :task="editingTask"
          :draft="editingTask ? undefined : captureStore.draft"
          :title="settingsStore.t('task.todayTitle')"
          :create-preset="editingTask ? 'default' : 'today'"
          :is-saving="isSaving"
          :error-message="editorSaveError"
          error-id="today-editor-save-error"
          @save="save"
          @cancel="closeEditor"
          @dirty-change="setEditorDirty"
          @draft-change="updateCreateDraft"
        />
    </EditorDrawer>

    <div class="today-workspace">
      <div class="task-list today-task-list">
          <TaskListSection
            v-if="overdueTodayTasks.length > 0"
            :title="settingsStore.t('task.filterOverdue')"
            tone="overdue"
            :tasks="overdueTodayTasks"
            :busy="actionBusy"
            @edit="openEdit"
            @complete="completeTask"
            @restore="restoreTask"
            @postpone="postponeTask"
            @snooze="snoozeTask"
            @plan-today="planTaskToday"
            @next-occurrence="taskStore.createNextOccurrence"
            @instantiate-template="taskStore.instantiateTemplate"
            @use-server="resolveConflictUseServer"
            @overwrite-server="forceOverwriteServer"
            @delete="deleteTask"
          />

          <TaskListSection
            v-if="upcomingTodayTasks.length > 0"
            :title="settingsStore.t('task.upcomingToday')"
            :tasks="upcomingTodayTasks"
            :busy="actionBusy"
            @edit="openEdit"
            @complete="completeTask"
            @restore="restoreTask"
            @postpone="postponeTask"
            @snooze="snoozeTask"
            @plan-today="planTaskToday"
            @next-occurrence="taskStore.createNextOccurrence"
            @instantiate-template="taskStore.instantiateTemplate"
            @use-server="resolveConflictUseServer"
            @overwrite-server="forceOverwriteServer"
            @delete="deleteTask"
          />

        <div v-if="openTodayTasks.length === 0" class="empty-state empty-state-action">
          <span>{{ settingsStore.t("task.emptyToday") }}</span>
          <button class="secondary-button" type="button" @click="openCreate">{{ settingsStore.t("task.addToday") }}</button>
        </div>
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
    <AppToast :message="notice" />
  </section>
</template>
