<script setup lang="ts">
import { CircleHelp, RefreshCw, TriangleAlert, WifiOff } from "lucide-vue-next";
import { computed } from "vue";

import type { WorkspaceStatusPresentation } from "../../shared/workspace-ui-policy";
import { useSettingsStore } from "../stores/settings";

const props = defineProps<{
  status: WorkspaceStatusPresentation;
}>();

const emit = defineEmits<{
  retry: [];
  openDetails: [];
}>();

const settingsStore = useSettingsStore();
const message = computed(() => {
  if (props.status.banner === "offline") {
    return settingsStore.t("sync.offlineWorkspace");
  }
  if (props.status.issueCount > 0) {
    return settingsStore
      .t("sync.attentionWorkspaceCount")
      .replace("{count}", String(props.status.issueCount));
  }
  return settingsStore.t("sync.attentionWorkspace");
});
</script>

<template>
  <section
    class="workspace-status-banner"
    :data-banner="status.banner"
    aria-live="polite"
    aria-atomic="true"
  >
    <WifiOff v-if="status.banner === 'offline'" aria-hidden="true" :size="18" />
    <TriangleAlert v-else aria-hidden="true" :size="18" />
    <p>{{ message }}</p>
    <div class="workspace-status-actions">
      <button type="button" @click="emit('retry')">
        <RefreshCw aria-hidden="true" :size="17" />
        <span>{{ settingsStore.t("sync.retry") }}</span>
      </button>
      <button
        v-if="status.banner === 'attention'"
        type="button"
        @click="emit('openDetails')"
      >
        <CircleHelp aria-hidden="true" :size="17" />
        <span>{{ settingsStore.t("sync.details") }}</span>
      </button>
    </div>
  </section>
</template>
