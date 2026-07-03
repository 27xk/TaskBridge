<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  text: string;
  actionLabel: string;
  tone?: "ready" | "attention" | "unknown";
}>(), {
  tone: "ready",
});

defineEmits<{
  openDetails: [];
}>();
</script>

<template>
  <section class="task-sync-health-bar" :class="`is-${tone}`" aria-live="polite">
    <div>
      <span>{{ title }}</span>
      <p>{{ text }}</p>
    </div>
    <button class="text-button" type="button" @click="$emit('openDetails')">{{ actionLabel }}</button>
  </section>
</template>
