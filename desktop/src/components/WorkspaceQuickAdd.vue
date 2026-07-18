<script setup lang="ts">
import { Plus, SlidersHorizontal } from "lucide-vue-next";
import { ref, useTemplateRef } from "vue";

import { useSettingsStore } from "../stores/settings";

defineProps<{
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
}>();

const emit = defineEmits<{
  submit: [title: string];
  openEditor: [];
}>();

const settingsStore = useSettingsStore();
const title = ref("");
const input = useTemplateRef<HTMLInputElement>("input");

function submit(): void {
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

defineExpose({ clear, focus });
</script>

<template>
  <form class="workspace-quick-add" @submit.prevent="submit">
    <input
      ref="input"
      v-model="title"
      type="text"
      maxlength="120"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-errormessage="invalid ? errorId : undefined"
      :aria-label="settingsStore.t('task.quickAdd')"
      :placeholder="settingsStore.t('task.quickAdd')"
    />
    <button
      type="submit"
      :disabled="disabled"
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
