<script setup lang="ts">
import { computed } from "vue";
import { ArrowUpRight, ListTodo, SlidersHorizontal, X } from "lucide-vue-next";

import { translateSyncMessage } from "../i18n";
import { useSettingsStore } from "../stores/settings";

const props = defineProps<{
  dateLabel: string;
  syncMessage: string;
  syncState: "idle" | "syncing" | "offline" | "error" | "synced";
  opacity: number;
}>();
const settingsStore = useSettingsStore();
const syncLabel = computed(() => translateSyncMessage(props.syncMessage, settingsStore.language));
const opacityLabel = computed(() => `${Math.round(props.opacity * 100)}%`);

const emit = defineEmits<{
  hide: [];
  openMain: [];
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
        <span class="floating-brand-mark" aria-hidden="true"><ListTodo :size="15" /></span>
        <strong>TaskBridge</strong>
      </div>
    </div>

    <div class="floating-window-actions">
      <button
        type="button"
        :title="settingsStore.t('floating.openMain')"
        :aria-label="settingsStore.t('floating.openMain')"
        @click="$emit('openMain')"
      >
        <ArrowUpRight :size="16" aria-hidden="true" />
      </button>
      <details class="floating-tools">
        <summary
          :title="settingsStore.t('floating.tools')"
          :aria-label="settingsStore.t('floating.tools')"
        >
          <SlidersHorizontal :size="15" aria-hidden="true" />
        </summary>
        <label class="floating-opacity">
          <span class="floating-opacity-label">{{ settingsStore.t("floating.opacity") }} <output>{{ opacityLabel }}</output></span>
          <input
            type="range"
            min="0.45"
            max="1"
            step="0.05"
            :aria-label="settingsStore.t('floating.opacity')"
            :value="props.opacity"
            @input="updateOpacity"
          />
        </label>
      </details>
      <button
        type="button"
        class="floating-hide-button"
        :title="settingsStore.t('floating.hide')"
        :aria-label="settingsStore.t('floating.hide')"
        @click="$emit('hide')"
      >
        <X :size="16" aria-hidden="true" />
      </button>
    </div>

    <div class="floating-header-meta">
      <time>{{ props.dateLabel }}</time>
      <span class="floating-status" :data-state="props.syncState" :title="syncLabel" role="status">
        <i aria-hidden="true"></i>
        <span>{{ syncLabel }}</span>
      </span>
    </div>
  </header>
</template>
