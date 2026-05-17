import { defineStore } from "pinia";
import { ref } from "vue";

import { SyncManager } from "../sync/SyncManager";

export const useSyncStore = defineStore("sync", () => {
  const status = ref<"idle" | "syncing" | "offline" | "error" | "synced">("idle");
  const message = ref("Sync idle");
  const manager = ref<SyncManager | null>(null);

  function init(onTasksChanged: () => Promise<void>): void {
    if (manager.value) return;
    manager.value = new SyncManager(
      (nextStatus, nextMessage) => {
        status.value = nextStatus;
        message.value = nextMessage;
      },
      onTasksChanged,
    );
  }

  async function start(onTasksChanged: () => Promise<void>): Promise<void> {
    init(onTasksChanged);
    await manager.value?.start();
  }

  function stop(): void {
    manager.value?.stop();
    manager.value = null;
  }

  async function syncNow(): Promise<void> {
    await manager.value?.syncNow();
  }

  return {
    status,
    message,
    init,
    start,
    stop,
    syncNow,
  };
});
