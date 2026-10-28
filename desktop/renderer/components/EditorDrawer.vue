<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

defineProps<{
  label: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

defineSlots<{
  default(): unknown;
}>();

const wideScreen = window.matchMedia("(min-width: 1280px)");
const docked = ref(wideScreen.matches);
function updateDocked(event: MediaQueryListEvent): void { docked.value = event.matches; }

const dialogPanel = useTemplateRef<HTMLElement>("dialogPanel");
const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

onMounted(async () => {
  document.addEventListener("keydown", onKeyDown);
  wideScreen.addEventListener("change", updateDocked);
  await nextTick();
  focusInitialControl();
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeyDown);
  wideScreen.removeEventListener("change", updateDocked);
  void nextTick(() => {
    if (previousActiveElement && document.contains(previousActiveElement)) previousActiveElement.focus();
  });
});

function onKeyDown(event: KeyboardEvent): void {
  const panel = dialogPanel.value;
  if (!panel?.contains(document.activeElement)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "Tab" && !docked.value) {
    trapDialogFocus(event);
  }
}

function focusInitialControl(): void {
  const preferredControl = dialogPanel.value?.querySelector<HTMLElement>("[data-initial-focus], [autofocus]");
  (preferredControl ?? focusableDialogElements()[0] ?? dialogPanel.value)?.focus();
}

function focusableDialogElements(): HTMLElement[] {
  const selector = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(dialogPanel.value?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

function trapDialogFocus(event: KeyboardEvent): void {
  const focusableElements = focusableDialogElements();
  if (focusableElements.length === 0) {
    event.preventDefault();
    dialogPanel.value?.focus();
    return;
  }
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;
  if (event.shiftKey && (activeElement === firstElement || !dialogPanel.value?.contains(activeElement))) {
    event.preventDefault();
    lastElement.focus();
    return;
  }
  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}
</script>

<template>
  <div class="drawer-layer" :class="{ 'drawer-docked': docked }" role="presentation">
    <div v-if="!docked" class="drawer-scrim" aria-hidden="true" @click="$emit('close')"></div>
    <aside
      ref="dialogPanel"
      class="side-panel"
      :role="docked ? 'complementary' : 'dialog'"
      :aria-modal="docked ? undefined : true"
      :aria-label="label"
      tabindex="-1"
    >
      <slot />
    </aside>
  </div>
</template>
