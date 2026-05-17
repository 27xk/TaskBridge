<script setup lang="ts">
defineProps<{
  status: string;
  message: string;
}>();
</script>

<template>
  <div class="sync-status" :data-status="status">
    <span class="sync-dot" aria-hidden="true"></span>
    <span>{{ message }}</span>
  </div>
</template>
