import { defineStore } from "pinia";
import { computed, shallowRef, watch } from "vue";

import { useAuthStore } from "./auth";
import type { TaskDraft } from "./task";

export interface CaptureSnapshot {
  workspaceKey: string | null;
  revision: number;
  draft: TaskDraft;
}

/** One new-task draft shared by quick capture and both workspace editors. */
export const useCaptureStore = defineStore("capture", () => {
  const auth = useAuthStore();
  const draft = shallowRef<TaskDraft>({ title: "" });
  let revision = 0;
  const hasContent = computed(() => Boolean(draft.value.title.trim() || draft.value.content?.trim()));

  watch(() => auth.workspaceKey, () => {
    draft.value = { title: "" };
    revision += 1;
  }, { flush: "sync" });

  function updateDraft(value: TaskDraft): void {
    const next = { ...value, checklistItems: value.checklistItems?.map((item) => ({ ...item })) };
    if (JSON.stringify(next) === JSON.stringify(draft.value)) return;
    draft.value = next;
    revision += 1;
  }

  function snapshot(): CaptureSnapshot {
    return {
      workspaceKey: auth.workspaceKey,
      revision,
      draft: { ...draft.value, checklistItems: draft.value.checklistItems?.map((item) => ({ ...item })) },
    };
  }

  function clearIfCurrent(submitted: CaptureSnapshot): boolean {
    if (submitted.workspaceKey !== auth.workspaceKey || submitted.revision !== revision) return false;
    draft.value = { title: "" };
    revision += 1;
    return true;
  }

  return { draft, hasContent, updateDraft, snapshot, clearIfCurrent };
});
