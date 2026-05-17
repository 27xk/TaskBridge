<script setup lang="ts">
import { computed, ref, watch } from "vue";

import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import { useTaskStore, type TaskDraft } from "../stores/task";

const props = defineProps<{
  quickAddSignal?: number;
  openTaskRequest?: { localId: string; nonce: number } | null;
}>();

const taskStore = useTaskStore();
const editorOpen = ref(false);
const editingTask = ref<TaskRecord | null>(null);
const search = ref("");
const filter = ref<"all" | "inbox" | "today" | "overdue" | "week" | "high" | "completed" | "pending" | "conflict" | "templates">("all");
const selectedProject = ref("");
const selectedTag = ref("");

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

watch(
  () => props.quickAddSignal,
  (value) => {
    if (value && value > 0) {
      openCreate();
    }
  },
  { immediate: true },
);

watch(
  () => props.openTaskRequest,
  async (request) => {
    if (!request) return;
    if (taskStore.tasks.length === 0) {
      await taskStore.load();
    }
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
}

async function completeCurrentView(): Promise<void> {
  await taskStore.batchComplete(filteredTasks.value);
}

async function deleteCurrentView(): Promise<void> {
  await taskStore.batchDelete(filteredTasks.value);
}

function matchesFilter(task: TaskRecord, mode: typeof filter.value): boolean {
  const today = localDate(new Date());
  const taskDate = task.plannedDate ?? isoDate(task.dueTime);
  switch (mode) {
    case "inbox":
      return task.listType === "inbox" && task.status !== "completed";
    case "today":
      return taskDate === today || task.listType === "today";
    case "overdue":
      return task.status !== "completed" && Boolean(task.dueTime && new Date(task.dueTime).getTime() < Date.now());
    case "week":
      return Boolean(taskDate && taskDate >= today && taskDate <= localDate(new Date(Date.now() + 7 * 86_400_000)));
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return localDate(date);
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
</script>

<template>
  <section class="view-shell">
    <header class="view-header">
      <div>
        <p class="eyebrow">All tasks</p>
        <h1>{{ taskStore.openTasks.length }} open tasks</h1>
      </div>
      <button class="primary-button" type="button" @click="openCreate">Add task</button>
    </header>

    <div class="toolbar">
      <input v-model="search" type="search" placeholder="Search title, content, tag" />
      <span>{{ taskStore.completedTasks.length }} completed</span>
    </div>

    <div class="toolbar filter-toolbar">
      <select v-model="filter">
        <option value="all">全部</option>
        <option value="inbox">收件箱</option>
        <option value="today">今日</option>
        <option value="overdue">逾期</option>
        <option value="week">本周</option>
        <option value="high">高优先级</option>
        <option value="completed">已完成</option>
        <option value="pending">未同步</option>
        <option value="conflict">冲突</option>
        <option value="templates">模板</option>
      </select>
      <select v-model="selectedProject">
        <option value="">全部项目</option>
        <option v-for="project in taskStore.projects" :key="project" :value="project">{{ project }}</option>
      </select>
      <select v-model="selectedTag">
        <option value="">全部标签</option>
        <option v-for="tag in taskStore.tags" :key="tag" :value="tag">#{{ tag }}</option>
      </select>
      <button type="button" class="secondary-button" @click="completeCurrentView">完成当前</button>
      <button type="button" class="secondary-button" @click="deleteCurrentView">删除当前</button>
    </div>

    <div v-if="editorOpen" class="side-panel">
      <TaskEditor :task="editingTask" @save="save" @cancel="editorOpen = false" />
    </div>

    <div class="task-list">
      <TaskItem
        v-for="task in filteredTasks"
        :key="task.localId"
        :task="task"
        @edit="openEdit"
        @complete="taskStore.completeTask"
        @restore="taskStore.restoreTask"
        @postpone="taskStore.postponeTomorrow"
        @snooze="taskStore.snoozeOneHour"
        @plan-today="taskStore.planToday"
        @next-occurrence="taskStore.createNextOccurrence"
        @instantiate-template="taskStore.instantiateTemplate"
        @delete="taskStore.deleteTask"
      />
      <div
        v-for="task in filteredTasks.filter((item) => item.syncStatus === 'conflict')"
        :key="`${task.localId}-conflict`"
        class="conflict-actions"
      >
        <span>{{ task.title }} 存在同步冲突</span>
        <button class="secondary-button" type="button" @click="taskStore.resolveConflictUseServer(task)">
          采用云端
        </button>
        <button class="secondary-button" type="button" @click="taskStore.forceOverwriteServer(task)">
          覆盖云端
        </button>
      </div>
      <p v-if="filteredTasks.length === 0" class="empty-state">No tasks in this view.</p>
    </div>
  </section>
</template>
