<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  submit: [title: string];
}>();

const title = ref("");

function submit(): void {
  const trimmed = title.value.trim();
  if (!trimmed) return;
  emit("submit", trimmed);
  title.value = "";
}
</script>

<template>
  <form class="floating-quick-add" @submit.prevent="submit">
    <input
      v-model="title"
      data-floating-quick-add
      type="text"
      maxlength="120"
      placeholder="例如：明天下午3点 写周报 #工作 P3"
    />
    <button type="submit" title="添加任务">+</button>
  </form>
</template>
