<script setup lang="ts">
import { translateSyncMessage } from "../i18n";
import { useSettingsStore } from "../stores/settings";

const props = defineProps<{
  dateLabel: string;
  syncMessage: string;
  syncState: "idle" | "syncing" | "offline" | "error" | "synced";
  opacity: number;
}>();
const settingsStore = useSettingsStore();

const emit = defineEmits<{
  hide: [];
  openMain: [];
  toggleMini: [];
  opacityChange: [value: number];
}>();

function updateOpacity(event: Event): void {
  const input = event.target as HTMLInputElement;
  emit("opacityChange", Number(input.value));
}
</script>

<template>
  <header class="floating-topbar">
    <div class="floating-drag-area">
      <div class="floating-title-line">
        <strong>TaskBridge</strong>
        <span class="floating-status" :data-state="props.syncState">
          <i></i>
          {{ translateSyncMessage(props.syncMessage, settingsStore.language) }}
        </span>
      </div>
      <time>{{ props.dateLabel }}</time>
    </div>

    <div class="floating-window-actions">
      <button type="button" :title="settingsStore.t('floating.openMain')" @click="$emit('openMain')">↗</button>
      <button type="button" :title="settingsStore.t('floating.miniMode')" @click="$emit('toggleMini')">□</button>
      <button type="button" :title="settingsStore.t('floating.hide')" @click="$emit('hide')">−</button>
    </div>
  </header>

  <label class="floating-opacity">
    <span>{{ settingsStore.t("floating.opacity") }}</span>
    <input
      type="range"
      min="0.45"
      max="1"
      step="0.05"
      :value="props.opacity"
      @input="updateOpacity"
    />
  </label>
</template>
