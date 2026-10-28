import { computed, shallowRef, watch } from "vue";

interface FloatingCaptureDraft {
  workspaceKey: string | null;
  title: string;
  submissionId: string;
}

export function useFloatingCaptureDraft(workspaceKey: () => string | null, reportDurability: (durable: boolean) => void = () => {}) {
  const draft = shallowRef<FloatingCaptureDraft>({ workspaceKey: null, title: "", submissionId: "" });
  const durable = shallowRef(true);
  const unsavedDrafts = new Map<string, FloatingCaptureDraft>();
  let lastReported: boolean | undefined;
  const storageKey = (workspace: string) => `taskbridge.floating-capture.v1:${encodeURIComponent(workspace)}`;

  function updateDurability(): void {
    durable.value = unsavedDrafts.size === 0;
    if (lastReported === durable.value) return;
    reportDurability(durable.value);
    lastReported = durable.value;
  }

  watch(workspaceKey, (workspace) => {
    let restored: Partial<FloatingCaptureDraft> = {};
    try {
      restored = workspace ? unsavedDrafts.get(workspace) ?? JSON.parse(window.localStorage.getItem(storageKey(workspace)) || "{}") : {};
    } catch { /* An invalid draft must not prevent capture from opening. */ }
    draft.value = {
      workspaceKey: workspace,
      title: typeof restored?.title === "string" ? restored.title.slice(0, 255) : "",
      submissionId: typeof restored?.submissionId === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(restored.submissionId) ? restored.submissionId : crypto.randomUUID(),
    };
    updateDurability();
  }, { immediate: true, flush: "sync" });

  function persist(): void {
    if (!draft.value.workspaceKey) return;
    const workspace = draft.value.workspaceKey;
    unsavedDrafts.set(workspace, { ...draft.value });
    try {
      if (draft.value.title) window.localStorage.setItem(storageKey(workspace), JSON.stringify(draft.value));
      else window.localStorage.removeItem(storageKey(workspace));
      unsavedDrafts.delete(workspace);
    } catch { /* Keep this renderer alive until all in-memory drafts are durable. */ }
    updateDurability();
  }

  function retryPersistence(): void {
    for (const [workspace, value] of unsavedDrafts) {
      try {
        if (value.title) window.localStorage.setItem(storageKey(workspace), JSON.stringify(value));
        else window.localStorage.removeItem(storageKey(workspace));
        unsavedDrafts.delete(workspace);
      } catch { /* A later reopen or edit may retry without losing the draft. */ }
    }
    updateDurability();
  }

  const title = computed({
    get: () => draft.value.title,
    set: (value: string) => {
      if (value === draft.value.title) return;
      draft.value = { ...draft.value, title: value.slice(0, 255), submissionId: crypto.randomUUID() };
      persist();
    },
  });

  function snapshot(): FloatingCaptureDraft { return { ...draft.value }; }

  function clearIfCurrent(submitted: FloatingCaptureDraft): boolean {
    if (submitted.workspaceKey !== workspaceKey() || submitted.submissionId !== draft.value.submissionId) return false;
    title.value = "";
    return true;
  }

  return { title, durable, snapshot, clearIfCurrent, retryPersistence };
}
