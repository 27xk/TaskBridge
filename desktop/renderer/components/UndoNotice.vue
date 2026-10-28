<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RotateCcw, X } from "lucide-vue-next";

import { useTaskStore } from "../stores/task";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";

const tasks = useTaskStore();
const auth = useAuthStore();
const settings = useSettingsStore();
const english = computed(() => settings.language === "en-US");
const feedback = ref("");
const failed = ref(false);
const hovered = ref(false);
const focused = ref(false);
const hidden = ref(document.hidden);
const paused = computed(() => hovered.value || focused.value || hidden.value || tasks.undoing || failed.value);
let timer: number | undefined;
let remaining = 10_000;
let startedAt = 0;

const message = computed(() => {
  if (feedback.value) return feedback.value;
  const action = tasks.pendingUndo;
  if (!action) return "";
  const labels = {
    complete: ["已完成", "Completed"],
    delete: ["已移入回收站", "Moved to trash:"],
    schedule: ["已调整排期", "Rescheduled"],
    priority: ["已调整优先级", "Updated priority for"],
    edit: ["已保存修改", "Updated"],
    restore: ["已恢复", "Restored"],
    snooze: ["已稍后提醒", "Snoozed"],
  };
  const label = labels[action.kind][english.value ? 1 : 0];
  return english.value ? `${label} ${action.count} task${action.count === 1 ? "" : "s"}` : `${label} ${action.count} 项任务`;
});

function stopTimer(): void {
  if (timer === undefined) return;
  window.clearTimeout(timer);
  timer = undefined;
  remaining = Math.max(0, remaining - (Date.now() - startedAt));
}

function startTimer(): void {
  stopTimer();
  if (!message.value || paused.value) return;
  startedAt = Date.now();
  const actionId = tasks.pendingUndo?.id;
  timer = window.setTimeout(() => {
    timer = undefined;
    tasks.dismissUndo(actionId);
    feedback.value = "";
  }, remaining);
}

watch(() => tasks.pendingUndo?.id, () => {
  stopTimer();
  feedback.value = "";
  failed.value = false;
  remaining = 10_000;
  startTimer();
}, { immediate: true });
watch(paused, (pause) => pause ? stopTimer() : startTimer());
watch(() => auth.workspaceKey, () => { stopTimer(); feedback.value = ""; failed.value = false; });

async function undo(): Promise<void> {
  const action = tasks.pendingUndo;
  if (!action || tasks.undoing) return;
  const workspaceKey = auth.workspaceKey;
  stopTimer();
  failed.value = false;
  try {
    const result = await tasks.undoLastAction(action.id);
    if (workspaceKey !== auth.workspaceKey) return;
    failed.value = result.failed > 0;
    if (result.failed > 0) {
      feedback.value = english.value ? "Some tasks could not be undone. Try again." : "部分任务未能撤销，请重试。";
    } else if (result.skipped > 0) {
      feedback.value = english.value
        ? `Undid ${result.succeeded}; ${result.skipped} changed tasks were kept.`
        : `已撤销 ${result.succeeded} 项；${result.skipped} 项已有新修改，已保留。`;
    } else {
      feedback.value = english.value ? "Action undone" : "已撤销操作";
    }
    remaining = 4500;
    startTimer();
  } catch {
    if (workspaceKey !== auth.workspaceKey) return;
    failed.value = true;
    feedback.value = english.value ? "Could not undo. Try again." : "未能撤销，请重试。";
  }
}

function dismiss(): void {
  stopTimer();
  tasks.dismissUndo(tasks.pendingUndo?.id);
  feedback.value = "";
  failed.value = false;
}

function visibilityChanged(): void { hidden.value = document.hidden; }
onMounted(() => document.addEventListener("visibilitychange", visibilityChanged));
onBeforeUnmount(() => { stopTimer(); document.removeEventListener("visibilitychange", visibilityChanged); });
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="message"
        class="undo-notice"
        :class="{ 'undo-notice-error': failed }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @focusin="focused = true"
        @focusout="focused = Boolean(($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node | null))"
      >
        <span>{{ message }}</span>
        <button v-if="tasks.pendingUndo" type="button" class="undo-action" :disabled="tasks.undoing" @click="undo">
          <RotateCcw :size="15" aria-hidden="true" />
          {{ tasks.undoing ? (english ? "Undoing…" : "正在撤销…") : (english ? "Undo" : "撤销") }}
        </button>
        <button type="button" class="icon-button" :disabled="tasks.undoing" :aria-label="english ? 'Dismiss notification' : '关闭提示'" @click="dismiss">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>
