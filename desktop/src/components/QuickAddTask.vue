<script setup lang="ts">
import { ref } from "vue";

import { useSettingsStore } from "../stores/settings";

const emit = defineEmits<{
  submit: [title: string];
}>();

const settingsStore = useSettingsStore();
const title = ref("");

function submit(): void {
  const trimmed = title.value.trim();
  if (!trimmed) return;
  emit("submit", trimmed);
  title.value = "";
}
</script>

<template>
  <form class="floating-quick-add" @submit.prevent="submit">
    <input
      v-model="title"
      data-floating-quick-add
      type="text"
      maxlength="120"
      :aria-label="settingsStore.t('floating.addTask')"
      :placeholder="settingsStore.t('floating.placeholder')"
    />
    <button
      type="submit"
      :title="settingsStore.t('floating.addTask')"
      :aria-label="settingsStore.t('floating.addTask')"
    >
      +
    </button>
  </form>
</template>
