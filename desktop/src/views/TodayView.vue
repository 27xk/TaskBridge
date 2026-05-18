<script setup lang="ts">
import { computed, ref } from "vue";

import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import { useSettingsStore } from "../stores/settings";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { todayLocalDate } from "../../shared/quick-add-parser";

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const editorOpen = ref(false);
const editingTask = ref<TaskRecord | null>(null);
const notice = ref("");
let noticeTimer: number | undefined;

const openTodayTasks = computed(() =>
  taskStore.todayTasks.filter((task) => !task.isDeleted && task.status !== "completed"),
);

function openCreate(): void {
  editingTask.value = null;
  editorOpen.value = true;
}

function openEdit(task: TaskRecord): void {
  editingTask.value = task;
  editorOpen.value = true;
}

async function save(draft: TaskDraft): Promise<void> {
  if (editingTask.value) {
    await taskStore.updateTask(editingTask.value, draft);
  } else {
    await taskStore.addTask({
      ...draft,
      listType: "today",
      plannedDate: draft.plannedDate || todayLocalDate(new Date(), settingsStore.displayTimeZone),
    });
  }
  editorOpen.value = false;
  editingTask.value = null;
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

function showNotice(message: string): void {
  notice.value = message;
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = "";
    noticeTimer = undefined;
  }, 1800);
}
</script>

<template>
  <section class="view-shell">
    <header class="view-header">
      <div>
        <p class="eyebrow">{{ settingsStore.t("nav.today") }}</p>
        <h1>{{ openTodayTasks.length }} {{ settingsStore.t("floating.todayTasks") }}</h1>
      </div>
      <button class="primary-button" type="button" @click="openCreate">{{ settingsStore.t("task.addToday") }}</button>
    </header>

    <div v-if="editorOpen" class="side-panel">
      <TaskEditor :task="editingTask" :title="settingsStore.t('task.todayTitle')" @save="save" @cancel="editorOpen = false" />
    </div>

    <p v-if="notice" class="action-feedback">{{ notice }}</p>

    <div class="task-list">
      <TaskItem
        v-for="task in openTodayTasks"
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
        @delete="taskStore.deleteTask"
      />
      <p v-if="openTodayTasks.length === 0" class="empty-state">{{ settingsStore.t("task.emptyToday") }}</p>
    </div>
  </section>
</template>
