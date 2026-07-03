<script setup lang="ts">
import { computed, ref } from "vue";

import ConfirmDialog from "../components/ConfirmDialog.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import TaskSyncHealthBar from "../components/TaskSyncHealthBar.vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { useSettingsStore } from "../stores/settings";
import { useSyncStore } from "../stores/sync";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isCompletedStatus, isTaskOverdue, sortTasksByTimeline } from "../utils/task-order";
import { getTaskActionConfirmationMessage } from "../../shared/task-ui-policy";

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const syncStore = useSyncStore();
const emit = defineEmits<{
  openSettings: [];
}>();
const editorOpen = ref(false);
const editorDirty = ref(false);
const editingTask = ref<TaskRecord | null>(null);
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
const diagnosticSyncIssueCount = computed(
  () =>
    syncStore.diagnostics.pendingQueueCount +
    syncStore.diagnostics.exhaustedQueueCount +
    syncStore.diagnostics.failedCount +
    syncStore.diagnostics.conflictCount,
);
const taskRecordSyncIssueCount = computed(() => taskStore.tasks.filter((task) => task.syncStatus !== "synced").length);
const taskSyncIssueCount = computed(() => Math.max(diagnosticSyncIssueCount.value, taskRecordSyncIssueCount.value));
const taskSyncHealthTone = computed<"ready" | "attention" | "unknown">(() => {
  if (taskSyncIssueCount.value > 0 || syncStore.status === "error") return "attention";
  if (syncStore.status === "offline" || syncStore.status === "idle") return "unknown";
  return "ready";
});
const taskSyncHealthText = computed(() => {
  if (taskSyncIssueCount.value > 0) {
    return settingsStore.t("task.syncHealthNeedsReview").replace("{count}", String(taskSyncIssueCount.value));
  }
  if (syncStore.status === "offline" || syncStore.status === "idle") return settingsStore.t("task.syncHealthUnknown");
  if (syncStore.status === "error") return settingsStore.t("task.syncHealthDegraded");
  return settingsStore.t("task.syncHealthReady");
});

function openCreate(): void {
  editingTask.value = null;
  editorDirty.value = false;
  editorOpen.value = true;
}

function openEdit(task: TaskRecord): void {
  editingTask.value = task;
  editorDirty.value = false;
  editorOpen.value = true;
}

async function closeEditor(): Promise<void> {
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
  editorDirty.value = false;
}

async function save(draft: TaskDraft): Promise<void> {
  if (editingTask.value) {
    await taskStore.updateTask(editingTask.value, draft);
  } else {
    await taskStore.addTask(draft);
  }
  editorOpen.value = false;
  editingTask.value = null;
  editorDirty.value = false;
  showNotice(settingsStore.t("task.feedbackSaved"));
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

function openSyncRecovery(): void {
  emit("openSettings");
}
</script>

<template>
  <section class="view-shell today-view">
    <header class="view-header">
      <div>
        <p class="eyebrow">{{ settingsStore.t("nav.today") }}</p>
        <h1>{{ openTodayTasks.length }} {{ settingsStore.t("task.todayCountSuffix") }}</h1>
      </div>
      <button class="primary-button" type="button" @click="openCreate">{{ settingsStore.t("task.addToday") }}</button>
    </header>

    <div v-if="editorOpen" class="drawer-layer">
      <button class="drawer-scrim" type="button" :aria-label="settingsStore.t('task.close')" @click="closeEditor"></button>
      <aside class="side-panel">
        <TaskEditor
          :task="editingTask"
          :title="settingsStore.t('task.todayTitle')"
          :create-preset="editingTask ? 'default' : 'today'"
          @save="save"
          @cancel="closeEditor"
          @dirty-change="editorDirty = $event"
        />
      </aside>
    </div>

    <p v-if="notice" class="action-feedback">{{ notice }}</p>

    <section class="today-overview" :class="{ empty: openTodayTasks.length === 0 }">
      <div class="today-overview-main">
        <span>{{ settingsStore.t("task.todayOverview") }}</span>
        <strong>{{ openTodayTasks.length }}</strong>
      </div>
      <div class="today-metrics">
        <div class="today-metric overdue">
          <span>{{ settingsStore.t("task.filterOverdue") }}</span>
          <strong>{{ overdueTodayTasks.length }}</strong>
        </div>
        <div class="today-metric">
          <span>{{ settingsStore.t("task.upcomingToday") }}</span>
          <strong>{{ upcomingTodayTasks.length }}</strong>
        </div>
      </div>
    </section>

    <TaskSyncHealthBar
      :title="settingsStore.t('task.syncHealthTitle')"
      :text="taskSyncHealthText"
      :action-label="settingsStore.t('task.syncHealthAction')"
      :tone="taskSyncHealthTone"
      @open-details="openSyncRecovery"
    />

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
  </section>
</template>
