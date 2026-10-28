<script setup lang="ts">
import type { TaskListItem } from "../../common/task";
import { computed } from "vue";
import { CalendarDays, Check, Clock3 } from "lucide-vue-next";

import { useSettingsStore } from "../stores/settings";
import { todayLocalDate } from "../../common/quick-add-parser";
import { getTaskPriorityLabel } from "../../common/task-ui-policy";
import { getTaskSchedulePresentation, type TaskSchedulePresentation } from "../utils/task-presentation";
import { isCompletedStatus } from "../utils/task-order";

const props = defineProps<{
  task: TaskListItem;
  now?: Date;
}>();

defineEmits<{
  complete: [task: TaskListItem];
  open: [task: TaskListItem];
}>();

const settingsStore = useSettingsStore();
const schedule = computed(() => getTaskSchedulePresentation(props.task, {
  language: settingsStore.language,
  timeZone: settingsStore.displayTimeZone,
  now: props.now,
}));
const visibleSchedule = computed(() => {
  const today = todayLocalDate(props.now ?? new Date(), settingsStore.displayTimeZone);
  return [schedule.value.primary, schedule.value.extraPlanned].filter((entry): entry is TaskSchedulePresentation =>
    entry !== null && (entry.kind !== "planned" || entry.dateKey !== today),
  );
});
const hasMeta = computed(() => visibleSchedule.value.length > 0 || Boolean(props.task.snoozedUntil)
  || props.task.priority > 0 || props.task.syncStatus !== "synced");
const taskDetailLabel = computed(() => [
  props.task.title,
  schedule.value.primary?.fullLabel,
  schedule.value.extraPlanned?.fullLabel,
].filter(Boolean).join("\n"));

function priorityLevel(value: number): number {
  const normalized = Math.trunc(Number.isFinite(value) ? value : 0);
  return Math.min(Math.max(normalized, 0), 5);
}

function syncStatusText(status: TaskListItem["syncStatus"]): string {
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
      :aria-label="`${settingsStore.t('task.complete')}: ${props.task.title}`"
      :disabled="isCompletedStatus(props.task.status)"
      @click="$emit('complete', props.task)"
    >
      <Check v-if="isCompletedStatus(props.task.status)" :size="13" aria-hidden="true" />
    </button>

    <button type="button" class="floating-task-body" :title="taskDetailLabel" @click="$emit('open', props.task)">
      <span class="floating-task-title">{{ props.task.title }}</span>
      <span v-if="hasMeta" class="floating-task-meta">
        <span v-for="entry in visibleSchedule" :key="entry.kind" class="floating-task-schedule" :title="entry.fullLabel">
          <Clock3 v-if="entry.kind === 'due'" :size="11" aria-hidden="true" />
          <CalendarDays v-else :size="11" aria-hidden="true" />
          {{ entry.label }}
        </span>
        <span v-if="props.task.snoozedUntil">{{ settingsStore.t("task.snooze") }}</span>
        <span v-if="props.task.priority > 0" class="floating-priority" :data-level="priorityLevel(props.task.priority)">
          {{ getTaskPriorityLabel(props.task.priority, settingsStore.language) }}
        </span>
        <span v-if="props.task.syncStatus !== 'synced'" class="floating-sync-tag" :data-state="props.task.syncStatus">
          {{ syncStatusText(props.task.syncStatus) }}
        </span>
      </span>
    </button>
  </article>
</template>
