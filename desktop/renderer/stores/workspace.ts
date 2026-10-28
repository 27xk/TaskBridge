import { defineStore } from "pinia";
import { onScopeDispose, reactive, shallowRef, watch } from "vue";

import { useAuthStore } from "./auth";
import {
  createSavedTaskView,
  createWorkspaceViewState,
  normalizeTaskViewCriteria,
  readWorkspaceViewState,
  writeWorkspaceViewState,
  type SavedTaskView,
  type TaskViewCriteria,
  type TaskViewFilter,
  type TaskViewSelectionKey,
  type TaskViewSelectionValue,
  type WorkspaceViewState,
  type WorkspaceViewStorage,
} from "../../common/workspace-view-state";

export const useWorkspaceStore = defineStore("workspace", () => {
  const auth = useAuthStore();
  const taskView = reactive(createWorkspaceViewState().taskView);
  const todayScrollTop = shallowRef(0);
  const savedViews = shallowRef<SavedTaskView[]>([]);
  const workspaceKey = shallowRef<string | null>(null);
  const persistenceError = shallowRef(false);
  let loadingWorkspace = false;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  function snapshot(): WorkspaceViewState {
    return { taskView: { ...normalizeTaskViewCriteria(taskView), scrollTop: taskView.scrollTop }, todayScrollTop: todayScrollTop.value, savedViews: savedViews.value };
  }

  function cancelPendingPersist(): void {
    if (persistTimer !== undefined) clearTimeout(persistTimer);
    persistTimer = undefined;
  }

  function persist(): boolean {
    cancelPendingPersist();
    if (loadingWorkspace || !workspaceKey.value) return false;
    const saved = writeWorkspaceViewState(storage(), workspaceKey.value, snapshot());
    persistenceError.value = !saved;
    return saved;
  }

  watch(() => auth.workspaceKey, (nextKey) => {
    if (nextKey === workspaceKey.value) return;
    persist();
    loadingWorkspace = true;
    const restored = readWorkspaceViewState(storage(), nextKey);
    Object.assign(taskView, restored.taskView);
    todayScrollTop.value = restored.todayScrollTop;
    savedViews.value = restored.savedViews;
    persistenceError.value = false;
    workspaceKey.value = nextKey;
    loadingWorkspace = false;
  }, { immediate: true, flush: "sync" });

  function schedulePersist(): void {
    if (loadingWorkspace || !workspaceKey.value) return;
    cancelPendingPersist();
    persistTimer = setTimeout(persist, 200);
  }

  watch([taskView, todayScrollTop, savedViews], schedulePersist, { deep: true, flush: "sync" });
  onScopeDispose(persist);

  function rememberScroll(view: "all" | "today", value: number): void {
    const position = Number.isFinite(value) ? Math.max(0, value) : 0;
    if (view === "all") taskView.scrollTop = position;
    else todayScrollTop.value = position;
  }

  function applyTaskView(criteria: Partial<TaskViewCriteria>): void {
    Object.assign(taskView, normalizeTaskViewCriteria(criteria), { scrollTop: 0 });
  }

  function toggleTaskViewSelection<K extends TaskViewSelectionKey>(key: K, value: TaskViewSelectionValue<K>): void {
    const values = taskView[key] as TaskViewSelectionValue<K>[];
    const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    applyTaskView({ ...taskView, [key]: next, filter: "all" });
  }

  function setTaskViewFilter(filter: TaskViewFilter): void {
    const preset = normalizeTaskViewCriteria({ filter });
    applyTaskView({
      ...taskView,
      filter,
      lists: preset.lists,
      statuses: preset.statuses,
      priorities: preset.priorities,
    });
  }

  function saveCurrentView(name: string): SavedTaskView {
    const view = createSavedTaskView(name, taskView, savedViews.value);
    commitSavedViews([...savedViews.value, view]);
    return view;
  }

  function applySavedView(id: string): boolean {
    const view = savedViews.value.find((item) => item.id === id);
    if (!view) return false;
    applyTaskView(view.criteria);
    return true;
  }

  function deleteSavedView(id: string): void {
    commitSavedViews(savedViews.value.filter((view) => view.id !== id));
  }

  function commitSavedViews(views: SavedTaskView[]): void {
    if (!workspaceKey.value) throw new Error("workspace-unavailable");
    const saved = writeWorkspaceViewState(storage(), workspaceKey.value, { ...snapshot(), savedViews: views });
    persistenceError.value = !saved;
    if (!saved) throw new Error("view-storage-unavailable");
    savedViews.value = views;
    cancelPendingPersist();
  }

  return { taskView, todayScrollTop, savedViews, workspaceKey, persistenceError, rememberScroll, persist, applyTaskView, toggleTaskViewSelection, setTaskViewFilter, saveCurrentView, applySavedView, deleteSavedView };
});

function storage(): WorkspaceViewStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
