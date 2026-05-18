<script setup lang="ts">
import { computed, ref, watch } from "vue";

import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import { useSettingsStore } from "../stores/settings";
import { useTaskStore, type TaskDraft } from "../stores/task";
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
const filter = ref<"all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates">("all");
const selectedProject = ref("");
const selectedTag = ref("");
const notice = ref("");
let noticeTimer: number | undefined;

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
const completedFilteredTasks = computed(() => filteredTasks.value.filter((task) => task.status === "completed"));
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

async function completeCurrentView(): Promise<void> {
  await taskStore.batchComplete(openFilteredTasks.value);
  showNotice(settingsStore.t("task.feedbackBatchCompleted"));
}

async function deleteCurrentView(): Promise<void> {
  await taskStore.batchDelete(filteredTasks.value);
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

function matchesFilter(task: TaskRecord, mode: typeof filter.value): boolean {
  const today = todayLocalDate(new Date(), settingsStore.displayTimeZone);
  const taskDate = task.plannedDate ?? isoDate(task.dueTime);
  switch (mode) {
    case "inbox":
      return task.listType === "inbox" && task.status !== "completed";
    case "today":
      return taskDate === today || task.listType === "today";
    case "overdue":
      return task.status !== "completed" && Boolean(task.dueTime && (parseTaskBridgeDate(task.dueTime)?.getTime() ?? Number.POSITIVE_INFINITY) < Date.now());
    case "week":
      return Boolean(taskDate && taskDate >= today && taskDate <= todayLocalDate(new Date(Date.now() + 7 * 86_400_000), settingsStore.displayTimeZone));
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

    <div class="toolbar">
      <input v-model="search" type="search" :placeholder="settingsStore.t('task.search')" />
      <span>{{ settingsStore.t("task.completedCountPrefix") }} {{ taskStore.completedTasks.length }}</span>
    </div>

    <div class="toolbar filter-toolbar">
      <select v-model="filter">
        <option value="all">{{ settingsStore.t("nav.all") }}</option>
        <option value="inbox">{{ settingsStore.t("task.inbox") }}</option>
        <option value="today">{{ settingsStore.t("nav.today") }}</option>
        <option value="overdue">{{ settingsStore.language === "zh-CN" ? "逾期" : "Overdue" }}</option>
        <option value="week">{{ settingsStore.language === "zh-CN" ? "本周" : "This week" }}</option>
        <option value="high">{{ settingsStore.language === "zh-CN" ? "高优先级" : "High priority" }}</option>
        <option value="completed">{{ settingsStore.language === "zh-CN" ? "已完成" : "Completed" }}</option>
        <option value="pending">{{ settingsStore.language === "zh-CN" ? "未同步" : "Pending sync" }}</option>
        <option value="conflict">{{ settingsStore.t("sync.conflict") }}</option>
        <option value="templates">{{ settingsStore.t("task.template") }}</option>
      </select>
      <select v-model="selectedProject">
        <option value="">{{ settingsStore.language === "zh-CN" ? "全部项目" : "All projects" }}</option>
        <option v-for="project in taskStore.projects" :key="project" :value="project">{{ project }}</option>
      </select>
      <select v-model="selectedTag">
        <option value="">{{ settingsStore.language === "zh-CN" ? "全部标签" : "All tags" }}</option>
        <option v-for="tag in taskStore.tags" :key="tag" :value="tag">#{{ tag }}</option>
      </select>
      <button type="button" class="secondary-button" @click="completeCurrentView">{{ settingsStore.language === "zh-CN" ? "完成当前" : "Complete current" }}</button>
      <button type="button" class="secondary-button" @click="deleteCurrentView">{{ settingsStore.language === "zh-CN" ? "删除当前" : "Delete current" }}</button>
    </div>

    <div v-if="editorOpen" class="side-panel">
      <TaskEditor :task="editingTask" @save="save" @cancel="editorOpen = false" />
    </div>

    <p v-if="notice" class="action-feedback">{{ notice }}</p>

    <div class="task-list">
      <template v-if="shouldGroupByCompletion">
        <div class="task-section-header">
          <span>{{ settingsStore.language === "zh-CN" ? "未完成" : "Open" }}</span>
          <strong>{{ openFilteredTasks.length }}</strong>
        </div>
        <TaskItem
          v-for="task in openFilteredTasks"
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
          <span>{{ settingsStore.language === "zh-CN" ? "已完成" : "Completed" }}</span>
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
        <span>{{ task.title }} {{ settingsStore.language === "zh-CN" ? "存在同步冲突" : "has a sync conflict" }}</span>
        <button class="secondary-button" type="button" @click="taskStore.resolveConflictUseServer(task)">
          {{ settingsStore.language === "zh-CN" ? "采用云端" : "Use cloud" }}
        </button>
        <button class="secondary-button" type="button" @click="taskStore.forceOverwriteServer(task)">
          {{ settingsStore.language === "zh-CN" ? "覆盖云端" : "Overwrite cloud" }}
        </button>
      </div>
      <p v-if="filteredTasks.length === 0" class="empty-state">{{ settingsStore.t("task.empty") }}</p>
    </div>
  </section>
</template>
