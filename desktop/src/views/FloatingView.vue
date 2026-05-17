<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";

import FloatingHeader from "../components/FloatingHeader.vue";
import FloatingTaskItem from "../components/FloatingTaskItem.vue";
import QuickAddTask from "../components/QuickAddTask.vue";
import { useFloatingStore } from "../stores/floating";

const floating = useFloatingStore();

const dateLabel = computed(() =>
  new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }),
);

let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  await floating.init();
  unsubscribe = floating.subscribe();
});

onBeforeUnmount(() => {
  unsubscribe?.();
});
</script>

<template>
  <main class="floating-shell" :class="{ mini: floating.miniMode }">
    <FloatingHeader
      :date-label="dateLabel"
      :sync-message="floating.syncMessage"
      :sync-state="floating.syncState"
      :opacity="floating.opacity"
      @hide="floating.hide"
      @open-main="floating.openMain"
      @toggle-mini="floating.toggleMiniMode"
      @opacity-change="floating.setOpacity"
    />

    <section v-if="floating.miniMode" class="floating-mini-panel">
      <button type="button" @click="floating.toggleMiniMode">
        {{ floating.openTasks.length }} 项今日待办
      </button>
      <QuickAddTask v-if="floating.authenticated" @submit="floating.quickAdd" />
    </section>

    <section v-else class="floating-content" aria-label="今日待办">
      <div class="floating-section-title">
        <span>今日待办</span>
        <button type="button" title="刷新" @click="floating.refresh">刷新</button>
      </div>

      <div v-if="!floating.authenticated" class="floating-empty">
        请先登录 TaskBridge
      </div>

      <div v-else-if="floating.tasks.length === 0" class="floating-empty">
        今天暂无待办
      </div>

      <div v-else class="floating-task-list">
        <FloatingTaskItem
          v-for="task in floating.tasks"
          :key="task.localId"
          :task="task"
          @complete="floating.complete"
          @open="floating.openDetail"
        />
      </div>
    </section>

    <QuickAddTask v-if="floating.authenticated && !floating.miniMode" @submit="floating.quickAdd" />
  </main>
</template>
