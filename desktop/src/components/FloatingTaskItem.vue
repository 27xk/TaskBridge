<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
import { formatShanghaiTime } from "../../shared/quick-add-parser";
import { getTaskPriorityLabel } from "../../shared/task-ui-policy";
import { isCompletedStatus } from "../utils/task-order";

const props = defineProps<{
  task: TaskRecord;
}>();

defineEmits<{
  complete: [task: TaskRecord];
  open: [task: TaskRecord];
}>();

const settingsStore = useSettingsStore();

function priorityLevel(value: number): number {
  const normalized = Math.trunc(Number.isFinite(value) ? value : 0);
  return Math.min(Math.max(normalized, 0), 5);
}

function dueTimeLabel(value: string | null): string {
  if (!value) return props.task.plannedDate ? settingsStore.t("task.todayTitle") : settingsStore.t("task.noDue");
  return formatShanghaiTime(value, settingsStore.language, settingsStore.displayTimeZone);
}

function syncStatusText(status: TaskRecord["syncStatus"]): string {
  switch (status) {
    case "pending_create":
      return settingsStore.t("sync.pendingCreate");
    case "pending_update":
      return settingsStore.t("sync.pendingUpdate");
    case "pending_delete":
      return settingsStore.t("sync.pendingDelete");
    case "sync_failed":
      return settingsStore.t("sync.failed");
    case "conflict":
      return settingsStore.t("sync.conflict");
    default:
      return settingsStore.t("sync.synced");
  }
}
</script>

<template>
  <article class="floating-task" :class="{ completed: isCompletedStatus(props.task.status) }">
    <button
      type="button"
      class="floating-check"
      :title="isCompletedStatus(props.task.status) ? settingsStore.t('task.restore') : settingsStore.t('task.complete')"
      :disabled="isCompletedStatus(props.task.status)"
      @click="$emit('complete', props.task)"
    >
      <span v-if="isCompletedStatus(props.task.status)">✓</span>
    </button>

    <button type="button" class="floating-task-body" @click="$emit('open', props.task)">
      <span class="floating-task-title">{{ props.task.title }}</span>
      <span class="floating-task-meta">
        <span>{{ dueTimeLabel(props.task.dueTime) }}</span>
        <span v-if="props.task.snoozedUntil">{{ settingsStore.t("task.snooze") }}</span>
        <span v-if="props.task.priority > 0" class="floating-priority" :data-level="priorityLevel(props.task.priority)">
          {{ getTaskPriorityLabel(props.task.priority, settingsStore.language) }}
        </span>
        <span v-if="props.task.syncStatus !== 'synced'" class="floating-sync-tag">
          {{ syncStatusText(props.task.syncStatus) }}
        </span>
      </span>
    </button>
  </article>
</template>
