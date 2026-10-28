<script setup lang="ts">
import type { TaskListItem } from "../../common/task";
import { useTemplateRef } from "vue";
import TaskItem from "./TaskItem.vue";
import { useTaskVirtualList } from "../composables/useTaskVirtualList";
import { useSettingsStore } from "../stores/settings";
import { isCompletedStatus } from "../utils/task-order";

const props = withDefaults(defineProps<{
  title?: string;
  tasks: TaskListItem[];
  tone?: "default" | "overdue" | "completed";
  trash?: boolean;
  selectable?: boolean;
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  busy?: boolean;
}>(), {
  title: "",
  tone: "default",
  trash: false,
  selectable: false,
  selectionMode: false,
  selectedTaskIds: () => new Set<string>(),
});

const settings = useSettingsStore();
const list = useTemplateRef<HTMLElement>("list");
const { rows, totalHeight, scrollMargin, measure, onFocusIn, onFocusOut, onKeyDown } = useTaskVirtualList(
  list, () => props.tasks, () => settings.desktopDensity,
);

defineEmits<{
  edit: [task: TaskListItem];
  complete: [task: TaskListItem];
  restore: [task: TaskListItem];
  delete: [task: TaskListItem];
  purge: [task: TaskListItem];
  postpone: [task: TaskListItem];
  snooze: [task: TaskListItem];
  planToday: [task: TaskListItem];
  nextOccurrence: [task: TaskListItem];
  instantiateTemplate: [task: TaskListItem];
  useServer: [task: TaskListItem];
  overwriteServer: [task: TaskListItem];
  "selection-change": [task: TaskListItem, selected: boolean];
}>();
</script>

<template>
  <section v-if="tasks.length > 0" class="task-list-section">
    <div
      v-if="title"
      class="task-section-header"
      :class="{ 'overdue-section': tone === 'overdue', 'completed-section': tone === 'completed' }"
    >
      <span>{{ title }}</span>
      <strong>{{ tasks.length }}</strong>
    </div>
    <div ref="list" class="virtual-task-list" role="list" :aria-label="title || settings.t('nav.all')" :data-task-count="tasks.length"
      :style="{ height: `${totalHeight}px` }" @focusin="onFocusIn" @focusout="onFocusOut" @keydown="onKeyDown">
    <div v-for="row in rows" :key="tasks[row.index].localId" :ref="measure"
      class="virtual-task-row" role="listitem" tabindex="-1" :aria-setsize="tasks.length" :aria-posinset="row.index + 1"
      :data-index="row.index" :data-task-id="tasks[row.index].localId"
      :style="{ transform: `translateY(${row.start - scrollMargin}px)` }">
    <TaskItem
      :task="tasks[row.index]"
      :trash="trash"
      :selectable="selectionMode && selectable && (trash || (!isCompletedStatus(tasks[row.index].status) && !tasks[row.index].isTemplate))"
      :selected="selectedTaskIds.has(tasks[row.index].localId)"
      :busy="busy"
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
    </div>
    </div>
  </section>
</template>

<style scoped>
.task-list-section { min-width: 0; }
.virtual-task-list { position: relative; width: 100%; overflow-anchor: none; transition-property: none; }
.virtual-task-row { position: absolute; top: 0; left: 0; width: 100%; outline-offset: -2px; transition-property: none; }
</style>
