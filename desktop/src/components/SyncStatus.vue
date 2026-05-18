<script setup lang="ts">
import { computed } from "vue";

import { translateSyncMessage } from "../i18n";
import { useSettingsStore } from "../stores/settings";

const props = defineProps<{
  status: string;
  message: string;
}>();
const settingsStore = useSettingsStore();
const displayMessage = computed(() => translateSyncMessage(props.message, settingsStore.language));
</script>

<template>
  <div class="sync-status" :data-status="status">
    <span class="sync-dot" aria-hidden="true"></span>
    <span>{{ displayMessage }}</span>
  </div>
</template>
