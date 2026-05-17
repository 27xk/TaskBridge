<script setup lang="ts">
import { reactive, watch } from "vue";

import type { TaskDraft } from "../stores/task";

const props = defineProps<{
  task?: TaskRecord | null;
  title?: string;
}>();

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
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

function fromDateTimeInput(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
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
</script>

<template>
  <form class="task-editor" @submit.prevent="submit">
    <header class="panel-header">
      <h2>{{ title ?? (task ? "Edit task" : "Add task") }}</h2>
      <button type="button" class="ghost-button" @click="$emit('cancel')">Close</button>
    </header>

    <label>
      <span>Title</span>
      <input
        v-model="form.title"
        type="text"
        required
        autofocus
        maxlength="255"
        placeholder="例如：明天下午3点 写周报 #工作 P3"
      />
    </label>

    <label>
      <span>Content</span>
      <textarea v-model="form.content" rows="3"></textarea>
    </label>

    <div class="editor-grid">
      <label>
        <span>Due time</span>
        <input v-model="form.dueTime" type="datetime-local" />
      </label>
      <label>
        <span>Reminder</span>
        <input v-model="form.remindTime" type="datetime-local" />
      </label>
      <label>
        <span>Priority</span>
        <input v-model.number="form.priority" type="number" min="0" max="5" />
      </label>
      <label>
        <span>Tag</span>
        <input v-model="form.tag" type="text" maxlength="64" />
      </label>
      <label>
        <span>Project</span>
        <input v-model="form.project" type="text" maxlength="128" />
      </label>
      <label>
        <span>Plan date</span>
        <input v-model="form.plannedDate" type="date" />
      </label>
      <label>
        <span>List</span>
        <select v-model="form.listType">
          <option value="inbox">Inbox</option>
          <option value="today">Today</option>
        </select>
      </label>
    </div>

    <label>
      <span>Repeat rule</span>
      <input v-model="form.repeatRule" type="text" placeholder="daily / weekly / monthly" />
    </label>

    <label>
      <span>Checklist</span>
      <textarea v-model="form.checklistText" rows="4" placeholder="One item per line"></textarea>
    </label>

    <label class="checkbox-line">
      <input v-model="form.isTemplate" type="checkbox" />
      <span>Save as template</span>
    </label>

    <label v-if="form.isTemplate">
      <span>Template name</span>
      <input v-model="form.templateName" type="text" maxlength="128" />
    </label>

    <div class="form-actions">
      <button type="button" class="secondary-button" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="primary-button">Save</button>
    </div>
  </form>
</template>
