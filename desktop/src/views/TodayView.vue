<script setup lang="ts">
import { computed, ref } from "vue";

import TaskEditor from "../components/TaskEditor.vue";
import TaskItem from "../components/TaskItem.vue";
import { useTaskStore, type TaskDraft } from "../stores/task";
import { todayLocalDate } from "../../shared/quick-add-parser";

const taskStore = useTaskStore();
const editorOpen = ref(false);
const editingTask = ref<TaskRecord | null>(null);

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
      plannedDate: draft.plannedDate || todayLocalDate(),
    });
  }
  editorOpen.value = false;
  editingTask.value = null;
}
</script>

<template>
  <section class="view-shell">
    <header class="view-header">
      <div>
        <p class="eyebrow">Today</p>
        <h1>{{ openTodayTasks.length }} due today</h1>
      </div>
      <button class="primary-button" type="button" @click="openCreate">Add today</button>
    </header>

    <div v-if="editorOpen" class="side-panel">
      <TaskEditor :task="editingTask" title="Today task" @save="save" @cancel="editorOpen = false" />
    </div>

    <div class="task-list">
      <TaskItem
        v-for="task in openTodayTasks"
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
      <p v-if="openTodayTasks.length === 0" class="empty-state">No tasks due today.</p>
    </div>
  </section>
</template>
