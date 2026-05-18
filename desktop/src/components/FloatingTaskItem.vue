<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
import { formatShanghaiTime } from "../../shared/quick-add-parser";

const props = defineProps<{
  task: TaskRecord;
}>();

const emit = defineEmits<{
  complete: [task: TaskRecord];
  open: [task: TaskRecord];
}>();
const settingsStore = useSettingsStore();

const priorityLabel = ["P0", "P1", "P2", "P3", "P4", "P5"];

function priorityLevel(value: number): number {
  return Math.min(Math.max(value, 0), 5);
}

function priorityText(value: number): string {
  return priorityLabel[priorityLevel(value)] ?? `P${value}`;
}

function dueTimeLabel(value: string | null): string {
  if (!value) return props.task.plannedDate ? settingsStore.t("task.todayTitle") : settingsStore.t("task.noDue");
  return formatShanghaiTime(value, settingsStore.language);
}

function syncStatusText(status: TaskRecord["syncStatus"]): string {
  switch (status) {
    case "pending_create":
      return settingsStore.t("sync.pendingCreate");
    case "pending_update":
      return settingsStore.t("sync.pendingUpdate");
    case "pending_delete":
      return settingsStore.t("sync.pendingDelete");
    case "conflict":
      return settingsStore.t("sync.conflict");
    default:
      return settingsStore.t("sync.synced");
  }
}
</script>

<template>
  <article class="floating-task" :class="{ completed: props.task.status === 'completed' }">
    <button
      type="button"
      class="floating-check"
      :title="props.task.status === 'completed' ? settingsStore.language === 'zh-CN' ? '已完成' : 'Completed' : settingsStore.t('task.complete')"
      :disabled="props.task.status === 'completed'"
      @click="$emit('complete', props.task)"
    >
      <span v-if="props.task.status === 'completed'">✓</span>
    </button>

    <button type="button" class="floating-task-body" @click="$emit('open', props.task)">
      <span class="floating-task-title">{{ props.task.title }}</span>
      <span class="floating-task-meta">
        <span>{{ dueTimeLabel(props.task.dueTime) }}</span>
        <span v-if="props.task.snoozedUntil">{{ settingsStore.t("task.snooze") }}</span>
        <span class="floating-priority" :data-level="priorityLevel(props.task.priority)">
          {{ priorityText(props.task.priority) }}
        </span>
        <span v-if="props.task.syncStatus !== 'synced'" class="floating-sync-tag">
          {{ syncStatusText(props.task.syncStatus) }}
        </span>
      </span>
    </button>
  </article>
</template>
