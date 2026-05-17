<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import SyncStatus from "./components/SyncStatus.vue";
import { bridge } from "./db/sqlite";
import { useAuthStore, useSyncStore, useTaskStore } from "./stores";
import FloatingView from "./views/FloatingView.vue";
import LoginView from "./views/LoginView.vue";
import SettingsView from "./views/SettingsView.vue";
import TaskView from "./views/TaskView.vue";
import TodayView from "./views/TodayView.vue";

const isFloating = new URLSearchParams(window.location.search).get("view") === "floating";
const activeView = ref<"today" | "tasks" | "settings">("today");
const quickAddSignal = ref(0);
const openTaskRequest = ref<{ localId: string; nonce: number } | null>(null);
const auth = useAuthStore();
const taskStore = useTaskStore();
const syncStore = useSyncStore();

let removeQuickAddListener: (() => void) | undefined;
let removeSettingsListener: (() => void) | undefined;
let removeTasksChangedListener: (() => void) | undefined;
let removeOpenTaskDetailListener: (() => void) | undefined;
let reminderTimer: number | undefined;
const notifiedReminderIds = new Set<string>();

onMounted(async () => {
  if (isFloating) return;

  removeQuickAddListener = bridge().window.onQuickAdd(() => {
    activeView.value = "tasks";
    quickAddSignal.value += 1;
  });
  removeSettingsListener = bridge().window.onShowSettings(() => {
    activeView.value = "settings";
  });
  removeTasksChangedListener = bridge().window.onTasksChanged(() => {
    if (!auth.isAuthenticated) return;
    void taskStore.load();
    void syncStore.syncNow();
  });
  removeOpenTaskDetailListener = bridge().window.onOpenTaskDetail((localId) => {
    activeView.value = "tasks";
    openTaskRequest.value = {
      localId,
      nonce: Date.now(),
    };
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
  stopReminderLoop();
  syncStore.stop();
});

async function startDesktopServices(): Promise<void> {
  await taskStore.load();
  await syncStore.start(taskStore.load);
  startReminderLoop();
}

async function handleAuthenticated(): Promise<void> {
  await startDesktopServices();
}

async function logout(): Promise<void> {
  syncStore.stop();
  stopReminderLoop();
  await auth.logout();
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
    if (task.status === "completed" || task.isDeleted) continue;
    const remindAt = task.remindTime ?? task.dueTime;
    if (!remindAt) continue;
    const timestamp = new Date(remindAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp > now) continue;
    const key = `${task.localId}:${remindAt}`;
    if (notifiedReminderIds.has(key)) continue;
    notifiedReminderIds.add(key);
    await bridge().app.notify(task.title, task.content || "TaskBridge reminder");
  }
}
</script>

<template>
  <FloatingView v-if="isFloating" />

  <LoginView v-else-if="!auth.isAuthenticated" @authenticated="handleAuthenticated" />

  <main v-else class="app-shell">
    <aside class="sidebar" aria-label="TaskBridge navigation">
      <div class="brand">
        <span class="brand-mark">TB</span>
        <span>TaskBridge</span>
      </div>

      <nav class="nav-list">
        <button type="button" :class="{ active: activeView === 'today' }" @click="activeView = 'today'">
          Today
        </button>
        <button type="button" :class="{ active: activeView === 'tasks' }" @click="activeView = 'tasks'">
          All tasks
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'settings' }"
          @click="activeView = 'settings'"
        >
          Settings
        </button>
      </nav>

      <SyncStatus :status="syncStore.status" :message="syncStore.message" />

      <div class="sidebar-footer">
        <span>{{ auth.user?.username }}</span>
        <button type="button" class="ghost-button" @click="logout">Logout</button>
      </div>
    </aside>

    <TaskView
      v-if="activeView === 'tasks'"
      :quick-add-signal="quickAddSignal"
      :open-task-request="openTaskRequest"
    />
    <TodayView v-else-if="activeView === 'today'" />
    <SettingsView v-else />
  </main>
</template>
