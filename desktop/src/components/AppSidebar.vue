<script setup lang="ts">
import {
  CalendarDays,
  ChevronUp,
  CircleHelp,
  ListTodo,
  LogOut,
  RefreshCw,
  Settings,
  UserRound,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue";

import type { WorkspaceStatusPresentation } from "../../shared/workspace-ui-policy";
import { useSettingsStore } from "../stores/settings";

type AppView = "today" | "tasks" | "settings";

const props = defineProps<{
  activeView: AppView;
  username: string;
  status: WorkspaceStatusPresentation;
  syncing: boolean;
}>();

const emit = defineEmits<{
  navigate: [view: AppView];
  syncNow: [];
  openSyncDetails: [];
  logout: [];
}>();

const settingsStore = useSettingsStore();
const menuOpen = shallowRef(false);
const sidebarRoot = useTemplateRef<HTMLElement>("sidebarRoot");
const accountTrigger = useTemplateRef<HTMLButtonElement>("accountTrigger");
const statusTitle = computed(() => {
  const key = {
    ready: "sync.synced",
    working: "sync.syncing",
    offline: "sync.offline",
    attention: "sync.error",
  } as const;
  return settingsStore.t(key[props.status.indicator]);
});

onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutsidePointer);
  document.addEventListener("keydown", closeOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutsidePointer);
  document.removeEventListener("keydown", closeOnEscape);
});

function navigateToday(): void {
  closeMenu();
  emit("navigate", "today");
}

function navigateTasks(): void {
  closeMenu();
  emit("navigate", "tasks");
}

function navigateSettings(): void {
  closeMenu();
  emit("navigate", "settings");
}

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function syncNow(): void {
  closeMenu();
  emit("syncNow");
}

function openSyncDetails(): void {
  closeMenu();
  emit("openSyncDetails");
}

function logout(): void {
  closeMenu();
  emit("logout");
}

function closeOnOutsidePointer(event: PointerEvent): void {
  if (!menuOpen.value) return;
  if (event.target instanceof Node && !sidebarRoot.value?.contains(event.target)) {
    closeMenu();
  }
}

function closeOnEscape(event: KeyboardEvent): void {
  if (!menuOpen.value || event.key !== "Escape") return;
  event.preventDefault();
  closeMenu();
  accountTrigger.value?.focus();
}

function closeMenu(): void {
  menuOpen.value = false;
}
</script>

<template>
  <aside ref="sidebarRoot" class="sidebar app-sidebar" :aria-label="settingsStore.t('nav.label')">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">TB</span>
      <span class="brand-name">TaskBridge</span>
    </div>

    <nav class="nav-list" :aria-label="settingsStore.t('nav.label')">
      <button
        type="button"
        :class="{ active: activeView === 'today' }"
        :title="settingsStore.t('nav.today')"
        :aria-label="settingsStore.t('nav.today')"
        :aria-current="activeView === 'today' ? 'page' : undefined"
        @click="navigateToday"
      >
        <CalendarDays aria-hidden="true" :size="18" />
        <span class="nav-label">{{ settingsStore.t("nav.today") }}</span>
      </button>
      <button
        type="button"
        :class="{ active: activeView === 'tasks' }"
        :title="settingsStore.t('nav.all')"
        :aria-label="settingsStore.t('nav.all')"
        :aria-current="activeView === 'tasks' ? 'page' : undefined"
        @click="navigateTasks"
      >
        <ListTodo aria-hidden="true" :size="18" />
        <span class="nav-label">{{ settingsStore.t("nav.all") }}</span>
      </button>
      <button
        type="button"
        :class="{ active: activeView === 'settings' }"
        :title="settingsStore.t('nav.settings')"
        :aria-label="settingsStore.t('nav.settings')"
        :aria-current="activeView === 'settings' ? 'page' : undefined"
        @click="navigateSettings"
      >
        <Settings aria-hidden="true" :size="18" />
        <span class="nav-label">{{ settingsStore.t("nav.settings") }}</span>
      </button>
    </nav>

    <div class="sidebar-footer account-menu">
      <button
        ref="accountTrigger"
        type="button"
        class="account-menu-trigger"
        :title="settingsStore.t('nav.accountMenu')"
        :aria-label="settingsStore.t('nav.accountMenu')"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        aria-controls="account-menu-items"
        :aria-busy="syncing"
        @click="toggleMenu"
      >
        <span class="account-avatar" aria-hidden="true">
          <UserRound :size="18" />
        </span>
        <span class="account-name">{{ username }}</span>
        <span
          class="account-status-indicator"
          :class="{ syncing }"
          :data-indicator="status.indicator"
          :title="statusTitle"
          role="img"
          :aria-label="statusTitle"
        ></span>
        <ChevronUp aria-hidden="true" :size="16" />
      </button>

      <div v-if="menuOpen" id="account-menu-items" class="account-menu-items" role="menu">
        <button type="button" role="menuitem" :disabled="syncing" @click="syncNow">
          <RefreshCw aria-hidden="true" :size="17" />
          <span>{{ settingsStore.t("sync.manual") }}</span>
        </button>
        <button type="button" role="menuitem" @click="openSyncDetails">
          <CircleHelp aria-hidden="true" :size="17" />
          <span>{{ settingsStore.t("sync.details") }}</span>
        </button>
        <button type="button" role="menuitem" @click="logout">
          <LogOut aria-hidden="true" :size="17" />
          <span>{{ settingsStore.t("nav.logout") }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>
