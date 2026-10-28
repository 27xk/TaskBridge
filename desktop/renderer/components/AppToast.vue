<script setup lang="ts">
import { CircleCheck } from "lucide-vue-next";

defineProps<{
  message: string;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="message"
        class="app-toast"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <CircleCheck aria-hidden="true" :size="18" />
        <span>{{ message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>
