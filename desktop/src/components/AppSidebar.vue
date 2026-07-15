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
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue";

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
const accountMenuRoot = useTemplateRef<HTMLElement>("accountMenuRoot");
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
const accessibleStatus = computed(() => {
  if (props.status.indicator === "attention" && props.status.issueCount > 0) {
    return settingsStore
      .t("sync.attentionWorkspaceCount")
      .replace("{count}", String(props.status.issueCount));
  }
  return statusTitle.value;
});
const accountMenuAriaLabel = computed(() =>
  [settingsStore.t("nav.accountMenu"), props.username, accessibleStatus.value]
    .filter((part) => part.trim())
    .join(", "),
);
const attentionBadge = computed(() => {
  if (props.status.indicator !== "attention" || props.status.issueCount <= 0) return "";
  const cappedCount = Math.min(props.status.issueCount, 99);
  return props.status.issueCount > 99 ? "99+" : String(cappedCount);
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
  if (menuOpen.value) {
    closeMenu();
    return;
  }
  void openMenu("first");
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    void openMenu("first");
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    void openMenu("last");
  }
}

async function openMenu(focusTarget: "first" | "last"): Promise<void> {
  menuOpen.value = true;
  await nextTick();
  const items = menuItems();
  if (focusTarget === "last") {
    items[items.length - 1]?.focus();
    return;
  }
  items[0]?.focus();
}

function menuItems(): HTMLElement[] {
  const items = accountMenuRoot.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [];
  return Array.from(items).filter(
    (item) => !(item instanceof HTMLButtonElement) || !item.disabled,
  );
}

function handleMenuKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu();
    accountTrigger.value?.focus();
    return;
  }
  if (event.key === "Tab") return;

  const items = menuItems();
  if (items.length === 0) return;
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex: number;

  switch (event.key) {
    case "ArrowDown":
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      break;
    case "ArrowUp":
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = items.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  items[nextIndex]?.focus();
}

function closeOnMenuFocusOut(event: FocusEvent): void {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const menu = event.currentTarget;
  if (event.relatedTarget instanceof Node && menu.contains(event.relatedTarget)) return;
  window.setTimeout(() => {
    if (!menu.contains(document.activeElement)) closeMenu();
  });
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
  if (event.target instanceof Node && !accountMenuRoot.value?.contains(event.target)) {
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
  <aside class="sidebar app-sidebar" :aria-label="settingsStore.t('nav.label')">
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

    <div ref="accountMenuRoot" class="sidebar-footer account-menu">
      <button
        ref="accountTrigger"
        id="account-menu-trigger"
        type="button"
        class="account-menu-trigger"
        :title="settingsStore.t('nav.accountMenu')"
        :aria-label="accountMenuAriaLabel"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        aria-controls="account-menu-items"
        :aria-busy="syncing"
        @click="toggleMenu"
        @keydown="handleTriggerKeydown"
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
          aria-hidden="true"
        ></span>
        <span v-if="attentionBadge" class="account-status-count" aria-hidden="true">
          {{ attentionBadge }}
        </span>
        <ChevronUp aria-hidden="true" :size="16" />
      </button>

      <div
        v-if="menuOpen"
        id="account-menu-items"
        class="account-menu-items"
        role="menu"
        aria-labelledby="account-menu-trigger"
        @keydown="handleMenuKeydown"
        @focusout="closeOnMenuFocusOut"
      >
        <button type="button" role="menuitem" tabindex="-1" :disabled="syncing" @click="syncNow">
          <RefreshCw aria-hidden="true" :size="17" />
          <span>{{ settingsStore.t("sync.manual") }}</span>
        </button>
        <button type="button" role="menuitem" tabindex="-1" @click="openSyncDetails">
          <CircleHelp aria-hidden="true" :size="17" />
          <span>{{ settingsStore.t("sync.details") }}</span>
        </button>
        <button type="button" role="menuitem" tabindex="-1" @click="logout">
          <LogOut aria-hidden="true" :size="17" />
          <span>{{ settingsStore.t("nav.logout") }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>
