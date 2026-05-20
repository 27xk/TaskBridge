<script setup lang="ts">
import { computed, ref, watch } from "vue";

import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import { useSettingsStore } from "../stores/settings";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { isTaskOverdue, sortCompletedTasksByRecency } from "../utils/task-order";
import { parseTaskBridgeDate, todayLocalDate } from "../../shared/quick-add-parser";

const props = defineProps<{
  quickAddSignal?: number;
  openTaskRequest?: { localId: string; nonce: number } | null;
}>();

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const editorOpen = ref(false);
const editingTask = ref<TaskRecord | null>(null);
const search = ref("");
type TaskFilter = "all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates";

const filter = ref<TaskFilter>("all");
const selectedProject = ref("");
const selectedTag = ref("");
const notice = ref("");
let noticeTimer: number | undefined;

const filterOptions = computed<Array<{ value: TaskFilter; label: string }>>(() => [
  { value: "all", label: settingsStore.t("nav.all") },
  { value: "inbox", label: settingsStore.t("task.inbox") },
  { value: "today", label: settingsStore.t("nav.today") },
  { value: "overdue", label: settingsStore.t("task.filterOverdue") },
  { value: "week", label: settingsStore.t("task.filterWeek") },
  { value: "high", label: settingsStore.t("task.filterHigh") },
  { value: "completed", label: settingsStore.t("task.completedCountPrefix") },
  { value: "pending", label: settingsStore.t("task.filterPending") },
  { value: "conflict", label: settingsStore.t("sync.conflict") },
  { value: "templates", label: settingsStore.t("task.template") },
]);

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return taskStore.activeTasks.filter((task) => {
    if (selectedProject.value && task.project !== selectedProject.value) return false;
    if (selectedTag.value && task.tag !== selectedTag.value) return false;
    if (!matchesFilter(task, filter.value)) return false;
    if (!keyword) return true;
    return `${task.title} ${task.content ?? ""} ${task.tag ?? ""} ${task.project ?? ""}`.toLowerCase().includes(keyword);
  });
});
const openFilteredTasks = computed(() => filteredTasks.value.filter((task) => task.status !== "completed"));
const overdueFilteredTasks = computed(() =>
  openFilteredTasks.value.filter((task) => isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone)),
);
const pendingOpenFilteredTasks = computed(() =>
  openFilteredTasks.value.filter((task) => !isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone)),
);
const completedFilteredTasks = computed(() =>
  sortCompletedTasksByRecency(filteredTasks.value.filter((task) => task.status === "completed")),
);
const shouldGroupByCompletion = computed(() => filter.value !== "completed");

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
    await taskStore.addTask(draft);
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

function matchesFilter(task: TaskRecord, mode: TaskFilter): boolean {
  const today = todayLocalDate(taskStore.timelineNow, settingsStore.displayTimeZone);
  const taskDate = task.plannedDate ?? isoDate(task.dueTime);
  switch (mode) {
    case "inbox":
      return task.listType === "inbox" && task.status !== "completed";
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
      return task.status !== "completed" && task.priority >= 3;
    case "completed":
      return task.status === "completed";
    case "pending":
      return task.syncStatus !== "synced";
    case "conflict":
      return task.syncStatus === "conflict";
    case "templates":
      return task.isTemplate;
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
      <input v-model="search" type="search" :placeholder="settingsStore.t('task.search')" />
      <span>{{ settingsStore.t("task.completedCountPrefix") }} {{ taskStore.completedTasks.length }}</span>
    </div>

    <div class="filter-toolbar">
      <div class="filter-strip" role="group" :aria-label="settingsStore.t('task.statusFilters')">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          type="button"
          :class="{ active: filter === option.value }"
          @click="filter = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="filter-selects">
        <select v-model="selectedProject">
          <option value="">{{ settingsStore.t("task.allProjects") }}</option>
          <option v-for="project in taskStore.projects" :key="project" :value="project">{{ project }}</option>
        </select>
        <select v-model="selectedTag">
          <option value="">{{ settingsStore.t("task.allTags") }}</option>
          <option v-for="tag in taskStore.tags" :key="tag" :value="tag">#{{ tag }}</option>
        </select>
      </div>
    </div>

    <div v-if="editorOpen" class="drawer-layer">
      <button class="drawer-scrim" type="button" :aria-label="settingsStore.t('task.close')" @click="editorOpen = false"></button>
      <aside class="side-panel">
        <TaskEditor :task="editingTask" @save="save" @cancel="editorOpen = false" />
      </aside>
    </div>

    <p v-if="notice" class="action-feedback">{{ notice }}</p>

    <div class="task-list">
      <template v-if="shouldGroupByCompletion">
        <div v-if="overdueFilteredTasks.length > 0" class="task-section-header overdue-section">
          <span>{{ settingsStore.t("task.filterOverdue") }}</span>
          <strong>{{ overdueFilteredTasks.length }}</strong>
        </div>
        <TaskItem
          v-for="task in overdueFilteredTasks"
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

        <div v-if="pendingOpenFilteredTasks.length > 0" class="task-section-header">
          <span>{{ settingsStore.t("task.filterOpen") }}</span>
          <strong>{{ pendingOpenFilteredTasks.length }}</strong>
        </div>
        <TaskItem
          v-for="task in pendingOpenFilteredTasks"
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

        <div v-if="completedFilteredTasks.length > 0" class="task-section-header completed-section">
          <span>{{ settingsStore.t("task.completedCountPrefix") }}</span>
          <strong>{{ completedFilteredTasks.length }}</strong>
        </div>
        <TaskItem
          v-for="task in completedFilteredTasks"
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
      </template>
      <template v-else>
        <TaskItem
          v-for="task in completedFilteredTasks"
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
      </template>
      <div
        v-for="task in filteredTasks.filter((item) => item.syncStatus === 'conflict')"
        :key="`${task.localId}-conflict`"
        class="conflict-actions"
      >
        <span>{{ task.title }} {{ settingsStore.t("sync.conflictExists") }}</span>
        <button class="secondary-button" type="button" @click="taskStore.resolveConflictUseServer(task)">
          {{ settingsStore.t("sync.useCloud") }}
        </button>
        <button class="secondary-button" type="button" @click="taskStore.forceOverwriteServer(task)">
          {{ settingsStore.t("sync.overwriteCloud") }}
        </button>
      </div>
      <p v-if="filteredTasks.length === 0" class="empty-state">{{ settingsStore.t("task.empty") }}</p>
    </div>
  </section>
</template>
