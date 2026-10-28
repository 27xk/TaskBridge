<script setup lang="ts">
import { Plus, SlidersHorizontal } from "lucide-vue-next";
import { useTemplateRef } from "vue";

import { useSettingsStore } from "../stores/settings";

const props = defineProps<{
  disabled?: boolean;
  editorOpen?: boolean;
  invalid?: boolean;
  errorId?: string;
}>();

const emit = defineEmits<{
  submit: [title: string];
  openEditor: [];
}>();

const settingsStore = useSettingsStore();
const title = defineModel<string>({ default: "" });
const input = useTemplateRef<HTMLInputElement>("input");

function submit(): void {
  if (props.disabled || props.editorOpen) return;
  const trimmedTitle = title.value.trim();
  if (!trimmedTitle) return;
  emit("submit", trimmedTitle);
}

function clear(submittedTitle: string): boolean {
  if (title.value.trim() !== submittedTitle.trim()) return false;
  title.value = "";
  return true;
}

function focus(): void {
  input.value?.focus();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    event.stopPropagation();
    submit();
  }
}

defineExpose({ clear, focus });
</script>

<template>
  <form class="workspace-quick-add" @submit.prevent="submit" @keydown="onKeyDown">
    <input
      ref="input"
      v-model="title"
      type="text"
      maxlength="255"
      :disabled="disabled || editorOpen"
      :aria-invalid="invalid || undefined"
      :aria-errormessage="invalid ? errorId : undefined"
      :aria-label="settingsStore.t('task.quickAdd')"
      :placeholder="settingsStore.t('task.quickAdd')"
    />
    <button
      type="submit"
      :disabled="disabled || editorOpen"
      :title="settingsStore.t('task.quickAdd')"
      :aria-label="settingsStore.t('task.quickAdd')"
    >
      <Plus aria-hidden="true" />
    </button>
    <button
      type="button"
      :disabled="disabled"
      :title="settingsStore.t('task.quickAddMore')"
      :aria-label="settingsStore.t('task.quickAddMore')"
      @click="emit('openEditor')"
    >
      <SlidersHorizontal aria-hidden="true" />
    </button>
  </form>
</template>
