import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import { bridge } from "../db/sqlite";
import { normalizeSyncStatus, formatSyncStatus } from "../../shared/sync-status";
import { tryCreateWorkspaceKey } from "../../shared/workspace";
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
  const tasks = shallowRef<TaskRecord[]>([]);
  const visible = ref(true);
  const syncMessage = ref("已同步");
  const syncState = ref<FloatingSyncState>("idle");
  const opacity = ref(0.96);
  const loading = ref(false);
  const authenticated = ref(false);
  const workspaceKey = ref<string | null>(null);
  const feedback = ref("");
  const hiddenTaskCount = ref(0);
  const width = ref(320);
  const height = ref(460);
  let refreshTimer: number | null = null;
  let feedbackTimer: number | null = null;
  let refreshGeneration = 0;
  let visibilityGeneration = 0;

  const openTasks = computed(() => tasks.value.filter((task) => !isCompletedStatus(task.status)));

  async function init(): Promise<void> {
    const generation = visibilityGeneration;
    const initialVisibility = await bridge().floating.isVisible();
    if (generation === visibilityGeneration) visible.value = initialVisibility;
    const settings = await bridge().app.getSettings();
    opacity.value = settings.floatingOpacity;
    width.value = settings.floatingWidth;
    height.value = settings.floatingHeight;
    await refresh();
  }

  async function refresh(): Promise<void> {
    if (!visible.value) return;
    const generation = ++refreshGeneration;
    const [settings, hasTokens] = await Promise.all([bridge().app.getSettings(), bridge().auth.hasTokens()]);
    if (!visible.value || generation !== refreshGeneration) return;
    workspaceKey.value = tryCreateWorkspaceKey(settings.baseUrl, settings.currentUserId);
    authenticated.value = hasTokens;
    opacity.value = settings.floatingOpacity;

    if (!authenticated.value) {
      tasks.value = [];
      hiddenTaskCount.value = 0;
      syncMessage.value = useSettingsStore().t("floating.loginRequired");
      syncState.value = "offline";
      return;
    }

    loading.value = true;
    try {
      const summary = await getFloatingTodayTaskSummary(8);
      if (!visible.value || generation !== refreshGeneration) return;
      tasks.value = summary.tasks;
      hiddenTaskCount.value = Math.max(0, summary.totalOpen - openTasks.value.length);
      await refreshStatus();
    } finally {
      if (generation === refreshGeneration) loading.value = false;
    }
  }

  async function refreshStatus(): Promise<void> {
    if (!visible.value || !authenticated.value) return;
    const generation = visibilityGeneration;
    const status = await bridge().sync.getStatus();
    if (!visible.value || generation !== visibilityGeneration || !authenticated.value) return;
    syncMessage.value = translateSyncStatus(status);
    syncState.value = mapSyncState(status);
  }

  function scheduleRefresh(delay = 120): void {
    if (!visible.value) return;
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void refresh().catch(() => { syncState.value = "error"; });
    }, delay);
  }

  async function quickAdd(title: string, submissionId?: string): Promise<boolean> {
    if (!authenticated.value) return false;
    const key = workspaceKey.value;
    if (!key) return false;
    const task = await quickAddTodayTask(title, submissionId, key);
    if (!task) return false;
    if (key !== workspaceKey.value) return true;
    showFeedback(formatQuickAddFeedback(task));
    // Persistence already succeeded; a list refresh failure must not invite a duplicate save.
    await refresh().catch(() => scheduleRefresh());
    return true;
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
      void refreshStatus().catch(() => { syncState.value = "error"; });
    });
    const unsubscribeVisibility = bridge().floating.onVisibilityChanged((nextVisible) => {
      visibilityGeneration++;
      refreshGeneration++;
      visible.value = nextVisible;
      loading.value = false;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = null;
      if (nextVisible) scheduleRefresh(0);
    });
    const unsubscribeOpacity = bridge().floating.onOpacityChanged((value) => {
      opacity.value = value;
    });
    const unsubscribeSessionExpired = bridge().auth.onSessionExpired(() => {
      refreshGeneration++;
      authenticated.value = false;
      tasks.value = [];
      hiddenTaskCount.value = 0;
      syncMessage.value = useSettingsStore().t("auth.sessionExpired");
      syncState.value = "offline";
    });
    return () => {
      unsubscribeTasks();
      unsubscribeStatus();
      unsubscribeVisibility();
      unsubscribeOpacity();
      unsubscribeSessionExpired();
      refreshGeneration++;
      visibilityGeneration++;
      visible.value = false;
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
    visible,
    openTasks,
    syncMessage,
    syncState,
    opacity,
    width,
    height,
    loading,
    authenticated,
    workspaceKey,
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
  return formatSyncStatus(status, useSettingsStore().language);
}

function mapSyncState(status: string): FloatingSyncState {
  const normalized = normalizeSyncStatus(status);
  if (normalized === "syncing" || normalized === "error") return normalized;
  if (["offline", "disconnected", "signed-out"].includes(normalized)) return "offline";
  if (normalized === "connected" || normalized === "synced") return "synced";
  return "idle";
}
