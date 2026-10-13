import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";

async function editorHarness({ dirty = true, saving = false, confirm = false, current = { localId: "a", title: "A" } } = {}) {
  const globals = {
    workspaceEpoch: 0,
    editorOpen: { value: true }, editingTask: { value: current }, editorDirty: { value: dirty },
    isSaving: { value: saving }, editorSaveError: { value: "previous failure" },
    settingsStore: { t: (key) => key }, confirmations: [],
    requestConfirmation: async (options) => { globals.confirmations.push(options); return confirm; },
    setEditorDirty: (value) => { globals.editorDirty.value = value; },
  };
  const functions = await loadTsFunctions("src/views/TaskView.vue", ["canLeaveEditor", "openEdit", "openCreate", "closeEditor"], globals);
  return { ...functions, globals };
}

test("canceling a task switch keeps the current editor and dirty content", async () => {
  const editor = await editorHarness();
  await editor.openEdit({ localId: "b", title: "B" });
  assert.equal(editor.globals.editingTask.value.localId, "a");
  assert.equal(editor.globals.editorDirty.value, true);
  assert.equal(editor.globals.editorSaveError.value, "previous failure");
  assert.equal(editor.globals.confirmations.length, 1);
});

test("confirming a task switch resets the editor for the requested task", async () => {
  const editor = await editorHarness({ confirm: true });
  await editor.openEdit({ localId: "b", title: "B" });
  assert.equal(editor.globals.editingTask.value.localId, "b");
  assert.equal(editor.globals.editorDirty.value, false);
  assert.equal(editor.globals.editorSaveError.value, "");
});

test("cannot replace a saving editor with a task or a new draft", async () => {
  const editor = await editorHarness({ saving: true, confirm: true });
  await editor.openEdit({ localId: "b", title: "B" });
  await editor.openCreate();
  assert.equal(editor.globals.editingTask.value.localId, "a");
  assert.equal(editor.globals.confirmations.length, 0);
});

test("opening the same task leaves dirty edits intact without a confirmation", async () => {
  const editor = await editorHarness();
  await editor.openEdit({ localId: "a", title: "updated remote title" });
  assert.equal(editor.globals.editingTask.value.title, "A");
  assert.equal(editor.globals.editorDirty.value, true);
  assert.equal(editor.globals.confirmations.length, 0);
});

test("creating a task cannot discard an existing task when confirmation is canceled", async () => {
  const editor = await editorHarness();
  await editor.openCreate();
  assert.equal(editor.globals.editingTask.value.localId, "a");
  assert.equal(editor.globals.editorDirty.value, true);
});

test("closing a new capture leaves the shared draft available without discard confirmation", async () => {
  const editor = await editorHarness({ current: null });
  await editor.closeEditor();
  assert.equal(editor.globals.editorOpen.value, false);
  assert.equal(editor.globals.confirmations.length, 0);
});

async function bulkHarness() {
  const globals = {
    workspaceEpoch: 0, bulkBusy: { value: false },
    bulkActionTargets: { value: [{ localId: "a" }, { localId: "b" }] },
    selectableOpenTasks: { value: [{ localId: "a" }, { localId: "b" }] },
    selectedTaskIds: { value: new Set(["a", "b"]) }, selectionMode: { value: true },
    actionError: { value: "" }, notices: [], IMPORTANT_NOTICE_MS: 4500,
    settingsStore: { language: "zh-CN" }, taskStore: { pendingUndo: null },
    requestConfirmation: async () => true,
    showNotice: (message) => globals.notices.push(message),
    console: { error() {} },
    exitSelectionMode: () => { globals.selectionMode.value = false; globals.selectedTaskIds.value = new Set(); },
  };
  const functions = await loadTsFunctions("src/views/TaskView.vue", ["runBulkAction"], globals);
  return { ...functions, globals };
}

const result = (changes = {}) => ({ requested: 2, succeeded: 2, failed: 0, skipped: 0, succeededIds: ["a", "b"], failedIds: [], skippedIds: [], ...changes });

test("a partially failed batch keeps only failed items selected and reports the count", async () => {
  const bulk = await bulkHarness();
  await bulk.runBulkAction(async () => result({ succeeded: 1, failed: 1, succeededIds: ["a"], failedIds: ["b"] }), "安排到今天");
  assert.deepEqual([...bulk.globals.selectedTaskIds.value], ["b"]);
  assert.equal(bulk.globals.selectionMode.value, true);
  assert.match(bulk.globals.actionError.value, /1.*失败/);
  assert.equal(bulk.globals.bulkBusy.value, false);
});

test("batch rejection retains selection and displays a retryable failure", async () => {
  const bulk = await bulkHarness();
  await bulk.runBulkAction(async () => { throw new Error("database failure"); }, "改期");
  assert.deepEqual([...bulk.globals.selectedTaskIds.value], ["a", "b"]);
  assert.equal(bulk.globals.selectionMode.value, true);
  assert.ok(bulk.globals.actionError.value.length > 0);
  assert.equal(bulk.globals.bulkBusy.value, false);
});

test("successful batch exits selection and prevents a concurrent double click", async () => {
  const bulk = await bulkHarness();
  let resolve;
  let calls = 0;
  const operation = () => { calls += 1; return new Promise((done) => { resolve = done; }); };
  const running = bulk.runBulkAction(operation, "完成");
  await Promise.resolve();
  await bulk.runBulkAction(operation, "完成");
  assert.equal(calls, 1);
  resolve(result());
  await running;
  assert.equal(bulk.globals.selectionMode.value, false);
  assert.equal(bulk.globals.selectedTaskIds.value.size, 0);
  assert.equal(bulk.globals.bulkBusy.value, false);
});

test("persisted batch with a refresh failure does not leave successful tasks selected for retry", async () => {
  const bulk = await bulkHarness();
  await bulk.runBulkAction(async () => result({ refreshFailed: true }), "改期");
  assert.equal(bulk.globals.selectionMode.value, false);
  assert.equal(bulk.globals.selectedTaskIds.value.size, 0);
  assert.match(bulk.globals.actionError.value, /刷新/);
});

test("a new undo notice replaces a duplicate bulk success toast", async () => {
  const bulk = await bulkHarness();
  await bulk.runBulkAction(async () => {
    bulk.globals.taskStore.pendingUndo = { id: "current-batch" };
    return result();
  }, "完成");
  assert.equal(bulk.globals.notices.length, 0);
  assert.equal(bulk.globals.selectionMode.value, false);
});

test("failed tasks outside the current eligible list are not falsely described as still selected", async () => {
  const bulk = await bulkHarness();
  await bulk.runBulkAction(async () => {
    bulk.globals.selectableOpenTasks.value = [];
    return result({ succeeded: 1, failed: 1, succeededIds: ["a"], failedIds: ["b"] });
  }, "完成");
  assert.equal(bulk.globals.selectionMode.value, false);
  assert.equal(bulk.globals.selectedTaskIds.value.size, 0);
  assert.match(bulk.globals.actionError.value, /1.*失败/);
  assert.doesNotMatch(bulk.globals.actionError.value, /仍已选中/);
});

test("queue-failed writes explain local persistence and exclude saved tasks from mutation retry", async () => {
  const bulk = await bulkHarness();
  await bulk.runBulkAction(async () => result({ succeeded: 0, failed: 2, succeededIds: [], failedIds: ["a", "b"], queueFailedIds: ["a"] }), "改期");
  assert.deepEqual([...bulk.globals.selectedTaskIds.value], ["b"]);
  assert.match(bulk.globals.actionError.value, /本机/);
  assert.match(bulk.globals.actionError.value, /撤销/);
  assert.match(bulk.globals.actionError.value, /1.*失败/);
});

test("single-task scheduling failure is visible even when the task list is scrolled", async () => {
  const globals = {
    workspaceEpoch: 0, bulkBusy: { value: false }, runningTaskActions: new Set(),
    actionError: { value: "" }, notice: { value: "" }, settingsStore: { language: "zh-CN" },
    taskStore: { planToday: async () => { throw new Error("write failed"); } },
    notices: [], IMPORTANT_NOTICE_MS: 4500, console: { error() {} },
  };
  globals.showNotice = (message) => globals.notices.push(message);
  const { planTaskToday } = await loadTsFunctions("src/views/TaskView.vue", ["runTaskAction", "planTaskToday"], globals);
  await planTaskToday({ localId: "a", title: "Keep this task" });
  assert.match(globals.actionError.value, /Keep this task/);
  assert.deepEqual(globals.notices, [globals.actionError.value]);
  assert.equal(globals.runningTaskActions.size, 0);
});
