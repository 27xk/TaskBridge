import assert from "node:assert/strict";
import test from "node:test";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";

test("a page switch during loading restores its position and resumes tracking when data arrives", async () => {
  const main = { scrollTop: 200 };
  const taskStore = { loading: true };
  const workspaceStore = { taskView: { scrollTop: 800 }, todayScrollTop: 0,
    rememberScroll(view, value) { if (view === "all") this.taskView.scrollTop = value; } };
  const api = await loadTsFunctions("renderer/App.vue", ["restoreCurrentScroll", "rememberCurrentScroll", "onTaskLoadingChanged"], {
    main, taskStore, workspaceStore, workspaceMain: { value: main }, activeView: { value: "tasks" },
    auth: { workspaceKey: "a" }, scrollRestorePending: true, restoringScroll: false, isFloating: false,
    nextTick: async () => {}, window: { requestAnimationFrame: (callback) => { callback(); return 1; } },
  });
  await api.restoreCurrentScroll();
  assert.equal(main.scrollTop, 200);
  taskStore.loading = false;
  await api.onTaskLoadingChanged(false);
  assert.equal(main.scrollTop, 800);
  main.scrollTop = 600;
  api.rememberCurrentScroll();
  assert.equal(workspaceStore.taskView.scrollTop, 600);
});

test("floating renderer readiness does not wait for a successful initial task fetch", async () => {
  let failInitialization;
  let ready = 0;
  const captureError = { value: "" };
  const { initializeFloatingView } = await loadTsFunctions("renderer/views/FloatingView.vue", ["initializeFloatingView"], {
    floating: { init: () => new Promise((_, reject) => { failInitialization = reject; }) },
    captureError, settingsStore: { t: (key) => key }, nextTick: async () => {},
    bridge: () => ({ window: { quickAddReady: async () => { ready += 1; return true; } } }),
  });
  const initializing = initializeFloatingView();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ready, 1);
  failInitialization(new Error("transient task read failure"));
  await initializing;
  assert.equal(ready, 1);
  assert.ok(captureError.value);
});

test("an undoable task action does not leave a contradictory success toast after undo", async () => {
  const notices = [];
  const taskStore = { pendingUndo: null };
  const notice = { value: "old notice" };
  const { runTaskAction } = await loadTsFunctions("renderer/views/TaskView.vue", ["runTaskAction"], {
    taskStore, notice, bulkBusy: { value: false }, runningTaskActions: new Set(), workspaceEpoch: 0,
    actionError: { value: "" }, settingsStore: { language: "zh-CN" }, IMPORTANT_NOTICE_MS: 4500,
    showNotice: (message) => notices.push(message), console,
  });
  const task = { localId: "task-a", title: "draft" };
  await runTaskAction(task, async () => { taskStore.pendingUndo = { id: "undo-a" }; }, "deleted");
  assert.deepEqual(notices, []);
  assert.equal(notice.value, "");
  await runTaskAction(task, async () => {}, "exported");
  assert.equal(notices.length, 1, "actions without a new undo still need success feedback");
});
