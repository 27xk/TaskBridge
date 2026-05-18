<script setup lang="ts">
import { reactive, ref, watch } from "vue";

import { useSettingsStore } from "../stores/settings";
import type { TaskDraft } from "../stores/task";
import { isoToShanghaiDateTimeInput, shanghaiDateTimeInputToIso } from "../../shared/quick-add-parser";

const props = defineProps<{
  task?: TaskRecord | null;
  title?: string;
}>();
const settingsStore = useSettingsStore();
const detailsOpen = ref(false);

const emit = defineEmits<{
  save: [draft: TaskDraft];
  cancel: [];
}>();

interface TaskEditorForm extends TaskDraft {
  title: string;
  content: string;
  priority: number;
  tag: string;
  project: string;
  listType: string;
  dueTime: string;
  remindTime: string;
  repeatRule: string;
  plannedDate: string;
  checklistText: string;
  isTemplate: boolean;
  templateName: string;
}

const form = reactive<TaskEditorForm>({
  title: "",
  content: "",
  priority: 0,
  tag: "",
  project: "",
  listType: "inbox",
  dueTime: "",
  remindTime: "",
  repeatRule: "",
  plannedDate: "",
  checklistText: "",
  isTemplate: false,
  templateName: "",
});

watch(
  () => props.task,
  (task) => {
    form.title = task?.title ?? "";
    form.content = task?.content ?? "";
    form.priority = task?.priority ?? 0;
    form.tag = task?.tag ?? "";
    form.project = task?.project ?? "";
    form.listType = task?.listType ?? "inbox";
    form.dueTime = toDateTimeInput(task?.dueTime);
    form.remindTime = toDateTimeInput(task?.remindTime);
    form.repeatRule = task?.repeatRule ?? "";
    form.plannedDate = task?.plannedDate ?? "";
    form.checklistText = checklistJsonToText(task?.checklistJson);
    form.isTemplate = task?.isTemplate ?? false;
    form.templateName = task?.templateName ?? "";
    detailsOpen.value = Boolean(task && hasAdvancedFields(task));
  },
  { immediate: true },
);

function submit(): void {
  const title = form.title.trim();
  if (!title) return;
  emit("save", {
    ...form,
    title,
    dueTime: fromDateTimeInput(form.dueTime),
    remindTime: fromDateTimeInput(form.remindTime),
    plannedDate: form.plannedDate || null,
    checklistText: form.checklistText,
    isTemplate: form.isTemplate,
    templateName: form.templateName,
  });
}

function toDateTimeInput(value?: string | null): string {
  return isoToShanghaiDateTimeInput(value);
}

function fromDateTimeInput(value?: string | null): string | null {
  return shanghaiDateTimeInputToIso(value);
}

function checklistJsonToText(value?: string | null): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return "";
    return parsed
      .map((item) => (typeof item?.title === "string" ? item.title : ""))
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function hasAdvancedFields(task: TaskRecord): boolean {
  return Boolean(
    task.dueTime ||
      task.remindTime ||
      task.priority > 0 ||
      task.tag ||
      task.project ||
      task.plannedDate ||
      task.repeatRule ||
      (task.checklistJson && task.checklistJson !== "[]") ||
      task.isTemplate,
  );
}
</script>

<template>
  <form class="task-editor" @submit.prevent="submit">
    <header class="panel-header">
      <h2>{{ title ?? (task ? settingsStore.t("task.edit") : settingsStore.t("task.add")) }}</h2>
      <button type="button" class="ghost-button" @click="$emit('cancel')">{{ settingsStore.t("task.close") }}</button>
    </header>

    <label>
      <span>{{ settingsStore.t("task.title") }}</span>
      <input
        v-model="form.title"
        type="text"
        required
        autofocus
        maxlength="255"
        :placeholder="settingsStore.t('task.quickPlaceholder')"
      />
    </label>

    <p class="editor-hint">{{ settingsStore.t("task.autoFillHint") }}</p>

    <label>
      <span>{{ settingsStore.t("task.content") }}</span>
      <textarea v-model="form.content" rows="3"></textarea>
    </label>

    <button type="button" class="ghost-button advanced-toggle" @click="detailsOpen = !detailsOpen">
      {{ detailsOpen ? settingsStore.t("task.hideSettings") : settingsStore.t("task.moreSettings") }}
    </button>

    <section v-if="detailsOpen" class="advanced-fields">
      <div class="editor-grid">
        <label>
          <span>{{ settingsStore.t("task.due") }}</span>
          <input v-model="form.dueTime" type="datetime-local" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.reminder") }}</span>
          <input v-model="form.remindTime" type="datetime-local" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.priority") }}</span>
          <input v-model.number="form.priority" type="number" min="0" max="5" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.tag") }}</span>
          <input v-model="form.tag" type="text" maxlength="64" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.project") }}</span>
          <input v-model="form.project" type="text" maxlength="128" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.plan") }}</span>
          <input v-model="form.plannedDate" type="date" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.list") }}</span>
          <select v-model="form.listType">
            <option value="inbox">{{ settingsStore.t("task.inbox") }}</option>
            <option value="today">{{ settingsStore.t("nav.today") }}</option>
          </select>
        </label>
      </div>

      <label>
        <span>{{ settingsStore.t("task.repeat") }}</span>
        <input v-model="form.repeatRule" type="text" placeholder="daily / weekly / monthly" />
      </label>

      <label>
        <span>{{ settingsStore.t("task.checklist") }}</span>
        <textarea v-model="form.checklistText" rows="4" :placeholder="settingsStore.t('task.checklistPlaceholder')"></textarea>
      </label>

      <label class="checkbox-line">
        <input v-model="form.isTemplate" type="checkbox" />
        <span>{{ settingsStore.t("task.saveTemplate") }}</span>
      </label>

      <label v-if="form.isTemplate">
        <span>{{ settingsStore.t("task.templateName") }}</span>
        <input v-model="form.templateName" type="text" maxlength="128" />
      </label>
    </section>

    <div class="form-actions">
      <button type="button" class="secondary-button" @click="$emit('cancel')">{{ settingsStore.t("task.cancel") }}</button>
      <button type="submit" class="primary-button">{{ settingsStore.t("task.save") }}</button>
    </div>
  </form>
</template>
