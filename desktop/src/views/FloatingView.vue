<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";

import FloatingHeader from "../components/FloatingHeader.vue";
import FloatingTaskItem from "../components/FloatingTaskItem.vue";
import QuickAddTask from "../components/QuickAddTask.vue";
import { useFloatingStore } from "../stores/floating";
import { useSettingsStore } from "../stores/settings";
import { formatShanghaiDate } from "../../shared/quick-add-parser";

const floating = useFloatingStore();
const settingsStore = useSettingsStore();

const dateLabel = computed(() => formatShanghaiDate(new Date(), settingsStore.language));
const surfaceStyle = computed(() => {
  const alpha = Math.min(0.98, Math.max(0.45, floating.opacity));
  const controlAlpha = Math.min(0.96, alpha + 0.12);
  return {
    "--floating-surface-opacity": alpha.toFixed(2),
    "--floating-control-opacity": controlAlpha.toFixed(2),
  };
});

let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  await floating.init();
  unsubscribe = floating.subscribe();
});

onBeforeUnmount(() => {
  unsubscribe?.();
});
</script>

<template>
  <main class="floating-shell" :class="{ mini: floating.miniMode }" :style="surfaceStyle">
    <FloatingHeader
      :date-label="dateLabel"
      :sync-message="floating.syncMessage"
      :sync-state="floating.syncState"
      :opacity="floating.opacity"
      @hide="floating.hide"
      @open-main="floating.openMain"
      @toggle-mini="floating.toggleMiniMode"
      @opacity-change="floating.setOpacity"
    />

    <section v-if="floating.miniMode" class="floating-mini-panel">
      <button type="button" @click="floating.toggleMiniMode">
        {{ floating.openTasks.length }} {{ settingsStore.t("floating.todayTasks") }}
      </button>
      <p v-if="floating.feedback" class="floating-feedback">{{ floating.feedback }}</p>
      <QuickAddTask v-if="floating.authenticated" @submit="floating.quickAdd" />
    </section>

    <section v-else class="floating-content" :aria-label="settingsStore.t('floating.todayList')">
      <div class="floating-section-title">
        <span>{{ settingsStore.t("floating.todayList") }}</span>
        <button type="button" :title="settingsStore.t('floating.refresh')" @click="floating.refresh">{{ settingsStore.t("floating.refresh") }}</button>
      </div>

      <div v-if="!floating.authenticated" class="floating-empty">
        {{ settingsStore.t("floating.loginRequired") }}
      </div>

      <div v-else-if="floating.tasks.length === 0" class="floating-empty">
        {{ settingsStore.t("floating.noToday") }}
      </div>

      <div v-else class="floating-task-list">
        <FloatingTaskItem
          v-for="task in floating.tasks"
          :key="task.localId"
          :task="task"
          @complete="floating.complete"
          @open="floating.openDetail"
        />
      </div>
    </section>

    <p v-if="floating.feedback && !floating.miniMode" class="floating-feedback">{{ floating.feedback }}</p>
    <QuickAddTask v-if="floating.authenticated && !floating.miniMode" @submit="floating.quickAdd" />
  </main>
</template>
