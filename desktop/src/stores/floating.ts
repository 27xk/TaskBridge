import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { bridge } from "../db/sqlite";
import { formatShanghaiDateTime } from "../../shared/quick-add-parser";
import {
  completeFloatingTask,
  getFloatingTodayTaskSummary,
  openTaskDetail,
  quickAddTodayTask,
} from "../db/task.dao";
import { isCompletedStatus } from "../utils/task-order";
import { useSettingsStore } from "./settings";

type FloatingSyncState = "idle" | "syncing" | "offline" | "error" | "synced";

export const useFloatingStore = defineStore("floating", () => {
  const tasks = ref<TaskRecord[]>([]);
  const syncMessage = ref("已同步");
  const syncState = ref<FloatingSyncState>("idle");
  const opacity = ref(0.96);
  const loading = ref(false);
  const authenticated = ref(false);
  const feedback = ref("");
  const hiddenTaskCount = ref(0);
  const width = ref(320);
  const height = ref(460);
  let refreshTimer: number | null = null;
  let feedbackTimer: number | null = null;

  const openTasks = computed(() => tasks.value.filter((task) => !isCompletedStatus(task.status)));

  async function init(): Promise<void> {
    const settings = await bridge().app.getSettings();
    opacity.value = settings.floatingOpacity;
    width.value = settings.floatingWidth;
    height.value = settings.floatingHeight;
    await refresh();
  }

  async function refresh(): Promise<void> {
    authenticated.value = await bridge().auth.hasTokens();

    if (!authenticated.value) {
      tasks.value = [];
      hiddenTaskCount.value = 0;
      syncMessage.value = "请登录 TaskBridge";
      syncState.value = "offline";
      return;
    }

    loading.value = true;
    try {
      const summary = await getFloatingTodayTaskSummary(8);
      tasks.value = summary.tasks;
      hiddenTaskCount.value = Math.max(0, summary.totalOpen - openTasks.value.length);
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
    showFeedback(formatQuickAddFeedback(task));
    await refresh();
  }

  async function complete(task: TaskRecord): Promise<void> {
    if (!authenticated.value || isCompletedStatus(task.status)) return;
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
    const unsubscribeSessionExpired = bridge().auth.onSessionExpired(() => {
      authenticated.value = false;
      tasks.value = [];
      hiddenTaskCount.value = 0;
      syncMessage.value = useSettingsStore().t("auth.sessionExpired");
      syncState.value = "offline";
    });
    return () => {
      unsubscribeTasks();
      unsubscribeStatus();
      unsubscribeQuickAdd();
      unsubscribeOpacity();
      unsubscribeSessionExpired();
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

  function formatQuickAddFeedback(task: TaskRecord): string {
    const settingsStore = useSettingsStore();
    if (task.listType === "today") {
      return `${settingsStore.t("floating.feedbackAdded")}：${task.title}`;
    }
    const scheduled = task.dueTime
      ? formatShanghaiDateTime(task.dueTime, settingsStore.language, settingsStore.displayTimeZone)
      : task.plannedDate;
    const suffix = scheduled ? `（${scheduled}）` : "";
    return `${settingsStore.t("floating.feedbackAddedInbox")}${suffix}：${task.title}`;
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
    feedback,
    hiddenTaskCount,
    init,
    refresh,
    quickAdd,
    complete,
    openDetail,
    hide,
    openMain,
    setOpacity,
    setSize,
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
