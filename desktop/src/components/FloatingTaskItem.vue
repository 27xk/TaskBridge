<script setup lang="ts">
const props = defineProps<{
  task: TaskRecord;
}>();

const emit = defineEmits<{
  complete: [task: TaskRecord];
  open: [task: TaskRecord];
}>();

const priorityLabel = ["P0", "P1", "P2", "P3", "P4", "P5"];

function priorityLevel(value: number): number {
  return Math.min(Math.max(value, 0), 5);
}

function priorityText(value: number): string {
  return priorityLabel[priorityLevel(value)] ?? `P${value}`;
}

function dueTimeLabel(value: string | null): string {
  if (!value) return props.task.plannedDate ? "今日计划" : "无截止";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <article class="floating-task" :class="{ completed: props.task.status === 'completed' }">
    <button
      type="button"
      class="floating-check"
      :title="props.task.status === 'completed' ? '已完成' : '完成任务'"
      :disabled="props.task.status === 'completed'"
      @click="$emit('complete', props.task)"
    >
      <span v-if="props.task.status === 'completed'">✓</span>
    </button>

    <button type="button" class="floating-task-body" @click="$emit('open', props.task)">
      <span class="floating-task-title">{{ props.task.title }}</span>
      <span class="floating-task-meta">
        <span>{{ dueTimeLabel(props.task.dueTime) }}</span>
        <span v-if="props.task.snoozedUntil">稍后</span>
        <span class="floating-priority" :data-level="priorityLevel(props.task.priority)">
          {{ priorityText(props.task.priority) }}
        </span>
        <span v-if="props.task.syncStatus !== 'synced'" class="floating-sync-tag">
          {{ props.task.syncStatus }}
        </span>
      </span>
    </button>
  </article>
</template>
