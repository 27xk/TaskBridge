<script setup lang="ts">
import { LogIn } from "lucide-vue-next";

import { useSettingsStore } from "../stores/settings";

const emit = defineEmits<{
  reauthenticate: [];
}>();

const settingsStore = useSettingsStore();
</script>

<template>
  <section class="reauthentication-banner" role="status" aria-live="polite">
    <div>
      <strong>{{ settingsStore.t("auth.localWorkspaceTitle") }}</strong>
      <span>{{ settingsStore.t("auth.localWorkspaceBody") }}</span>
    </div>
    <button type="button" @click="emit('reauthenticate')">
      <LogIn :size="17" aria-hidden="true" />
      <span>{{ settingsStore.t("auth.loginAndSync") }}</span>
    </button>
  </section>
</template>
