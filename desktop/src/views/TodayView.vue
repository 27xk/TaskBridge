<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";

import AppToast from "../components/AppToast.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import EditorDrawer from "../components/EditorDrawer.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import WorkspaceQuickAdd from "../components/WorkspaceQuickAdd.vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { useSettingsStore } from "../stores/settings";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isCompletedStatus, isTaskOverdue, sortTasksByTimeline } from "../utils/task-order";
import { todayLocalDate } from "../../shared/quick-add-parser";
import { getTaskActionConfirmationMessage } from "../../shared/task-ui-policy";

interface WorkspaceQuickAddHandle {
  clear(submittedTitle: string): boolean;
  focus(): void;
}

const taskStore = useTaskStore();
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
  emit("editorDirtyChange", dirty);
}

function openCreate(): void {
  editorSaveError.value = "";
  editingTask.value = null;
  setEditorDirty(false);
  editorOpen.value = true;
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

async function quickAddTask(title: string): Promise<void> {
  if (isQuickAdding.value) return;
  isQuickAdding.value = true;
  quickAddError.value = "";
  try {
    await taskStore.addTask({
      title,
      listType: "today",
      plannedDate: todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone),
    });
    quickAddRef.value?.clear(title);
    showNotice(settingsStore.t("task.feedbackSaved"));
  } catch {
    quickAddError.value = settingsStore.t("task.saveFailed");
  } finally {
    isQuickAdding.value = false;
    await nextTick();
    quickAddRef.value?.focus();
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
  showNotice(`${settingsStore.t("task.feedbackDeleted")}：${task.title}`);
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
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
});

</script>

<template>
  <section class="view-shell today-view">
    <header class="view-header">
      <div>
        <h1>{{ settingsStore.t("nav.today") }}</h1>
        <p class="view-count">{{ openTodayTasks.length }} {{ settingsStore.t("task.todayCountSuffix") }}</p>
      </div>
      <button class="primary-button" type="button" @click="openCreate">{{ settingsStore.t("task.addToday") }}</button>
    </header>

    <WorkspaceQuickAdd
      ref="quickAdd"
      :disabled="isQuickAdding"
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
          :task="editingTask"
          :title="settingsStore.t('task.todayTitle')"
          :create-preset="editingTask ? 'default' : 'today'"
          :is-saving="isSaving"
          :error-message="editorSaveError"
          error-id="today-editor-save-error"
          @save="save"
          @cancel="closeEditor"
          @dirty-change="setEditorDirty"
        />
    </EditorDrawer>

    <div class="today-workspace">
      <div class="task-list today-task-list">
        <template v-if="overdueTodayTasks.length > 0">
          <div class="task-section-header overdue-section">
            <span>{{ settingsStore.t("task.filterOverdue") }}</span>
            <strong>{{ overdueTodayTasks.length }}</strong>
          </div>
          <TaskItem
            v-for="task in overdueTodayTasks"
            :key="task.localId"
            :task="task"
            @edit="openEdit"
            @complete="completeTask"
            @restore="restoreTask"
            @postpone="taskStore.postponeTomorrow"
            @snooze="taskStore.snoozeOneHour"
            @plan-today="taskStore.planToday"
            @next-occurrence="taskStore.createNextOccurrence"
            @instantiate-template="taskStore.instantiateTemplate"
            @delete="deleteTask"
          />
        </template>

        <template v-if="upcomingTodayTasks.length > 0">
          <div class="task-section-header">
            <span>{{ settingsStore.t("task.upcomingToday") }}</span>
            <strong>{{ upcomingTodayTasks.length }}</strong>
          </div>
          <TaskItem
            v-for="task in upcomingTodayTasks"
            :key="task.localId"
            :task="task"
            @edit="openEdit"
            @complete="completeTask"
            @restore="restoreTask"
            @postpone="taskStore.postponeTomorrow"
            @snooze="taskStore.snoozeOneHour"
            @plan-today="taskStore.planToday"
            @next-occurrence="taskStore.createNextOccurrence"
            @instantiate-template="taskStore.instantiateTemplate"
            @delete="deleteTask"
          />
        </template>

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
