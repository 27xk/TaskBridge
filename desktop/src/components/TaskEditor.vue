<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";

import { useSettingsStore } from "../stores/settings";
import type { ChecklistDraftItem, TaskDraft } from "../stores/task";
import { isoToShanghaiDateTimeInput, parseQuickTask, shanghaiDateTimeInputToIso, todayLocalDate } from "../../shared/quick-add-parser";
import { getTaskPriorityOptions } from "../../shared/task-ui-policy";

const props = defineProps<{
  task?: TaskRecord | null;
  createPreset?: "default" | "today";
  title?: string;
}>();
type ChecklistDraftViewItem = ChecklistDraftItem & { id: string; title: string; done: boolean };

const settingsStore = useSettingsStore();
const detailsOpen = ref(false);
const checklistDraftItems = ref<ChecklistDraftViewItem[]>([]);
let syncingChecklistTextFromItems = false;
const repeatOptions = [
  { value: "", zh: "不重复", en: "No repeat" },
  { value: "daily", zh: "每天", en: "Daily" },
  { value: "weekly", zh: "每周", en: "Weekly" },
  { value: "monthly", zh: "每月", en: "Monthly" },
];
const priorityOptions = computed(() => getTaskPriorityOptions(settingsStore.language));
const quickPreview = computed(() => {
  if (props.task || !form.title.trim()) return [];
  const parsed = parseQuickTask(form.title, new Date(), settingsStore.displayTimeZone);
  const chips: string[] = [];
  if (parsed.title && parsed.title !== form.title.trim()) {
    chips.push(`${previewLabel("title")}: ${parsed.title}`);
  }
  if (parsed.dueTime) {
    chips.push(`${previewLabel("due")}: ${toDateTimeInput(parsed.dueTime).replace("T", " ")}`);
  } else if (parsed.plannedDate) {
    chips.push(`${previewLabel("plan")}: ${parsed.plannedDate}`);
  }
  if (parsed.priority > 0) {
    const priority = priorityOptions.value.find((option) => option.value === parsed.priority);
    chips.push(priority?.label ?? `P${parsed.priority}`);
  }
  if (parsed.tag) chips.push(`#${parsed.tag}`);
  if (parsed.project) chips.push(`@${parsed.project}`);
  return chips;
});

const emit = defineEmits<{
  save: [draft: TaskDraft];
  cancel: [];
  "dirty-change": [dirty: boolean];
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

const currentFormSignature = computed(() => JSON.stringify({
  title: form.title,
  content: form.content,
  priority: form.priority,
  tag: form.tag,
  project: form.project,
  listType: form.listType,
  dueTime: form.dueTime,
  remindTime: form.remindTime,
  repeatRule: form.repeatRule,
  plannedDate: form.plannedDate,
  checklistText: form.checklistText,
  checklistItems: checklistDraftItems.value.map((item) => ({
    id: item.id,
    title: item.title,
    done: item.done,
  })),
  isTemplate: form.isTemplate,
  templateName: form.templateName,
}));
const originalFormSignature = computed(() => JSON.stringify({
  title: props.task?.title ?? "",
  content: props.task?.content ?? "",
  priority: props.task?.priority ?? 0,
  tag: props.task?.tag ?? "",
  project: props.task?.project ?? "",
  listType: props.task?.listType ?? createPresetListType(),
  dueTime: toDateTimeInput(props.task?.dueTime),
  remindTime: toDateTimeInput(props.task?.remindTime),
  repeatRule: props.task?.repeatRule ?? "",
  plannedDate: props.task?.plannedDate ?? createPresetPlannedDate(),
  checklistText: checklistJsonToText(props.task?.checklistJson),
  checklistItems: checklistJsonToItems(props.task?.checklistJson),
  isTemplate: props.task?.isTemplate ?? false,
  templateName: props.task?.templateName ?? "",
}));

watch(
  () => currentFormSignature.value !== originalFormSignature.value,
  (dirty) => emit("dirty-change", dirty),
  { immediate: true },
);

watch(
  () => form.checklistText,
  (value) => {
    if (syncingChecklistTextFromItems) return;
    checklistDraftItems.value = checklistTextToDraftItems(value, checklistDraftItems.value);
  },
);

watch(
  () => [props.task, props.createPreset] as const,
  ([task]) => {
    form.title = task?.title ?? "";
    form.content = task?.content ?? "";
    form.priority = task?.priority ?? 0;
    form.tag = task?.tag ?? "";
    form.project = task?.project ?? "";
    form.dueTime = toDateTimeInput(task?.dueTime);
    form.remindTime = toDateTimeInput(task?.remindTime);
    form.repeatRule = task?.repeatRule ?? "";
    if (task) {
      form.listType = task.listType;
      form.plannedDate = task.plannedDate ?? "";
    } else if (props.createPreset === "today") {
      form.listType = "today";
      form.plannedDate = todayDateInputValue();
    } else {
      form.listType = "inbox";
      form.plannedDate = "";
    }
    checklistDraftItems.value = checklistJsonToItems(task?.checklistJson);
    form.checklistText = checklistItemsToText(checklistDraftItems.value);
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
    checklistItems: checklistDraftItems.value,
    isTemplate: form.isTemplate,
    templateName: form.templateName,
  });
}

function toDateTimeInput(value?: string | null): string {
  return isoToShanghaiDateTimeInput(value, settingsStore.displayTimeZone);
}

function fromDateTimeInput(value?: string | null): string | null {
  return shanghaiDateTimeInputToIso(value, settingsStore.displayTimeZone);
}

function todayDateInputValue(): string {
  return todayLocalDate(new Date(), settingsStore.displayTimeZone);
}

function createPresetListType(): string {
  return props.createPreset === "today" ? "today" : "inbox";
}

function createPresetPlannedDate(): string {
  return props.createPreset === "today" ? todayDateInputValue() : "";
}

function previewLabel(key: "title" | "due" | "plan"): string {
  const english = settingsStore.language === "en-US";
  if (key === "title") return english ? "Title" : "标题";
  if (key === "due") return english ? "Due" : "截止";
  return english ? "Plan" : "计划";
}

function checklistJsonToText(value?: string | null): string {
  return checklistItemsToText(checklistJsonToItems(value));
}

function checklistJsonToItems(value?: string | null): ChecklistDraftViewItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        id: typeof item?.id === "string" && item.id ? item.id : `item-${index}`,
        title: typeof item?.title === "string" ? item.title.trim() : "",
        done: Boolean(item?.done),
      }))
      .filter((item) => item.title);
  } catch {
    return [];
  }
}

function checklistItemsToText(items: ChecklistDraftItem[]): string {
  return items
    .map((item) => item.title.trim())
    .filter(Boolean)
    .join("\n");
}

function checklistTextToDraftItems(value: string, existingItems: ChecklistDraftViewItem[]): ChecklistDraftViewItem[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => {
      const existing = existingItems[index]?.title === title ? existingItems[index] : preserveChecklistDraftItem(title, existingItems);
      return {
        id: existing?.id ?? `draft-${Date.now()}-${index}`,
        title,
        done: Boolean(existing?.done),
      };
    });
}

function preserveChecklistDraftItem(title: string, existingItems: ChecklistDraftViewItem[]): ChecklistDraftViewItem | null {
  return existingItems.find((item) => item.title === title) ?? null;
}

function syncChecklistTextFromItems(): void {
  syncingChecklistTextFromItems = true;
  form.checklistText = checklistItemsToText(checklistDraftItems.value);
  void nextTick(() => {
    syncingChecklistTextFromItems = false;
  });
}

function toggleChecklistDraftItem(id: string): void {
  checklistDraftItems.value = checklistDraftItems.value.map((item) =>
    item.id === id ? { ...item, done: !item.done } : item,
  );
  syncChecklistTextFromItems();
}

function deleteChecklistDraftItem(id: string): void {
  checklistDraftItems.value = checklistDraftItems.value.filter((item) => item.id !== id);
  syncChecklistTextFromItems();
}

function hasAdvancedFields(task: TaskRecord): boolean {
  return Boolean(
    task.priority ||
      task.plannedDate ||
      task.dueTime ||
      task.remindTime ||
      task.tag ||
      task.project ||
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
    <div v-if="quickPreview.length" class="quick-preview" aria-live="polite">
      <span v-for="chip in quickPreview" :key="chip" class="quick-preview-chip">{{ chip }}</span>
    </div>

    <label>
      <span>{{ settingsStore.t("task.content") }}</span>
      <textarea v-model="form.content" rows="3"></textarea>
    </label>

    <button type="button" class="ghost-button advanced-toggle" @click="detailsOpen = !detailsOpen">
      {{ detailsOpen ? settingsStore.t("task.hideSettings") : settingsStore.t("task.moreSettings") }}
    </button>

    <section v-if="detailsOpen" class="advanced-fields">
      <div class="task-editor-plan-fields">
        <label>
          <span>{{ settingsStore.t("task.list") }}</span>
          <select v-model="form.listType">
            <option value="inbox">{{ settingsStore.t("task.inbox") }}</option>
            <option value="today">{{ settingsStore.t("nav.today") }}</option>
          </select>
        </label>
        <label>
          <span>{{ settingsStore.t("task.plan") }}</span>
          <input v-model="form.plannedDate" type="date" />
        </label>
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
          <select v-model.number="form.priority">
            <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
      <p class="editor-hint">{{ settingsStore.t("task.scheduleHelp") }}</p>

      <div class="editor-grid">
        <label>
          <span>{{ settingsStore.t("task.tag") }}</span>
          <input v-model="form.tag" type="text" maxlength="64" />
        </label>
        <label>
          <span>{{ settingsStore.t("task.project") }}</span>
          <input v-model="form.project" type="text" maxlength="128" />
        </label>
      </div>

      <label>
        <span>{{ settingsStore.t("task.repeat") }}</span>
        <select v-model="form.repeatRule">
          <option v-for="option in repeatOptions" :key="option.value" :value="option.value">
            {{ settingsStore.language === "zh-CN" ? option.zh : option.en }}
          </option>
        </select>
      </label>

      <label>
        <span>{{ settingsStore.t("task.checklist") }}</span>
        <textarea v-model="form.checklistText" rows="4" :placeholder="settingsStore.t('task.checklistPlaceholder')"></textarea>
      </label>
      <div v-if="checklistDraftItems.length" class="checklist-draft-items">
        <label v-for="item in checklistDraftItems" :key="item.id" class="checklist-draft-item">
          <input type="checkbox" :checked="item.done" @change="toggleChecklistDraftItem(item.id)" />
          <span :class="{ done: item.done }">{{ item.title }}</span>
          <button type="button" class="text-button" @click="deleteChecklistDraftItem(item.id)">
            {{ settingsStore.t("task.delete") }}
          </button>
        </label>
      </div>

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
