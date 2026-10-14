<script setup lang="ts">
import { useTemplateRef } from "vue";
import { LoaderCircle, Plus } from "lucide-vue-next";

import { useSettingsStore } from "../stores/settings";

const props = defineProps<{ disabled?: boolean; errorMessage?: string }>();
const emit = defineEmits<{ submit: [title: string] }>();
const title = defineModel<string>({ default: "" });
const input = useTemplateRef<HTMLInputElement>("input");
const settingsStore = useSettingsStore();

function submit(): void {
  if (props.disabled) return;
  const trimmed = title.value.trim();
  if (!trimmed) return;
  emit("submit", trimmed);
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

defineExpose({ focus });
</script>

<template>
  <form class="floating-quick-add" :aria-busy="disabled || undefined" @submit.prevent="submit" @keydown="onKeyDown">
    <input
      ref="input"
      v-model="title"
      data-floating-quick-add
      type="text"
      maxlength="255"
      :disabled="disabled"
      :aria-invalid="Boolean(errorMessage) || undefined"
      :aria-describedby="errorMessage ? 'floating-quick-add-error' : undefined"
      :aria-label="settingsStore.t('floating.addTask')"
      :placeholder="settingsStore.t('floating.placeholder')"
      autocomplete="off"
    />
    <button
      type="submit"
      :disabled="disabled || !title.trim()"
      :title="settingsStore.t('floating.addTask')"
      :aria-label="settingsStore.t('floating.addTask')"
    >
      <LoaderCircle v-if="disabled" class="floating-save-spinner" :size="16" aria-hidden="true" />
      <Plus v-else :size="18" aria-hidden="true" />
    </button>
  </form>
</template>
