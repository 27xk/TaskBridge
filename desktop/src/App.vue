<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import ConfirmDialog from "./components/ConfirmDialog.vue";
import SyncStatus from "./components/SyncStatus.vue";
import { bridge } from "./db/sqlite";
import { useConfirmDialog } from "./composables/useConfirmDialog";
import { useAuthStore, useSettingsStore, useSyncStore, useTaskStore } from "./stores";
import FloatingView from "./views/FloatingView.vue";
import LoginView from "./views/LoginView.vue";
import SettingsView from "./views/SettingsView.vue";
import TaskView from "./views/TaskView.vue";
import TodayView from "./views/TodayView.vue";
import { parseTaskBridgeDate } from "../shared/quick-add-parser";
import { isCompletedStatus } from "./utils/task-order";

const isFloating = new URLSearchParams(window.location.search).get("view") === "floating";
const activeView = ref<"today" | "tasks" | "settings">("today");
const quickAddSignal = ref(0);
const openTaskRequest = ref<{ localId: string; nonce: number } | null>(null);
const settingsSectionRequest = ref<{ sectionId: string; nonce: number } | null>(null);
const auth = useAuthStore();
const taskStore = useTaskStore();
const syncStore = useSyncStore();
const settingsStore = useSettingsStore();
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
let reminderTimer: number | undefined;
const notifiedReminderIds = new Set<string>();
const REMINDER_DEDUP_STORAGE_KEY = "taskbridge.desktop.notifiedReminders.v1";

onMounted(async () => {
  await settingsStore.load();
  if (isFloating) return;
  loadNotifiedReminderIds();

  removeQuickAddListener = bridge().window.onQuickAdd(() => {
    activeView.value = "tasks";
    quickAddSignal.value += 1;
  });
  removeSettingsListener = bridge().window.onShowSettings(() => {
    activeView.value = "settings";
  });
  removeTasksChangedListener = bridge().window.onTasksChanged(() => {
    if (!auth.isAuthenticated) return;
    void reloadTasksAndPruneReminders();
    void syncStore.syncNow();
  });
  removeOpenTaskDetailListener = bridge().window.onOpenTaskDetail((localId) => {
    activeView.value = "tasks";
    openTaskRequest.value = {
      localId,
      nonce: Date.now(),
    };
  });
  removeSyncNowListener = bridge().window.onSyncNow(() => {
    void manualSync();
  });

  await auth.loadSession();
  if (auth.isAuthenticated) {
    await startDesktopServices();
  }
});

onBeforeUnmount(() => {
  removeQuickAddListener?.();
  removeSettingsListener?.();
  removeTasksChangedListener?.();
  removeOpenTaskDetailListener?.();
  removeSyncNowListener?.();
  stopReminderLoop();
  syncStore.stop();
});

async function startDesktopServices(): Promise<void> {
  await reloadTasksAndPruneReminders();
  await syncStore.start(reloadTasksAndPruneReminders);
  startReminderLoop();
}

async function handleAuthenticated(): Promise<void> {
  await startDesktopServices();
}

async function logout(): Promise<void> {
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
  await auth.logout();
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
  await syncStore.syncNow(true);
  await reloadTasksAndPruneReminders();
}

function openSettingsSection(sectionId: string): void {
  activeView.value = "settings";
  settingsSectionRequest.value = {
    sectionId,
    nonce: Date.now(),
  };
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
    await bridge().app.notify(task.title, task.content || settingsStore.t("app.reminder"));
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

  <LoginView v-else-if="!auth.isAuthenticated" @authenticated="handleAuthenticated" />

  <main v-else class="app-shell">
    <aside class="sidebar" :aria-label="settingsStore.t('nav.label')">
      <div class="brand">
        <span class="brand-mark">TB</span>
        <span>TaskBridge</span>
      </div>

      <nav class="nav-list" :aria-label="settingsStore.t('nav.label')">
        <button
          type="button"
          :class="{ active: activeView === 'today' }"
          :aria-current="activeView === 'today' ? 'page' : undefined"
          @click="activeView = 'today'"
        >
          <span>{{ settingsStore.t("nav.today") }}</span>
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'tasks' }"
          :aria-current="activeView === 'tasks' ? 'page' : undefined"
          @click="activeView = 'tasks'"
        >
          <span>{{ settingsStore.t("nav.all") }}</span>
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'settings' }"
          :aria-current="activeView === 'settings' ? 'page' : undefined"
          @click="activeView = 'settings'"
        >
          <span>{{ settingsStore.t("nav.settings") }}</span>
        </button>
      </nav>

      <SyncStatus :status="syncStore.status" :message="syncStore.message" />
      <button
        type="button"
        class="sidebar-sync-button"
        :disabled="syncStore.status === 'syncing'"
        @click="manualSync"
      >
        {{ settingsStore.t("sync.manual") }}
      </button>

      <div class="sidebar-footer">
        <span>{{ auth.user?.username }}</span>
        <button type="button" class="ghost-button" @click="logout">{{ settingsStore.t("nav.logout") }}</button>
      </div>
    </aside>

    <TaskView
      v-if="activeView === 'tasks'"
      :quick-add-signal="quickAddSignal"
      :open-task-request="openTaskRequest"
      @open-settings="openSettingsSection('sync-recovery')"
    />
    <TodayView v-else-if="activeView === 'today'" @open-settings="openSettingsSection('sync-recovery')" />
    <SettingsView v-else :section-request="settingsSectionRequest" />
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
