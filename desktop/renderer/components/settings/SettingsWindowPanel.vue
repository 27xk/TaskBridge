<script setup lang="ts">
import { useSettingsStore } from "../../stores/settings";

defineProps<{
  floatingVisibleOnStart: boolean;
  floatingOpacity: number;
}>();

const emit = defineEmits<{
  "update:floatingVisibleOnStart": [value: boolean];
  "update:floatingOpacity": [value: number];
  applyFloatingOpacity: [];
}>();

const settingsStore = useSettingsStore();

function onFloatingVisibleOnStartChange(event: Event): void {
  emit("update:floatingVisibleOnStart", (event.target as HTMLInputElement).checked);
}

function onFloatingOpacityInput(event: Event): void {
  emit("update:floatingOpacity", Number((event.target as HTMLInputElement).value));
  emit("applyFloatingOpacity");
}
</script>

<template>
  <section class="settings-section">
    <h2>{{ settingsStore.t("settings.window") }}</h2>
    <div class="settings-grid settings-window-grid">
      <label class="checkbox-line">
        <input
          type="checkbox"
          :checked="floatingVisibleOnStart"
          @change="onFloatingVisibleOnStartChange"
        />
        <span>{{ settingsStore.t("settings.floatingVisibleOnStart") }}</span>
      </label>
      <label class="settings-range">
        <span>{{ settingsStore.t("settings.floatingOpacity") }} {{ Math.round(floatingOpacity * 100) }}%</span>
        <input
          type="range"
          min="0.45"
          max="1"
          step="0.05"
          :value="floatingOpacity"
          @input="onFloatingOpacityInput"
        />
      </label>
    </div>
  </section>
</template>
