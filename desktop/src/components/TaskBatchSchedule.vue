<script setup lang="ts">
import { computed, shallowRef, useId, watch } from "vue";
import { CalendarDays, Flag } from "lucide-vue-next";

import { useSettingsStore } from "../stores/settings";
import { getTaskPriorityOptions } from "../../shared/task-ui-policy";
import { isValidCalendarDate } from "../../shared/workspace-view-state";

const props = defineProps<{ busy: boolean; defaultDate: string }>();
const emit = defineEmits<{ planToday: []; reschedule: [date: string]; setPriority: [priority: 0 | 1 | 2 | 3 | 4 | 5] }>();
const settingsStore = useSettingsStore();
const date = shallowRef(props.defaultDate);
const dateTouched = shallowRef(false);
const invalidDate = shallowRef(false);
const priority = shallowRef<"" | 0 | 1 | 2 | 3 | 4 | 5>("");
const fieldId = useId();
const priorityOptions = computed(() => getTaskPriorityOptions(settingsStore.language));
const labels = computed(() => settingsStore.language === "zh-CN" ? {
  today: "安排到今天", date: "设置日期", priority: "设置优先级", apply: "应用", choose: "选择优先级",
  invalidDate: "请选择有效日期，例如 2026-10-10。",
} : {
  today: "Plan for today", date: "Set date", priority: "Set priority", apply: "Apply", choose: "Choose priority",
  invalidDate: "Choose a valid date, for example 2026-10-10.",
});

watch(() => props.defaultDate, (value) => { if (!dateTouched.value) date.value = value; });

function submitDate(): void {
  if (props.busy) return;
  invalidDate.value = !isValidCalendarDate(date.value);
  if (!invalidDate.value) emit("reschedule", date.value);
}

function submitPriority(): void {
  if (props.busy || priority.value === "") return;
  emit("setPriority", priority.value);
}

function closeMenu(event: KeyboardEvent): void {
  const menu = event.currentTarget as HTMLDetailsElement;
  menu.open = false;
  menu.querySelector("summary")?.focus();
}
</script>

<template>
  <div class="batch-schedule-actions">
    <button class="secondary-button" type="button" :disabled="busy" @click="emit('planToday')">{{ labels.today }}</button>
    <details class="batch-schedule-menu" @keydown.esc.stop.prevent="closeMenu">
      <summary :aria-disabled="busy" @click="busy && $event.preventDefault()"><CalendarDays :size="14" aria-hidden="true" />{{ labels.date }}</summary>
      <form class="batch-schedule-panel" novalidate @submit.prevent="submitDate">
        <label :for="`${fieldId}-date`">{{ labels.date }}</label>
        <input :id="`${fieldId}-date`" v-model="date" type="date" max="9999-12-31" :disabled="busy" :aria-invalid="invalidDate" :aria-describedby="invalidDate ? `${fieldId}-error` : undefined" @input="dateTouched = true; invalidDate = false" />
        <p v-if="invalidDate" :id="`${fieldId}-error`" class="batch-date-error" role="alert">{{ labels.invalidDate }}</p>
        <button class="secondary-button" type="submit" :disabled="busy">{{ labels.apply }}</button>
      </form>
    </details>
    <details class="batch-schedule-menu" @keydown.esc.stop.prevent="closeMenu">
      <summary :aria-disabled="busy" @click="busy && $event.preventDefault()"><Flag :size="14" aria-hidden="true" />{{ labels.priority }}</summary>
      <form class="batch-schedule-panel" @submit.prevent="submitPriority">
        <label :for="`${fieldId}-priority`">{{ labels.priority }}</label>
        <select :id="`${fieldId}-priority`" v-model="priority" :disabled="busy">
          <option value="" disabled>{{ labels.choose }}</option>
          <option v-for="option in priorityOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <button class="secondary-button" type="submit" :disabled="busy || priority === ''">{{ labels.apply }}</button>
      </form>
    </details>
  </div>
</template>

<style scoped>
.batch-schedule-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.batch-schedule-menu { position: relative; }
.batch-schedule-menu > summary { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 10px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; cursor: pointer; list-style: none; }
.batch-schedule-menu > summary::-webkit-details-marker { display: none; }
.batch-schedule-menu > summary[aria-disabled="true"] { opacity: 0.55; cursor: default; }
.batch-schedule-panel { position: absolute; z-index: 24; top: calc(100% + 6px); left: 0; display: grid; gap: 8px; width: 220px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 30px color-mix(in srgb, var(--text) 12%, transparent); }
.batch-schedule-menu:last-child .batch-schedule-panel { right: 0; left: auto; }
.batch-schedule-panel label { color: var(--muted); font-size: 12px; }
.batch-schedule-panel input, .batch-schedule-panel select { width: 100%; min-height: 34px; padding: 6px 8px; font-size: 12px; }
.batch-schedule-panel button { min-height: 32px; font-size: 12px; }
.batch-date-error { margin: 0; color: var(--danger); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) { .batch-schedule-panel { right: 0; left: auto; } }
</style>
