<script setup lang="ts">
import { computed } from "vue";
import TaskActionMenu from "./TaskActionMenu.vue";

import { useSettingsStore } from "../stores/settings";
import { useTaskStore } from "../stores/task";
import { formatShanghaiDateTime } from "../../shared/quick-add-parser";
import { getTaskPriorityLabel, getTaskRepeatRuleLabel } from "../../shared/task-ui-policy";
import { isCompletedStatus, isTaskOverdue } from "../utils/task-order";

const props = defineProps<{
  task: TaskRecord;
  compact?: boolean;
  trash?: boolean;
  selectable?: boolean;
  selected?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (event: "edit" | "complete" | "restore" | "delete" | "purge" | "postpone" | "snooze" | "planToday" | "nextOccurrence" | "instantiateTemplate" | "useServer" | "overwriteServer", task: TaskRecord): void;
  (event: "selection-change", task: TaskRecord, selected: boolean): void;
}>();
const settingsStore = useSettingsStore();
const taskStore = useTaskStore();
const progress = computed(() => checklistProgress(props.task));
const conflictFields = computed(() => conflictSnapshotDetail(props.task));
const overdue = computed(() => isOverdue(props.task));

function taskMenuLabel(action: string, title: string): string {
  return `${action}: ${title}`;
}

function toggleCompletion(task: TaskRecord): void {
  if (isCompletedStatus(task.status)) {
    emit("restore", task);
  } else {
    emit("complete", task);
  }
}

function onSelectionChange(event: Event): void {
  const selected = (event.target as HTMLInputElement).checked;
  emit("selection-change", props.task, selected);
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
    case "sync_failed":
      return settingsStore.t("sync.failed");
    case "conflict":
      return settingsStore.t("sync.conflict");
    default:
      return settingsStore.t("sync.synced");
  }
}

function parseConflictSnapshot(value?: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function conflictSnapshotTitle(value?: string | null): string | null {
  const parsed = parseConflictSnapshot(value);
  const title = parsed?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function snapshotText(snapshot: Record<string, unknown> | null, keys: string[]): string {
  if (!snapshot) return "";
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function snapshotChecklistSummary(snapshot: Record<string, unknown> | null, keys: string[]): string {
  if (!snapshot) return "";
  for (const key of keys) {
    const value = snapshot[key];
    const checklist = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? parseChecklistJson(value)
        : null;
    if (checklist && checklist.length > 0) {
      const done = checklist.filter((item) => item && typeof item === "object" && "done" in item && item.done === true).length;
      return `${done}/${checklist.length}`;
    }
  }
  return "";
}

function snapshotRepeatRuleLabel(snapshot: Record<string, unknown> | null, keys: string[]): string {
  const value = snapshotText(snapshot, keys);
  return value ? getTaskRepeatRuleLabel(value, settingsStore.language) : "";
}

function parseChecklistJson(value: string): unknown[] | null {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type ConflictSnapshotDiff = {
  label: string;
  local: string;
  cloud: string;
};

function conflictSnapshotDetail(task: TaskRecord): ConflictSnapshotDiff[] {
  if (task.syncStatus !== "conflict") return [];
  const local = parseConflictSnapshot(task.conflictLocalJson);
  const cloud = parseConflictSnapshot(task.conflictServerJson);
  if (!local && !cloud) return [];
  const fields = [
    { label: settingsStore.t("task.content"), local: snapshotText(local, ["content"]), cloud: snapshotText(cloud, ["content"]) },
    { label: settingsStore.t("task.due"), local: snapshotText(local, ["due_time", "dueTime"]), cloud: snapshotText(cloud, ["due_time", "dueTime"]) },
    { label: settingsStore.t("task.plan"), local: snapshotText(local, ["planned_date", "plannedDate"]), cloud: snapshotText(cloud, ["planned_date", "plannedDate"]) },
    { label: settingsStore.t("task.reminder"), local: snapshotText(local, ["remind_time", "remindTime"]), cloud: snapshotText(cloud, ["remind_time", "remindTime"]) },
    { label: settingsStore.t("task.repeat"), local: snapshotRepeatRuleLabel(local, ["repeat_rule", "repeatRule"]), cloud: snapshotRepeatRuleLabel(cloud, ["repeat_rule", "repeatRule"]) },
    { label: settingsStore.t("task.tag"), local: snapshotText(local, ["tag"]), cloud: snapshotText(cloud, ["tag"]) },
    { label: settingsStore.t("task.project"), local: snapshotText(local, ["project"]), cloud: snapshotText(cloud, ["project"]) },
    { label: settingsStore.t("task.checklist"), local: snapshotChecklistSummary(local, ["checklist", "checklistJson"]), cloud: snapshotChecklistSummary(cloud, ["checklist", "checklistJson"]) },
  ];
  return fields
    .filter((field) => field.local !== field.cloud && (field.local || field.cloud));
}

function isOverdue(task: TaskRecord): boolean {
  return isTaskOverdue(task, taskStore.timelineNow, settingsStore.displayTimeZone);
}

</script>

<template>
  <article class="task-row" :aria-busy="busy || undefined" :class="{ completed: isCompletedStatus(task.status), compact, overdue, deleted: trash, selectable }">
    <label v-if="selectable" class="task-selection-checkbox" @click.stop>
      <input
        type="checkbox"
        :checked="selected"
        :aria-label="`${settingsStore.t('task.bulkActions')}: ${task.title}`"
        @change="onSelectionChange"
      />
    </label>

    <button
      v-if="!trash && !selectable"
      class="check-button"
      type="button"
      :disabled="busy"
      :title="taskMenuLabel(isCompletedStatus(task.status) ? settingsStore.t('task.restore') : settingsStore.t('task.complete'), task.title)"
      :aria-label="taskMenuLabel(isCompletedStatus(task.status) ? settingsStore.t('task.restore') : settingsStore.t('task.complete'), task.title)"
      @click="toggleCompletion(task)"
    >
    </button>

    <div class="task-body" @dblclick="$emit('edit', task)">
      <div class="task-title-line">
        <h3 class="task-title">
          <button
            class="task-edit-trigger"
            type="button"
            :aria-label="taskMenuLabel(settingsStore.t('task.editAction'), task.title)"
            @click="$emit('edit', task)"
            @dblclick.stop
          >
            {{ task.title }}
          </button>
        </h3>
        <span v-if="task.syncStatus !== 'synced'" class="sync-pill">{{ syncStatusText(task.syncStatus) }}</span>
      </div>
      <p v-if="task.content" class="task-content-preview">{{ task.content }}</p>
      <div class="task-meta">
        <span v-if="overdue" class="overdue-pill">{{ settingsStore.t("task.filterOverdue") }}</span>
        <span v-if="task.dueTime">{{ settingsStore.t("task.due") }} {{ formatShanghaiDateTime(task.dueTime, settingsStore.language, settingsStore.displayTimeZone) }}</span>
        <span v-if="task.plannedDate">{{ settingsStore.t("task.plan") }} {{ task.plannedDate }}</span>
        <span v-if="task.tag">#{{ task.tag }}</span>
        <span v-if="task.project">{{ task.project }}</span>
        <span v-if="progress">{{ settingsStore.t("task.checklist") }} {{ progress }}</span>
        <span v-if="task.repeatRule">{{ settingsStore.t("task.repeat") }} {{ getTaskRepeatRuleLabel(task.repeatRule, settingsStore.language) }}</span>
        <span v-if="task.isTemplate">{{ settingsStore.t("task.template") }}</span>
        <span v-if="task.priority > 0">{{ settingsStore.t("task.priority") }} {{ getTaskPriorityLabel(task.priority, settingsStore.language) }}</span>
      </div>
      <div v-if="task.syncStatus === 'conflict'" class="conflict-detail">
        <p>{{ settingsStore.t("sync.conflictHelp") }}</p>
        <div class="conflict-snapshot-grid">
          <section class="conflict-snapshot-card">
            <strong>{{ settingsStore.t("sync.localSnapshot") }}</strong>
            <span class="conflict-snapshot-title">{{ conflictSnapshotTitle(task.conflictLocalJson) || task.title }}</span>
            <ul v-if="conflictFields.length">
              <li v-for="field in conflictFields" :key="`local-${field.label}`">
                <span>{{ field.label }}</span>
                <b>{{ field.local || "-" }}</b>
              </li>
            </ul>
          </section>
          <section class="conflict-snapshot-card" :class="{ muted: !conflictSnapshotTitle(task.conflictServerJson) }">
            <strong>{{ settingsStore.t("sync.cloudSnapshot") }}</strong>
            <span class="conflict-snapshot-title">
              {{ conflictSnapshotTitle(task.conflictServerJson) || settingsStore.t("sync.cloudSnapshotMissing") }}
            </span>
            <ul v-if="conflictFields.length">
              <li v-for="field in conflictFields" :key="`cloud-${field.label}`">
                <span>{{ field.label }}</span>
                <b>{{ field.cloud || "-" }}</b>
              </li>
            </ul>
          </section>
        </div>
        <span v-if="!conflictFields.length">{{ settingsStore.t("sync.conflictNoFieldDiff") }}</span>
        <div class="conflict-actions-inline">
          <button
            type="button"
            :disabled="busy || !conflictSnapshotTitle(task.conflictServerJson)"
            @click="$emit('useServer', task)"
          >
            {{ settingsStore.t("sync.useServer") }}
          </button>
          <button type="button" :disabled="busy" @click="$emit('overwriteServer', task)">
            {{ settingsStore.t("sync.overwriteServer") }}
          </button>
        </div>
      </div>
    </div>

    <div class="task-actions">
      <button v-if="trash" type="button" @click="$emit('restore', task)">
        {{ settingsStore.t("task.restoreFromTrash") }}
      </button>
      <button v-if="trash" type="button" @click="$emit('purge', task)">
        {{ settingsStore.t("task.purge") }}
      </button>
      <TaskActionMenu v-if="!trash" :task="task" :disabled="busy" @action="(action, target) => emit(action, target)" />
    </div>
  </article>
</template>

<style scoped>
.task-content-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  white-space: pre-line;
}

.task-title {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.task-edit-trigger {
  max-width: 100%;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
