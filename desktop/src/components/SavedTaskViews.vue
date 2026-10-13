<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from "vue";
import { Bookmark, Trash2 } from "lucide-vue-next";

import { useSettingsStore } from "../stores/settings";
import { useWorkspaceStore } from "../stores/workspace";
import { normalizeTaskViewCriteria, type TaskViewCriteria } from "../../shared/workspace-view-state";

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ applied: [] }>();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const name = shallowRef("");
const errorCode = shallowRef("");
const message = shallowRef("");
const menu = useTemplateRef<HTMLDetailsElement>("menu");
const menuSummary = useTemplateRef<HTMLElement>("menuSummary");
const isChinese = computed(() => settingsStore.language === "zh-CN");
const disabled = computed(() => props.disabled || !workspaceStore.workspaceKey);
const currentCriteria = computed(() => JSON.stringify(normalizeTaskViewCriteria(workspaceStore.taskView)));
const labels = computed(() => isChinese.value ? {
  views: "视图", title: "保存与切换视图", weekly: "本周高优先级", projectOpen: "当前项目待办",
  weekHint: "周一至周日 · 未完成 · 高优先级", saved: "已保存的视图", empty: "还没有保存视图",
  name: "视图名称", placeholder: "例如：项目待办", save: "保存当前条件", remove: "删除视图",
  storage: "暂时无法保存筛选条件，当前条件会在本次运行中保留。",
} : {
  views: "Views", title: "Save and switch views", weekly: "High priority this week", projectOpen: "Open tasks in this project",
  weekHint: "Monday–Sunday · Open · High priority", saved: "Saved views", empty: "No saved views yet",
  name: "View name", placeholder: "For example: Project tasks", save: "Save current filters", remove: "Delete view",
  storage: "Filters cannot be saved right now. They remain available during this session.",
});
const errorMessage = computed(() => {
  const messages: Record<string, [string, string]> = {
    "view-name-empty": ["请输入视图名称。", "Enter a name for this view."],
    "view-name-too-long": ["视图名称最多 60 个字符。", "View names can contain up to 60 characters."],
    "view-name-duplicate": ["已有同名视图，请换个名称；原视图会保留。", "A view already uses this name. Choose another name; the original is kept."],
    "workspace-unavailable": ["请进入账号工作区后保存视图。", "Open an account workspace before saving a view."],
    "view-storage-unavailable": ["视图未能保存，请稍后重试。", "The view could not be saved. Please try again."],
  };
  const entry = messages[errorCode.value];
  return errorCode.value ? (entry ?? messages["view-storage-unavailable"])[isChinese.value ? 0 : 1] : "";
});

watch(() => workspaceStore.workspaceKey, () => {
  name.value = "";
  errorCode.value = "";
  message.value = "";
  if (menu.value) menu.value.open = false;
});

function saveView(): void {
  if (disabled.value) return;
  errorCode.value = "";
  message.value = "";
  try {
    const saved = workspaceStore.saveCurrentView(name.value);
    name.value = "";
    message.value = isChinese.value ? `已保存「${saved.name}」` : `Saved “${saved.name}”`;
  } catch (error) {
    errorCode.value = error instanceof Error ? error.message : "view-storage-unavailable";
  }
}

function applyView(id: string): void {
  if (disabled.value || !workspaceStore.applySavedView(id)) return;
  emit("applied");
  closeMenu();
}

function applyShortcut(criteria: Partial<TaskViewCriteria>): void {
  if (disabled.value) return;
  workspaceStore.applyTaskView(criteria);
  emit("applied");
  closeMenu();
}

function removeView(id: string): void {
  if (disabled.value) return;
  errorCode.value = "";
  message.value = "";
  try {
    workspaceStore.deleteSavedView(id);
    message.value = isChinese.value ? "已删除视图" : "View deleted";
  } catch (error) {
    errorCode.value = error instanceof Error ? error.message : "view-storage-unavailable";
  }
}

function closeMenu(): void {
  if (menu.value) menu.value.open = false;
  menuSummary.value?.focus();
}
</script>

<template>
  <details ref="menu" class="saved-views" @keydown.esc.stop.prevent="closeMenu">
    <summary ref="menuSummary" :aria-label="labels.title">
      <Bookmark :size="15" aria-hidden="true" />
      <span>{{ labels.views }}</span>
    </summary>
    <div class="saved-views-panel">
      <button class="saved-view-apply saved-shortcut" type="button" :disabled="disabled" @click="applyShortcut({ filter: 'week', priority: 'high', status: 'open' })">
        <span>{{ labels.weekly }}</span>
        <small>{{ labels.weekHint }}</small>
      </button>
      <button
        v-if="workspaceStore.taskView.project"
        class="saved-view-apply"
        type="button"
        :disabled="disabled"
        @click="applyShortcut({ project: workspaceStore.taskView.project, status: 'open' })"
      >
        {{ labels.projectOpen }} · {{ workspaceStore.taskView.project }}
      </button>
      <div class="saved-views-list">
        <p class="saved-views-label">{{ labels.saved }}</p>
        <p v-if="workspaceStore.savedViews.length === 0" class="saved-views-empty">{{ labels.empty }}</p>
        <ul v-else>
          <li v-for="view in workspaceStore.savedViews" :key="view.id">
            <button
              class="saved-view-apply"
              type="button"
              :disabled="disabled"
              :aria-pressed="JSON.stringify(view.criteria) === currentCriteria"
              @click="applyView(view.id)"
            >{{ view.name }}</button>
            <button class="icon-button" type="button" :disabled="disabled" :aria-label="`${labels.remove}: ${view.name}`" :title="`${labels.remove}: ${view.name}`" @click="removeView(view.id)">
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>
      <form class="save-view-form" @submit.prevent="saveView">
        <label for="saved-task-view-name">{{ labels.name }}</label>
        <input id="saved-task-view-name" v-model="name" maxlength="60" autocomplete="off" :placeholder="labels.placeholder" :disabled="disabled" :aria-invalid="Boolean(errorMessage)" :aria-describedby="errorMessage ? 'saved-task-view-error' : undefined" @input="errorCode = ''; message = ''" />
        <button class="secondary-button" type="submit" :disabled="disabled">{{ labels.save }}</button>
      </form>
      <p v-if="errorMessage" id="saved-task-view-error" class="saved-view-error" role="alert">{{ errorMessage }}</p>
      <p v-else-if="workspaceStore.persistenceError" class="saved-view-error" role="status">{{ labels.storage }}</p>
      <p v-if="message" class="saved-view-message" role="status">{{ message }}</p>
    </div>
  </details>
</template>

<style scoped>
.saved-views { position: relative; margin-left: auto; }
.saved-views > summary { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; list-style: none; color: var(--text); background: var(--surface); font-size: 12px; }
.saved-views > summary::-webkit-details-marker { display: none; }
.saved-views[open] > summary { color: var(--primary); border-color: var(--primary); }
.saved-views-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 22; display: grid; gap: 10px; width: min(320px, calc(100vw - 64px)); padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: 0 12px 30px color-mix(in srgb, var(--text) 12%, transparent); }
.saved-view-apply { min-width: 0; width: 100%; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 4px; text-align: left; color: var(--text); background: transparent; overflow-wrap: anywhere; font-size: 12px; }
.saved-view-apply:hover, .saved-view-apply[aria-pressed="true"] { color: var(--primary); background: var(--surface-muted); }
.saved-shortcut { display: grid; gap: 4px; }
.saved-shortcut small { color: var(--muted); font-size: 11px; }
.saved-views-list { border-top: 1px solid var(--border); padding-top: 10px; }
.saved-views-label, .saved-views-empty, .saved-view-message, .saved-view-error { margin: 0; font-size: 12px; line-height: 1.6; }
.saved-views-label { color: var(--muted); font-size: 11px; }
.saved-views-empty { padding: 8px; color: var(--muted); }
.saved-views-list ul { display: grid; gap: 3px; max-height: 240px; padding: 0; margin: 6px 0 0; overflow-y: auto; list-style: none; }
.saved-views-list li { display: flex; align-items: center; gap: 4px; min-width: 0; }
.saved-views-list .icon-button { flex-shrink: 0; width: 30px; height: 30px; color: var(--muted); }
.saved-views-list .icon-button:hover { color: var(--danger); }
.save-view-form { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--border); }
.save-view-form label { color: var(--muted); font-size: 11px; }
.save-view-form input { width: 100%; min-height: 34px; padding: 6px 8px; font-size: 12px; }
.save-view-form button { min-height: 32px; font-size: 12px; }
.saved-view-error { color: var(--danger); }
.saved-view-message { color: var(--primary); }
@media (max-width: 760px) { .saved-views { margin-left: 0; } .saved-views-panel { left: 0; right: auto; } }
</style>
