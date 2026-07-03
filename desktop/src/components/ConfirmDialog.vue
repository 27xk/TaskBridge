<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

let dialogIdSeed = 0;

const props = withDefaults(defineProps<{
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger?: boolean;
}>(), {
  danger: false,
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const titleId = `confirm-dialog-title-${++dialogIdSeed}`;
const dialogPanel = ref<HTMLElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);
const previousActiveElement = ref<HTMLElement | null>(null);

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      previousActiveElement.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener("keydown", onKeyDown);
      await nextTick();
      focusInitialDialogControl();
    } else {
      cleanupDialogFocus();
    }
  },
);

onBeforeUnmount(() => {
  cleanupDialogFocus();
});

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
    return;
  }
  if (event.key === "Tab") {
    trapDialogFocus(event);
  }
}

function focusInitialDialogControl(): void {
  const firstFocusable = focusableDialogElements()[0];
  (confirmButton.value ?? firstFocusable ?? dialogPanel.value)?.focus();
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
  if (event.shiftKey && (!dialogPanel.value?.contains(activeElement) || activeElement === firstElement)) {
    event.preventDefault();
    lastElement.focus();
    return;
  }
  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function cleanupDialogFocus(): void {
  document.removeEventListener("keydown", onKeyDown);
  const opener = previousActiveElement.value;
  previousActiveElement.value = null;
  if (opener && document.contains(opener)) {
    opener.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-dialog-layer" @click.self="$emit('cancel')">
      <section
        ref="dialogPanel"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <h2 :id="titleId">{{ title }}</h2>
        <p>{{ message }}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="secondary-button" @click="$emit('cancel')">{{ cancelText }}</button>
          <button
            ref="confirmButton"
            type="button"
            class="primary-button"
            :class="{ 'confirm-dialog-danger': danger }"
            @click="$emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
