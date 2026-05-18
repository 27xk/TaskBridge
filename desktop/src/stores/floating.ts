import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { bridge } from "../db/sqlite";
import {
  completeFloatingTask,
  listFloatingTodayTasks,
  openTaskDetail,
  quickAddTodayTask,
} from "../db/task.dao";
import { useSettingsStore } from "./settings";

type FloatingSyncState = "idle" | "syncing" | "offline" | "error" | "synced";

export const useFloatingStore = defineStore("floating", () => {
  const tasks = ref<TaskRecord[]>([]);
  const syncMessage = ref("已同步");
  const syncState = ref<FloatingSyncState>("idle");
  const opacity = ref(0.96);
  const loading = ref(false);
  const authenticated = ref(false);
  const miniMode = ref(false);
  const feedback = ref("");
  const width = ref(320);
  const height = ref(460);
  let refreshTimer: number | null = null;
  let feedbackTimer: number | null = null;

  const openTasks = computed(() => tasks.value.filter((task) => task.status !== "completed"));

  async function init(): Promise<void> {
    const settings = await bridge().app.getSettings();
    opacity.value = settings.floatingOpacity;
    miniMode.value = settings.floatingMiniMode;
    width.value = settings.floatingWidth;
    height.value = settings.floatingHeight;
    await refresh();
  }

  async function refresh(): Promise<void> {
    authenticated.value = await bridge().auth.hasTokens();

    if (!authenticated.value) {
      tasks.value = [];
      syncMessage.value = "请登录 TaskBridge";
      syncState.value = "offline";
      return;
    }

    loading.value = true;
    try {
      tasks.value = await listFloatingTodayTasks(8);
      const status = await bridge().sync.getStatus();
      syncMessage.value = translateSyncStatus(status);
      syncState.value = mapSyncState(status);
    } finally {
      loading.value = false;
    }
  }

  function scheduleRefresh(delay = 120): void {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void refresh();
    }, delay);
  }

  async function quickAdd(title: string): Promise<void> {
    if (!authenticated.value) return;
    const task = await quickAddTodayTask(title);
    if (!task) return;
    showFeedback(`${useSettingsStore().t("floating.feedbackAdded")}：${task.title}`);
    await refresh();
  }

  async function complete(task: TaskRecord): Promise<void> {
    if (!authenticated.value || task.status === "completed") return;
    await completeFloatingTask(task.localId);
    showFeedback(`${useSettingsStore().t("floating.feedbackCompleted")}：${task.title}`);
    await refresh();
  }

  async function openDetail(task: TaskRecord): Promise<void> {
    await openTaskDetail(task.localId);
  }

  async function hide(): Promise<void> {
    await bridge().floating.hide();
  }

  async function openMain(): Promise<void> {
    await bridge().window.openMain();
  }

  async function setOpacity(nextOpacity: number): Promise<void> {
    opacity.value = await bridge().floating.setOpacity(nextOpacity);
  }

  async function setSize(nextWidth: number, nextHeight: number): Promise<void> {
    const size = await bridge().floating.setSize(nextWidth, nextHeight);
    width.value = size.width;
    height.value = size.height;
  }

  async function toggleMiniMode(): Promise<void> {
    miniMode.value = !miniMode.value;
    await bridge().app.setSetting("floatingMiniMode", miniMode.value);
  }

  function subscribe(): () => void {
    const unsubscribeTasks = bridge().window.onTasksChanged(() => {
      scheduleRefresh();
    });
    const unsubscribeStatus = bridge().window.onSyncStatusChanged(() => {
      scheduleRefresh();
    });
    const unsubscribeQuickAdd = bridge().window.onQuickAdd(() => {
      const input = document.querySelector<HTMLInputElement>("[data-floating-quick-add]");
      input?.focus();
    });
    const unsubscribeOpacity = bridge().floating.onOpacityChanged((value) => {
      opacity.value = value;
    });
    return () => {
      unsubscribeTasks();
      unsubscribeStatus();
      unsubscribeQuickAdd();
      unsubscribeOpacity();
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (feedbackTimer !== null) {
        window.clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
    };
  }

  function showFeedback(message: string): void {
    feedback.value = message;
    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(() => {
      feedback.value = "";
      feedbackTimer = null;
    }, 1800);
  }

  return {
    tasks,
    openTasks,
    syncMessage,
    syncState,
    opacity,
    width,
    height,
    loading,
    authenticated,
    miniMode,
    feedback,
    init,
    refresh,
    quickAdd,
    complete,
    openDetail,
    hide,
    openMain,
    setOpacity,
    setSize,
    toggleMiniMode,
    scheduleRefresh,
    subscribe,
  };
});

function translateSyncStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (status.includes("同步中")) return "同步中";
  if (status.includes("离线")) return "离线";
  if (status.includes("异常")) return "同步异常";
  if (status.includes("连接")) return status;
  if (status.includes("已同步")) return "已同步";
  if (normalized.includes("syncing")) return "同步中";
  if (normalized.includes("offline")) return "离线";
  if (normalized.includes("error")) return "同步异常";
  if (normalized.includes("connected")) return "实时连接";
  if (normalized.includes("disconnected")) return "等待连接";
  if (normalized.includes("synced")) return "已同步";
  if (normalized.includes("idle")) return "已同步";
  return status || "已同步";
}

function mapSyncState(status: string): FloatingSyncState {
  const normalized = status.toLowerCase();
  if (status.includes("同步中")) return "syncing";
  if (status.includes("离线") || status.includes("等待连接")) return "offline";
  if (status.includes("异常")) return "error";
  if (status.includes("已同步") || status.includes("实时连接")) return "synced";
  if (normalized.includes("syncing")) return "syncing";
  if (normalized.includes("offline") || normalized.includes("disconnected")) return "offline";
  if (normalized.includes("error")) return "error";
  if (normalized.includes("synced") || normalized.includes("connected")) return "synced";
  return "idle";
}
