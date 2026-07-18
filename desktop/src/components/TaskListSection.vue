<script setup lang="ts">
import TaskItem from "./TaskItem.vue";

withDefaults(defineProps<{
  title?: string;
  tasks: TaskRecord[];
  tone?: "default" | "overdue" | "completed";
  trash?: boolean;
  selectable?: boolean;
  selectionMode?: boolean;
  selectedTaskIds: Set<string>;
}>(), {
  title: "",
  tone: "default",
  trash: false,
  selectable: false,
  selectionMode: false,
  selectedTaskIds: () => new Set<string>(),
});

defineEmits<{
  edit: [task: TaskRecord];
  complete: [task: TaskRecord];
  restore: [task: TaskRecord];
  delete: [task: TaskRecord];
  purge: [task: TaskRecord];
  postpone: [task: TaskRecord];
  snooze: [task: TaskRecord];
  planToday: [task: TaskRecord];
  nextOccurrence: [task: TaskRecord];
  instantiateTemplate: [task: TaskRecord];
  useServer: [task: TaskRecord];
  overwriteServer: [task: TaskRecord];
  "selection-change": [task: TaskRecord, selected: boolean];
}>();
</script>

<template>
  <template v-if="tasks.length > 0">
    <div
      v-if="title"
      class="task-section-header"
      :class="{ 'overdue-section': tone === 'overdue', 'completed-section': tone === 'completed' }"
    >
      <span>{{ title }}</span>
      <strong>{{ tasks.length }}</strong>
    </div>
    <TaskItem
      v-for="task in tasks"
      :key="task.localId"
      :task="task"
      :trash="trash"
      :selectable="selectionMode && selectable"
      :selected="selectedTaskIds.has(task.localId)"
      @edit="$emit('edit', $event)"
      @selection-change="(selectedTask, selected) => $emit('selection-change', selectedTask, selected)"
      @complete="$emit('complete', $event)"
      @restore="$emit('restore', $event)"
      @postpone="$emit('postpone', $event)"
      @snooze="$emit('snooze', $event)"
      @plan-today="$emit('planToday', $event)"
      @next-occurrence="$emit('nextOccurrence', $event)"
      @instantiate-template="$emit('instantiateTemplate', $event)"
      @use-server="$emit('useServer', $event)"
      @overwrite-server="$emit('overwriteServer', $event)"
      @delete="$emit('delete', $event)"
      @purge="$emit('purge', $event)"
    />
  </template>
</template>
