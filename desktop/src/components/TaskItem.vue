<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
import { formatShanghaiDateTime } from "../../shared/quick-add-parser";

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
const settingsStore = useSettingsStore();

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
  <article class="task-row" :class="{ completed: task.status === 'completed', compact }">
    <button
      class="check-button"
      type="button"
      :title="task.status === 'completed' ? settingsStore.t('task.restore') : settingsStore.t('task.complete')"
      @click="toggleCompletion(task)"
    >
    </button>

    <div class="task-body" @dblclick="$emit('edit', task)">
      <div class="task-title-line">
        <h3>{{ task.title }}</h3>
        <span v-if="task.syncStatus !== 'synced'" class="sync-pill">{{ syncStatusText(task.syncStatus) }}</span>
      </div>
      <p v-if="task.content">{{ task.content }}</p>
      <div class="task-meta">
        <span v-if="task.dueTime">{{ settingsStore.t("task.due") }} {{ formatShanghaiDateTime(task.dueTime, settingsStore.language) }}</span>
        <span v-if="task.plannedDate">{{ settingsStore.t("task.plan") }} {{ task.plannedDate }}</span>
        <span v-if="task.tag">#{{ task.tag }}</span>
        <span v-if="task.project">{{ task.project }}</span>
        <span v-if="checklistProgress(task)">{{ settingsStore.t("task.checklist") }} {{ checklistProgress(task) }}</span>
        <span v-if="task.repeatRule">{{ settingsStore.t("task.repeat") }} {{ task.repeatRule }}</span>
        <span v-if="task.isTemplate">{{ settingsStore.t("task.template") }}</span>
        <span>{{ settingsStore.t("task.priority") }} {{ task.priority }}</span>
      </div>
    </div>

    <div class="task-actions">
      <button v-if="task.status !== 'completed'" type="button" :title="settingsStore.t('task.today')" @click="$emit('planToday', task)">{{ settingsStore.t("task.today") }}</button>
      <button v-if="task.status !== 'completed'" type="button" :title="settingsStore.t('task.tomorrow')" @click="$emit('postpone', task)">{{ settingsStore.t("task.tomorrow") }}</button>
      <button v-if="task.status !== 'completed'" type="button" :title="settingsStore.t('task.snooze')" @click="$emit('snooze', task)">{{ settingsStore.t("task.snooze") }}</button>
      <button v-if="task.repeatRule" type="button" :title="settingsStore.t('task.next')" @click="$emit('nextOccurrence', task)">{{ settingsStore.t("task.next") }}</button>
      <button v-if="task.isTemplate" type="button" :title="settingsStore.t('task.use')" @click="$emit('instantiateTemplate', task)">{{ settingsStore.t("task.use") }}</button>
      <button type="button" :title="settingsStore.t('task.editAction')" @click="$emit('edit', task)">{{ settingsStore.t("task.editAction") }}</button>
      <button type="button" :title="settingsStore.t('task.delete')" @click="$emit('delete', task)">{{ settingsStore.t("task.delete") }}</button>
    </div>
  </article>
</template>
