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

const dateLabel = computed(() => formatShanghaiDate(new Date(), settingsStore.language, settingsStore.displayTimeZone));
const hiddenTaskCountLabel = computed(() =>
  settingsStore.t("floating.hiddenTasks").replace("{count}", String(floating.hiddenTaskCount)),
);
const surfaceStyle = computed(() => {
  const alpha = Math.min(0.98, Math.max(0.45, floating.opacity));
  const controlAlpha = Math.min(0.96, alpha + 0.12);
  return {
    "--floating-surface-opacity": alpha.toFixed(2),
    "--floating-control-opacity": controlAlpha.toFixed(2),
  };
});

let unsubscribe: (() => void) | undefined;
let resizeStart: { x: number; y: number; width: number; height: number } | null = null;
let resizeFrame = 0;

onMounted(async () => {
  await floating.init();
  unsubscribe = floating.subscribe();
});

onBeforeUnmount(() => {
  unsubscribe?.();
  stopResize();
});

function startResize(event: PointerEvent): void {
  event.preventDefault();
  resizeStart = {
    x: event.screenX,
    y: event.screenY,
    width: floating.width,
    height: floating.height,
  };
  window.addEventListener("pointermove", resizeFloating);
  window.addEventListener("pointerup", stopResize, { once: true });
}

function resizeFloating(event: PointerEvent): void {
  if (!resizeStart) return;
  const nextWidth = resizeStart.width + event.screenX - resizeStart.x;
  const nextHeight = resizeStart.height + event.screenY - resizeStart.y;
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    void floating.setSize(nextWidth, nextHeight);
  });
}

function stopResize(): void {
  resizeStart = null;
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
  }
  window.removeEventListener("pointermove", resizeFloating);
}
</script>

<template>
  <main class="floating-shell" :style="surfaceStyle">
    <FloatingHeader
      :date-label="dateLabel"
      :sync-message="floating.syncMessage"
      :sync-state="floating.syncState"
      :opacity="floating.opacity"
      @hide="floating.hide"
      @open-main="floating.openMain"
      @opacity-change="floating.setOpacity"
    />

    <section class="floating-content" :aria-label="settingsStore.t('floating.todayList')">
      <div class="floating-section-title">
        <span>{{ settingsStore.t("floating.todayList") }}</span>
        <button type="button" :title="settingsStore.t('floating.refresh')" @click="floating.refresh">{{ settingsStore.t("floating.refresh") }}</button>
      </div>

      <div v-if="!floating.authenticated" class="floating-empty">
        {{ settingsStore.t("floating.loginRequired") }}
      </div>

      <div v-else-if="floating.openTasks.length === 0" class="floating-empty">
        {{ settingsStore.t("floating.noToday") }}
      </div>

      <div v-else class="floating-task-list">
        <FloatingTaskItem
          v-for="task in floating.openTasks"
          :key="task.localId"
          :task="task"
          @complete="floating.complete"
          @open="floating.openDetail"
        />
        <button
          v-if="floating.hiddenTaskCount > 0"
          type="button"
          class="floating-more-button"
          @click="floating.openMain"
        >
          {{ hiddenTaskCountLabel }}
        </button>
      </div>
    </section>

    <p v-if="floating.feedback" class="floating-feedback">{{ floating.feedback }}</p>
    <QuickAddTask v-if="floating.authenticated" @submit="floating.quickAdd" />
    <button
      type="button"
      class="floating-resize-handle"
      :title="settingsStore.t('floating.resize')"
      @pointerdown="startResize"
    />
  </main>
</template>
