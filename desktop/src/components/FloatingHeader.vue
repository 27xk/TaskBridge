<script setup lang="ts">
const props = defineProps<{
  dateLabel: string;
  syncMessage: string;
  syncState: "idle" | "syncing" | "offline" | "error" | "synced";
  opacity: number;
}>();

const emit = defineEmits<{
  hide: [];
  openMain: [];
  toggleMini: [];
  opacityChange: [value: number];
}>();

function updateOpacity(event: Event): void {
  const input = event.target as HTMLInputElement;
  emit("opacityChange", Number(input.value));
}
</script>

<template>
  <header class="floating-topbar">
    <div class="floating-drag-area">
      <div class="floating-title-line">
        <strong>TaskBridge</strong>
        <span class="floating-status" :data-state="props.syncState">
          <i></i>
          {{ props.syncMessage }}
        </span>
      </div>
      <time>{{ props.dateLabel }}</time>
    </div>

    <div class="floating-window-actions">
      <button type="button" title="打开主窗口" @click="$emit('openMain')">↗</button>
      <button type="button" title="迷你模式" @click="$emit('toggleMini')">□</button>
      <button type="button" title="隐藏悬浮窗" @click="$emit('hide')">−</button>
    </div>
  </header>

  <label class="floating-opacity">
    <span>透明度</span>
    <input
      type="range"
      min="0.45"
      max="1"
      step="0.05"
      :value="props.opacity"
      @input="updateOpacity"
    />
  </label>
</template>
