<script setup lang="ts">
defineProps<{
  task: TaskRecord;
  compact?: boolean;
}>();

const emit = defineEmits<{
  edit: [task: TaskRecord];
  complete: [task: TaskRecord];
  restore: [task: TaskRecord];
  delete: [task: TaskRecord];
  postpone: [task: TaskRecord];
  snooze: [task: TaskRecord];
  planToday: [task: TaskRecord];
  nextOccurrence: [task: TaskRecord];
  instantiateTemplate: [task: TaskRecord];
}>();

function toggleCompletion(task: TaskRecord): void {
  if (task.status === "completed") {
    emit("restore", task);
  } else {
    emit("complete", task);
  }
}

function checklistProgress(task: TaskRecord): string | null {
  try {
    const parsed = JSON.parse(task.checklistJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const done = parsed.filter((item) => item?.done === true).length;
    return `${done}/${parsed.length}`;
  } catch {
    return null;
  }
}
</script>

<template>
  <article class="task-row" :class="{ completed: task.status === 'completed', compact }">
    <button
      class="check-button"
      type="button"
      :title="task.status === 'completed' ? 'Restore task' : 'Complete task'"
      @click="toggleCompletion(task)"
    >
    </button>

    <div class="task-body" @dblclick="$emit('edit', task)">
      <div class="task-title-line">
        <h3>{{ task.title }}</h3>
        <span v-if="task.syncStatus !== 'synced'" class="sync-pill">{{ task.syncStatus }}</span>
      </div>
      <p v-if="task.content">{{ task.content }}</p>
      <div class="task-meta">
        <span v-if="task.dueTime">Due {{ new Date(task.dueTime).toLocaleString() }}</span>
        <span v-if="task.plannedDate">Plan {{ task.plannedDate }}</span>
        <span v-if="task.tag">#{{ task.tag }}</span>
        <span v-if="task.project">{{ task.project }}</span>
        <span v-if="checklistProgress(task)">Checklist {{ checklistProgress(task) }}</span>
        <span v-if="task.repeatRule">Repeat {{ task.repeatRule }}</span>
        <span v-if="task.isTemplate">Template</span>
        <span>Priority {{ task.priority }}</span>
      </div>
    </div>

    <div class="task-actions">
      <button v-if="task.status !== 'completed'" type="button" title="Plan today" @click="$emit('planToday', task)">Today</button>
      <button v-if="task.status !== 'completed'" type="button" title="Postpone to tomorrow" @click="$emit('postpone', task)">Tomorrow</button>
      <button v-if="task.status !== 'completed'" type="button" title="Snooze one hour" @click="$emit('snooze', task)">Snooze</button>
      <button v-if="task.repeatRule" type="button" title="Create next occurrence" @click="$emit('nextOccurrence', task)">Next</button>
      <button v-if="task.isTemplate" type="button" title="Use template" @click="$emit('instantiateTemplate', task)">Use</button>
      <button type="button" title="Edit task" @click="$emit('edit', task)">Edit</button>
      <button type="button" title="Delete task" @click="$emit('delete', task)">Delete</button>
    </div>
  </article>
</template>
