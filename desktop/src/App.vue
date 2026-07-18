<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import AppSidebar from "./components/AppSidebar.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import ReauthenticationBanner from "./components/ReauthenticationBanner.vue";
import WorkspaceStatusBanner from "./components/WorkspaceStatusBanner.vue";
import { bridge } from "./db/sqlite";
import { useConfirmDialog } from "./composables/useConfirmDialog";
import { useAuthStore, useSettingsStore, useSyncStore, useTaskStore } from "./stores";
import FloatingView from "./views/FloatingView.vue";
import LoginView from "./views/LoginView.vue";
import SettingsView from "./views/SettingsView.vue";
import TaskView from "./views/TaskView.vue";
import TodayView from "./views/TodayView.vue";
import { parseTaskBridgeDate } from "../shared/quick-add-parser";
import { shouldPreserveWorkspaceState } from "../shared/workspace";
import { deriveWorkspaceStatus } from "../shared/workspace-ui-policy";
import { isCompletedStatus } from "./utils/task-order";

const isFloating = new URLSearchParams(window.location.search).get("view") === "floating";
type AppView = "today" | "tasks" | "settings";

const activeView = ref<AppView>("today");
const editorDirty = ref(false);
const settingsConnectionDirty = ref(false);
const quickAddSignal = ref(0);
const openTaskRequest = ref<{ localId: string; nonce: number } | null>(null);
const settingsSectionRequest = ref<{ sectionId: string; nonce: number } | null>(null);
const workspaceInstanceKey = ref(0);
const continueOfflineAfterExpiry = ref(false);
const auth = useAuthStore();
const taskStore = useTaskStore();
const syncStore = useSyncStore();
const settingsStore = useSettingsStore();
const workspaceStatus = computed(() =>
  deriveWorkspaceStatus(syncStore.status, syncStore.diagnostics),
);
const displayedWorkspaceStatus = computed(() =>
  continueOfflineAfterExpiry.value
    ? { indicator: "offline", banner: "none", issueCount: 0 } as const
    : workspaceStatus.value,
);
const canContinueOffline = computed(
  () =>
    auth.sessionExpired &&
    auth.sessionExpiredReason === "refresh-rejected" &&
    Boolean(auth.workspaceKey),
);
const keepWorkspaceMounted = computed(
  () =>
    auth.isAuthenticated ||
    (auth.sessionExpired && auth.sessionExpiredReason === "refresh-rejected"),
);
const {
  confirmDialog,
  requestConfirmation,
  confirmRequestedAction,
  cancelRequestedAction,
} = useConfirmDialog(() => settingsStore.language);

let removeQuickAddListener: (() => void) | undefined;
let removeSettingsListener: (() => void) | undefined;
let removeTasksChangedListener: (() => void) | undefined;
let removeOpenTaskDetailListener: (() => void) | undefined;
let removeSyncNowListener: (() => void) | undefined;
let removeSessionExpiredListener: (() => void) | undefined;
let reminderTimer: number | undefined;
let preservedWorkspaceKey: string | null = null;
let desktopServicesWorkspaceKey: string | null = null;
let desktopServicesActivationId = 0;
const notifiedReminderIds = new Set<string>();
const REMINDER_DEDUP_STORAGE_KEY = "taskbridge.desktop.notifiedReminders.v1";

watch(
  () => [auth.isAuthenticated, auth.workspaceKey] as const,
  ([isAuthenticated, workspaceKey]) => {
    if (isFloating) return;
    if (isAuthenticated) {
      continueOfflineAfterExpiry.value = false;
    }
    if (!isAuthenticated || !workspaceKey) {
      desktopServicesWorkspaceKey = null;
      desktopServicesActivationId += 1;
      return;
    }
    if (desktopServicesWorkspaceKey === workspaceKey) return;
    void activateAuthenticatedWorkspace(workspaceKey);
  },
  { flush: "post" },
);

onMounted(async () => {
  await settingsStore.load();
  removeSessionExpiredListener = bridge().auth.onSessionExpired((reason) => {
    handleSessionExpired(reason);
  });
  if (isFloating) return;
  loadNotifiedReminderIds();
  window.addEventListener("beforeunload", handleBeforeUnload);

  removeQuickAddListener = bridge().window.onQuickAdd(() => {
    void openQuickAdd();
  });
  removeSettingsListener = bridge().window.onShowSettings(() => {
    void requestViewChange("settings");
  });
  removeTasksChangedListener = bridge().window.onTasksChanged(() => {
    if (!auth.isAuthenticated) return;
    void reloadTasksAndPruneReminders();
    void syncStore.syncNow();
  });
  removeOpenTaskDetailListener = bridge().window.onOpenTaskDetail((localId) => {
    void openTaskDetail(localId);
  });
  removeSyncNowListener = bridge().window.onSyncNow(() => {
    void manualSync();
  });

  await auth.loadSession();
  if (canContinueOffline.value && taskStore.tasks.length === 0) {
    await loadCachedWorkspace();
  }
});

onBeforeUnmount(() => {
  desktopServicesActivationId += 1;
  desktopServicesWorkspaceKey = null;
  removeQuickAddListener?.();
  removeSettingsListener?.();
  removeTasksChangedListener?.();
  removeOpenTaskDetailListener?.();
  removeSyncNowListener?.();
  removeSessionExpiredListener?.();
  window.removeEventListener("beforeunload", handleBeforeUnload);
  stopReminderLoop();
  syncStore.stop();
});

function handleSessionExpired(reason: "refresh-rejected" | "server-changed"): void {
  preservedWorkspaceKey ??= auth.workspaceKey;
  continueOfflineAfterExpiry.value = false;
  syncStore.stop();
  stopReminderLoop();
  auth.expireSession(reason);
}

async function loadCachedWorkspace(): Promise<void> {
  try {
    await settingsStore.load();
    await reloadTasksAndPruneReminders();
  } catch (error) {
    console.error("[TaskBridge] cached workspace failed to load", error);
  }
}

async function continueWithCachedWorkspace(): Promise<void> {
  if (!canContinueOffline.value) return;
  if (taskStore.tasks.length === 0) {
    await loadCachedWorkspace();
  }
  activeView.value = "today";
  continueOfflineAfterExpiry.value = true;
}

function showReauthentication(): void {
  continueOfflineAfterExpiry.value = false;
}

async function startDesktopServices(
  workspaceKey: string,
  activationId: number,
): Promise<void> {
  await reloadTasksAndPruneReminders();
  if (!isCurrentWorkspaceActivation(workspaceKey, activationId)) return;
  await syncStore.start(reloadTasksAndPruneReminders);
  if (!isCurrentWorkspaceActivation(workspaceKey, activationId)) return;
  startReminderLoop();
}

async function activateAuthenticatedWorkspace(workspaceKey: string): Promise<void> {
  if (!auth.isAuthenticated || auth.workspaceKey !== workspaceKey) return;
  desktopServicesWorkspaceKey = workspaceKey;
  const activationId = ++desktopServicesActivationId;
  const preserveWorkspace = shouldPreserveWorkspaceState(
    preservedWorkspaceKey,
    workspaceKey,
  );
  preservedWorkspaceKey = null;
  if (!preserveWorkspace) {
    resetWorkspaceUiState();
  }
  try {
    await settingsStore.load();
    if (!isCurrentWorkspaceActivation(workspaceKey, activationId)) return;
    await startDesktopServices(workspaceKey, activationId);
  } catch (error) {
    if (isCurrentWorkspaceActivation(workspaceKey, activationId)) {
      desktopServicesWorkspaceKey = null;
    }
    console.error("[TaskBridge] desktop services failed to start", error);
  }
}

function isCurrentWorkspaceActivation(workspaceKey: string, activationId: number): boolean {
  return (
    auth.isAuthenticated &&
    auth.workspaceKey === workspaceKey &&
    desktopServicesWorkspaceKey === workspaceKey &&
    desktopServicesActivationId === activationId
  );
}

function resetWorkspaceUiState(): void {
  taskStore.resetWorkspace();
  syncStore.resetWorkspace();
  editorDirty.value = false;
  settingsConnectionDirty.value = false;
  activeView.value = "today";
  openTaskRequest.value = null;
  settingsSectionRequest.value = null;
  notifiedReminderIds.clear();
  saveNotifiedReminderIds();
  workspaceInstanceKey.value += 1;
}

async function logout(): Promise<void> {
  if (!(await confirmDiscardCurrentEditor())) return;
  if (
    await hasUnsyncedWork() &&
    !(await requestConfirmation({
      message: settingsStore.t("sync.logoutPendingWarning"),
      confirmText: settingsStore.t("nav.logout"),
      danger: true,
    }))
  ) {
    return;
  }
  syncStore.stop();
  stopReminderLoop();
  notifiedReminderIds.clear();
  saveNotifiedReminderIds();
  editorDirty.value = false;
  settingsConnectionDirty.value = false;
  await auth.logout();
  continueOfflineAfterExpiry.value = false;
  preservedWorkspaceKey = null;
  resetWorkspaceUiState();
}

async function hasUnsyncedWork(): Promise<boolean> {
  await syncStore.refreshDiagnostics().catch(() => undefined);
  const diagnostics = syncStore.diagnostics;
  return (
    diagnostics.pendingQueueCount > 0 ||
    diagnostics.exhaustedQueueCount > 0 ||
    diagnostics.failedCount > 0 ||
    diagnostics.conflictCount > 0
  );
}

async function manualSync(): Promise<void> {
  if (!auth.isAuthenticated) {
    showReauthentication();
    return;
  }
  await syncStore.syncNow(true);
  await reloadTasksAndPruneReminders();
}

async function openSettingsSection(sectionId: string): Promise<void> {
  if (!(await requestViewChange("settings"))) return;
  settingsSectionRequest.value = {
    sectionId,
    nonce: Date.now(),
  };
}

async function requestViewChange(nextView: AppView): Promise<boolean> {
  if (nextView === activeView.value) return true;
  if (!(await confirmDiscardCurrentEditor())) return false;
  editorDirty.value = false;
  settingsConnectionDirty.value = false;
  activeView.value = nextView;
  return true;
}

async function confirmDiscardCurrentEditor(): Promise<boolean> {
  if (editorDirty.value) {
    return requestConfirmation({
      message: settingsStore.t("task.discardChangesConfirm"),
      danger: true,
    });
  }
  if (settingsConnectionDirty.value) {
    return requestConfirmation({
      message: settingsStore.t("settings.discardConnectionChangesConfirm"),
      danger: true,
    });
  }
  return true;
}

async function openQuickAdd(): Promise<void> {
  if (!(await confirmDiscardCurrentEditor())) return;
  editorDirty.value = false;
  settingsConnectionDirty.value = false;
  activeView.value = "tasks";
  quickAddSignal.value += 1;
}

async function openTaskDetail(localId: string): Promise<void> {
  if (!(await confirmDiscardCurrentEditor())) return;
  editorDirty.value = false;
  settingsConnectionDirty.value = false;
  activeView.value = "tasks";
  openTaskRequest.value = {
    localId,
    nonce: Date.now(),
  };
}

function updateEditorDirty(dirty: boolean): void {
  editorDirty.value = dirty;
}

function updateSettingsConnectionDirty(dirty: boolean): void {
  settingsConnectionDirty.value = dirty;
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!editorDirty.value && !settingsConnectionDirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

async function reloadTasksAndPruneReminders(): Promise<void> {
  await taskStore.load();
  pruneNotifiedReminders();
}

function startReminderLoop(): void {
  stopReminderLoop();
  void scanDueReminders();
  reminderTimer = window.setInterval(() => {
    void scanDueReminders();
  }, 60_000);
}

function stopReminderLoop(): void {
  if (reminderTimer !== undefined) {
    window.clearInterval(reminderTimer);
    reminderTimer = undefined;
  }
}

async function scanDueReminders(): Promise<void> {
  const now = Date.now();
  for (const task of taskStore.activeTasks) {
    if (isCompletedStatus(task.status) || task.isDeleted) continue;
    const remindAt = task.remindTime ?? task.dueTime;
    if (!remindAt) continue;
    const timestamp = parseTaskBridgeDate(remindAt)?.getTime() ?? Number.NaN;
    if (!Number.isFinite(timestamp) || timestamp > now) continue;
    const key = `${task.localId}:${remindAt}`;
    if (notifiedReminderIds.has(key)) continue;
    notifiedReminderIds.add(key);
    saveNotifiedReminderIds();
    await bridge().app.notify(task.title, task.content || settingsStore.t("app.reminder"), task.localId);
  }
  pruneNotifiedReminders();
}

function pruneNotifiedReminders(): void {
  const currentKeys = new Set<string>();
  for (const task of taskStore.activeTasks) {
    if (isCompletedStatus(task.status) || task.isDeleted) continue;
    const key = getReminderDedupKey(task);
    if (key) currentKeys.add(key);
  }
  let changed = false;
  for (const key of notifiedReminderIds) {
    if (!currentKeys.has(key)) {
      notifiedReminderIds.delete(key);
      changed = true;
    }
  }
  if (changed) {
    saveNotifiedReminderIds();
  }
}

function getReminderDedupKey(task: { localId: string; remindTime?: string | null; dueTime?: string | null }): string | null {
  const remindAt = task.remindTime ?? task.dueTime;
  return remindAt ? `${task.localId}:${remindAt}` : null;
}

function loadNotifiedReminderIds(): void {
  try {
    const raw = window.localStorage.getItem(REMINDER_DEDUP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    notifiedReminderIds.clear();
    for (const key of parsed) {
      if (typeof key === "string" && key.includes(":")) {
        notifiedReminderIds.add(key);
      }
    }
  } catch {
    notifiedReminderIds.clear();
  }
}

function saveNotifiedReminderIds(): void {
  try {
    window.localStorage.setItem(REMINDER_DEDUP_STORAGE_KEY, JSON.stringify(Array.from(notifiedReminderIds).slice(-1000)));
  } catch {
    // Notifications still work if persistent dedupe storage is unavailable.
  }
}
</script>

<template>
  <FloatingView v-if="isFloating" />

  <LoginView
    v-if="!isFloating && !auth.isAuthenticated && !continueOfflineAfterExpiry"
    :can-continue-offline="canContinueOffline"
    :cached-task-count="taskStore.tasks.length"
    @continue-offline="continueWithCachedWorkspace"
  />

  <main
    v-if="!isFloating && keepWorkspaceMounted"
    v-show="auth.isAuthenticated || continueOfflineAfterExpiry"
    :key="workspaceInstanceKey"
    class="app-shell focus-workspace"
  >
    <AppSidebar
      :active-view="activeView"
      :username="auth.user?.username ?? settingsStore.t('auth.localWorkspaceTitle')"
      :status="displayedWorkspaceStatus"
      :syncing="auth.isAuthenticated && syncStore.status === 'syncing'"
      @navigate="requestViewChange"
      @sync-now="manualSync"
      @open-sync-details="openSettingsSection('sync-recovery')"
      @logout="logout"
    />

    <section class="workspace-main">
      <ReauthenticationBanner
        v-if="continueOfflineAfterExpiry"
        @reauthenticate="showReauthentication"
      />
      <WorkspaceStatusBanner
        v-if="auth.isAuthenticated && workspaceStatus.banner !== 'none'"
        :status="workspaceStatus"
        @retry="manualSync"
        @open-details="openSettingsSection('sync-recovery')"
      />
      <TaskView
        v-if="activeView === 'tasks'"
        :quick-add-signal="quickAddSignal"
        :open-task-request="openTaskRequest"
        @editor-dirty-change="updateEditorDirty"
      />
      <TodayView
        v-else-if="activeView === 'today'"
        @editor-dirty-change="updateEditorDirty"
      />
      <SettingsView
        v-else
        :section-request="settingsSectionRequest"
        @connection-dirty-change="updateSettingsConnectionDirty"
      />
    </section>
  </main>

  <ConfirmDialog
    :visible="confirmDialog.visible"
    :title="confirmDialog.title"
    :message="confirmDialog.message"
    :confirm-text="confirmDialog.confirmText"
    :cancel-text="confirmDialog.cancelText"
    :danger="confirmDialog.danger"
    @confirm="confirmRequestedAction"
    @cancel="cancelRequestedAction"
  />
</template>
