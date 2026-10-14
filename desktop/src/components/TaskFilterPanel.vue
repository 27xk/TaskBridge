<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import { SlidersHorizontal } from "lucide-vue-next";

import { useDismissibleDetails } from "../composables/useDismissibleDetails";
import { useSettingsStore } from "../stores/settings";
import { getTaskPriorityOptions } from "../../shared/task-ui-policy";
import type { TaskViewCriteria, TaskViewList, TaskViewSelectionKey } from "../../shared/workspace-view-state";

const props = defineProps<{
  criteria: TaskViewCriteria;
  projects: string[];
  categories: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  selectionChange: [key: TaskViewSelectionKey, value: string | number];
}>();
const settingsStore = useSettingsStore();
const menu = useTemplateRef<HTMLDetailsElement>("menu");
const menuSummary = useTemplateRef<HTMLElement>("menuSummary");
const panel = useTemplateRef<HTMLElement>("panel");
const { close } = useDismissibleDetails(menu, menuSummary);
const panelLeft = shallowRef("0px");
const panelMaxHeight = shallowRef<string | undefined>();
const isChinese = computed(() => settingsStore.language === "zh-CN");
const labels = computed(() => isChinese.value ? {
  title: "列表与状态", hint: "可多选，再次点击取消", lists: "列表", statuses: "状态",
  categories: "分类", projects: "项目", priorities: "优先级", uncategorized: "未分类", unassigned: "无项目",
} : {
  title: "Lists and status", hint: "Select multiple; click again to clear", lists: "Lists", statuses: "Status",
  categories: "Categories", projects: "Projects", priorities: "Priority", uncategorized: "Uncategorized", unassigned: "No project",
});

interface FilterOption { value: string | number; label: string }
interface FilterSection { key: TaskViewSelectionKey; label: string; options: FilterOption[] }
const listOptions = computed<Array<{ value: TaskViewList; label: string }>>(() => [
  { value: "inbox", label: settingsStore.t("task.inbox") },
  { value: "today", label: settingsStore.t("nav.today") },
  { value: "week", label: settingsStore.t("task.filterWeek") },
  { value: "overdue", label: settingsStore.t("task.filterOverdue") },
  { value: "pending", label: settingsStore.t("task.filterPending") },
  { value: "conflict", label: settingsStore.t("sync.conflict") },
  { value: "templates", label: settingsStore.t("task.template") },
  { value: "trash", label: settingsStore.t("task.trash") },
]);
const sections = computed<FilterSection[]>(() => [
  { key: "lists", label: labels.value.lists, options: listOptions.value },
  { key: "statuses", label: labels.value.statuses, options: [
    { value: "open", label: settingsStore.t("task.filterOpen") },
    { value: "completed", label: settingsStore.t("task.completedCountPrefix") },
  ] },
  { key: "categories", label: labels.value.categories, options: [
    { value: "", label: labels.value.uncategorized },
    ...[...new Set([...props.categories, ...props.criteria.categories])].filter(Boolean).map((value) => ({ value, label: value })),
  ] },
  { key: "projects", label: labels.value.projects, options: [
    { value: "", label: labels.value.unassigned },
    ...[...new Set([...props.projects, ...props.criteria.projects])].filter(Boolean).map((value) => ({ value, label: value })),
  ] },
  { key: "priorities", label: labels.value.priorities, options: [
    { value: "high", label: settingsStore.t("task.filterHigh") },
    ...getTaskPriorityOptions(settingsStore.language),
  ] },
]);

function selected(key: TaskViewSelectionKey, value: string | number): boolean {
  const values: readonly (string | number)[] = props.criteria[key];
  return values.includes(value);
}

function selectOption(key: TaskViewSelectionKey, value: string | number): void {
  if (!props.disabled) emit("selectionChange", key, value);
}

function preventDisabledOpen(event: Event): void {
  if (props.disabled) event.preventDefault();
}

async function toggleMenu(event: MouseEvent): Promise<void> {
  event.preventDefault();
  if (props.disabled || !menu.value) return;
  if (menu.value.open) { close(false); return; }
  menu.value.open = true;
  positionPanel();
  await nextTick();
  positionPanel();
}

function positionPanel(): void {
  if (!menu.value?.open || !panel.value) return;
  const anchor = menu.value.getBoundingClientRect();
  const width = panel.value.getBoundingClientRect().width;
  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
  panelLeft.value = `${left - anchor.left}px`;
  panelMaxHeight.value = `${Math.max(120, Math.min(560, window.innerHeight - anchor.bottom - 20))}px`;
  panel.value.style.left = panelLeft.value;
  panel.value.style.maxHeight = panelMaxHeight.value;
}

watch(() => props.disabled, (disabled) => { if (disabled) close(false); });
onMounted(() => window.addEventListener("resize", positionPanel));
onBeforeUnmount(() => window.removeEventListener("resize", positionPanel));
</script>

<template>
  <details ref="menu" class="filter-menu task-filter-panel" @toggle="positionPanel">
    <summary ref="menuSummary" :aria-disabled="disabled || undefined" :tabindex="disabled ? -1 : 0" @click="toggleMenu" @keydown.enter.space="preventDisabledOpen">
      <SlidersHorizontal :size="15" aria-hidden="true" />
      <span>{{ labels.title }}</span>
    </summary>
    <div ref="panel" class="filter-menu-panel" :style="{ left: panelLeft, maxHeight: panelMaxHeight }">
      <p class="filter-menu-hint">{{ labels.hint }}</p>
      <section v-for="section in sections" :key="section.key" class="filter-menu-section" role="group" :aria-label="section.label">
        <h3 class="filter-menu-label">{{ section.label }}</h3>
        <button
          v-for="option in section.options"
          :key="`${section.key}:${option.value}`"
          type="button"
          class="filter-option"
          :class="{ active: selected(section.key, option.value) }"
          :disabled="disabled"
          :aria-pressed="selected(section.key, option.value)"
          @click="selectOption(section.key, option.value)"
        >{{ option.label }}</button>
      </section>
    </div>
  </details>
</template>

<style scoped>
.task-filter-panel { position: relative; }
.task-filter-panel > summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--workspace-line, var(--border));
  border-radius: var(--control-radius, 8px);
  color: var(--workspace-text, var(--text));
  background: var(--workspace-canvas, var(--surface));
  cursor: pointer;
  font-size: 12px;
  list-style: none;
}
.task-filter-panel > summary::-webkit-details-marker { display: none; }
.task-filter-panel > summary[aria-disabled="true"] { opacity: .5; cursor: default; }
.filter-menu.task-filter-panel > .filter-menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: auto;
  z-index: 24;
  display: grid;
  gap: 16px;
  width: min(420px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 150px));
  padding: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--workspace-line, var(--border));
  border-radius: 12px;
  background: var(--workspace-canvas, var(--surface));
  box-shadow: 0 14px 40px color-mix(in srgb, var(--workspace-text, var(--text)) 14%, transparent);
}
.task-filter-panel .filter-menu-hint { margin: 0; color: var(--workspace-muted, var(--muted)); font-size: 11px; line-height: 1.5; }
.task-filter-panel .filter-menu-section { display: flex; flex-wrap: wrap; gap: 6px; }
.task-filter-panel .filter-menu-label { flex: 0 0 100%; margin: 0 0 2px; color: var(--workspace-muted, var(--muted)); font-size: 11px; font-weight: 600; }
.task-filter-panel .filter-option {
  max-width: 100%;
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--workspace-line, var(--border));
  border-radius: 7px;
  color: var(--workspace-text, var(--text));
  background: var(--workspace-canvas, var(--surface));
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.5;
  transition: background-color .12s, border-color .12s;
}
.task-filter-panel .filter-option[aria-pressed="true"], .task-filter-panel .filter-option:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--workspace-accent, var(--primary)) 36%, var(--workspace-line, var(--border)));
  color: var(--primary-strong, var(--primary));
  background: color-mix(in srgb, var(--workspace-accent, var(--primary)) 8%, var(--workspace-canvas, var(--surface)));
}
.task-filter-panel .filter-option:focus-visible, .task-filter-panel > summary:focus-visible { outline: 2px solid var(--workspace-accent, var(--primary)); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .task-filter-panel .filter-option { transition: none; } }
</style>
