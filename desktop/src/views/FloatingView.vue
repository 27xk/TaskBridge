<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { ArrowUpRight, Check, RefreshCw } from "lucide-vue-next";

import "../assets/floating-refresh.css";

import FloatingHeader from "../components/FloatingHeader.vue";
import FloatingTaskItem from "../components/FloatingTaskItem.vue";
import QuickAddTask from "../components/QuickAddTask.vue";
import { useFloatingStore } from "../stores/floating";
import { useSettingsStore } from "../stores/settings";
import { bridge } from "../db/sqlite";
import { formatShanghaiDate } from "../../shared/quick-add-parser";
import { useFloatingCaptureDraft } from "../composables/useFloatingCaptureDraft";
import { usePresentationClock } from "../composables/usePresentationClock";

const floating = useFloatingStore();
const settingsStore = useSettingsStore();
const presentationNow = usePresentationClock();
const captureDraft = useFloatingCaptureDraft(() => floating.workspaceKey, (durable) => {
  void bridge().floating.setDraftDurable(durable).catch(() => { /* The main process defaults to retaining the renderer until acknowledged. */ });
});
const captureTitle = captureDraft.title;
const captureError = ref("");
const isAdding = ref(false);
const captureInput = useTemplateRef<{ focus(): void }>("captureInput");
let captureFocusPending = false;
let removeQuickAdd: (() => void) | undefined;

watch(() => floating.workspaceKey, () => {
  captureError.value = "";
});
watch(() => floating.authenticated, async (authenticated) => {
  if (authenticated && captureFocusPending) await focusCapture();
});
watch(() => floating.visible, (visible) => { if (visible) captureDraft.retryPersistence(); });

async function focusCapture(): Promise<void> {
  captureFocusPending = true;
  await nextTick();
  if (captureInput.value) {
    captureInput.value.focus();
    captureFocusPending = false;
  }
}

async function saveCapture(title: string): Promise<void> {
  if (isAdding.value) return;
  const workspaceKey = floating.workspaceKey;
  const submitted = captureDraft.snapshot();
  isAdding.value = true;
  captureError.value = "";
  try {
    const saved = await floating.quickAdd(title, submitted.submissionId);
    if (workspaceKey !== floating.workspaceKey) return;
    if (saved) {
      captureDraft.clearIfCurrent(submitted);
    } else {
      captureError.value = settingsStore.t("task.saveFailed");
    }
  } catch {
    if (workspaceKey === floating.workspaceKey) captureError.value = settingsStore.t("task.saveFailed");
  } finally {
    isAdding.value = false;
    await focusCapture();
  }
}

const dateLabel = computed(() => formatShanghaiDate(presentationNow.value, settingsStore.language, settingsStore.displayTimeZone));
const totalOpenTasks = computed(() => floating.openTasks.length + floating.hiddenTaskCount);
const taskCountLabel = computed(() => `${totalOpenTasks.value} ${settingsStore.t("floating.todayTasks")}`);
const hiddenTaskCountLabel = computed(() =>
  settingsStore.t("floating.hiddenTasks").replace("{count}", String(floating.hiddenTaskCount)),
);
const surfaceStyle = computed(() => {
  const alpha = Math.min(1, Math.max(0.45, floating.opacity));
  const controlAlpha = Math.min(0.96, alpha + 0.12);
  return {
    "--floating-surface-opacity": alpha.toFixed(2),
    "--floating-control-opacity": controlAlpha.toFixed(2),
  };
});

let unsubscribe: (() => void) | undefined;
let resizeStart: { x: number; y: number; width: number; height: number } | null = null;
let resizeFrame = 0;

async function initializeFloatingView(): Promise<void> {
  const initialization = floating.init().catch(() => {
    captureError.value = settingsStore.t("task.saveFailed");
  });
  // The listener is ready independently of task loading. focusCapture waits for the input.
  await nextTick();
  try {
    await bridge().window.quickAddReady();
  } catch {
    captureError.value = settingsStore.t("task.saveFailed");
  }
  await initialization;
}

onMounted(async () => {
  removeQuickAdd = bridge().window.onQuickAdd(() => { void focusCapture(); });
  unsubscribe = floating.subscribe();
  await initializeFloatingView();
});

onBeforeUnmount(() => {
  unsubscribe?.();
  removeQuickAdd?.();
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
  <main class="floating-shell floating-note" :style="surfaceStyle">
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
        <div class="floating-heading-group">
          <h1>{{ settingsStore.t("floating.todayList") }}</h1>
          <span v-if="floating.authenticated" class="floating-task-count" :aria-label="taskCountLabel" :title="taskCountLabel">{{ totalOpenTasks }}</span>
        </div>
        <button type="button" :title="settingsStore.t('floating.refresh')" :aria-label="settingsStore.t('floating.refresh')" :disabled="floating.loading" @click="floating.refresh">
          <RefreshCw :size="14" aria-hidden="true" />
        </button>
      </div>

      <div v-if="!floating.authenticated" class="floating-empty">
        <span>{{ settingsStore.t("floating.loginRequired") }}</span>
        <button type="button" class="floating-empty-action" @click="floating.openMain">
          {{ settingsStore.t("floating.openMain") }}
          <ArrowUpRight :size="13" aria-hidden="true" />
        </button>
      </div>

      <TransitionGroup v-else name="floating-task-motion" tag="div" class="floating-task-list">
        <div v-if="floating.openTasks.length === 0" key="empty-list" class="floating-empty">
          <span class="floating-empty-mark" aria-hidden="true"><Check :size="20" /></span>
          <span>{{ settingsStore.t("floating.noToday") }}</span>
        </div>
        <FloatingTaskItem
          v-for="task in floating.openTasks"
          :key="task.localId"
          :task="task"
          :now="presentationNow"
          @complete="floating.complete"
          @open="floating.openDetail"
        />
        <button
          v-if="floating.hiddenTaskCount > 0"
          key="more-tasks"
          type="button"
          class="floating-more-button"
          @click="floating.openMain"
        >
          {{ hiddenTaskCountLabel }}
          <ArrowUpRight :size="13" aria-hidden="true" />
        </button>
      </TransitionGroup>
    </section>

    <footer class="floating-footer">
      <p v-if="floating.feedback" class="floating-feedback" role="status">{{ floating.feedback }}</p>
      <p v-if="captureError" id="floating-quick-add-error" class="floating-capture-error" role="alert">{{ captureError }}</p>
      <QuickAddTask
        v-if="floating.authenticated"
        ref="captureInput"
        v-model="captureTitle"
        :disabled="isAdding"
        :error-message="captureError"
        @submit="saveCapture"
      />
    </footer>
    <button
      type="button"
      class="floating-resize-handle"
      :title="settingsStore.t('floating.resize')"
      :aria-label="settingsStore.t('floating.resize')"
      @pointerdown="startResize"
    />
  </main>
</template>
