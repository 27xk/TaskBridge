import assert from "node:assert/strict";
import test from "node:test";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";

async function createApp(overrides = {}, names = ["requestViewChange", "openTaskDetail", "openQuickAdd", "clearPendingEditorRequests", "consumeTaskDetailRequest", "consumeQuickAddRequest"]) {
  const state = {
    auth: { workspaceKey: "account-a" },
    activeView: { value: "tasks" },
    editorDirty: { value: false },
    settingsConnectionDirty: { value: false },
    openTaskRequest: { value: null },
    quickAddSignal: { value: 0 },
    taskDetailRequestSequence: 0,
    quickAddRequestSequence: 0,
    editorRequestGeneration: 0,
    scrollRestorePending: false,
    confirmDiscardCurrentEditor: async () => true,
    rememberCurrentScroll() {},
    restoreCurrentScroll: async () => {},
    Date: { now: () => 42 },
    ...overrides,
  };
  return { state, api: await loadTsFunctions("src/App.vue", names, state) };
}

test("leaving all tasks discards the old floating task request before the view can remount", async () => {
  const { state, api } = await createApp();
  await api.openTaskDetail("floating-task");
  assert.equal(state.openTaskRequest.value.localId, "floating-task");
  assert.equal(await api.requestViewChange("today"), true);
  assert.equal(state.openTaskRequest.value, null);
  await api.requestViewChange("tasks");
  assert.equal(state.openTaskRequest.value, null);
});

test("leaving all tasks discards an old quick add command without reopening the draft", async () => {
  const { state, api } = await createApp();
  await api.openQuickAdd();
  assert.ok(state.quickAddSignal.value > 0);
  await api.requestViewChange("settings");
  assert.equal(state.quickAddSignal.value, 0);
  await api.requestViewChange("tasks");
  assert.equal(state.quickAddSignal.value, 0);
});

test("canceling dirty navigation retains the view, editor and its current pending command", async () => {
  const request = { localId: "unsaved-task", nonce: 7 };
  const { state, api } = await createApp({
    openTaskRequest: { value: request },
    editorDirty: { value: true },
    confirmDiscardCurrentEditor: async () => false,
  });
  assert.equal(await api.requestViewChange("today"), false);
  assert.equal(state.activeView.value, "tasks");
  assert.equal(state.editorDirty.value, true);
  assert.equal(state.openTaskRequest.value, request);
});

test("two floating clicks in the same millisecond still receive distinct request identities", async () => {
  const { state, api } = await createApp();
  await api.openTaskDetail("first-task");
  const firstNonce = state.openTaskRequest.value.nonce;
  await api.openTaskDetail("second-task");
  assert.notEqual(state.openTaskRequest.value.nonce, firstNonce);
  assert.equal(state.openTaskRequest.value.localId, "second-task");
});

test("an older floating click finishing navigation late cannot replace the newer click", async () => {
  const pending = [];
  const { state, api } = await createApp({
    requestViewChange: () => new Promise((resolve) => pending.push(resolve)),
  }, ["openTaskDetail"]);
  const first = api.openTaskDetail("first-task");
  const second = api.openTaskDetail("second-task");
  pending[1](true);
  await second;
  pending[0](true);
  await first;
  assert.equal(state.openTaskRequest.value.localId, "second-task");
});

test("two concurrent floating clicks from today still open the most recently requested task", async () => {
  const { state, api } = await createApp({ activeView: { value: "today" } });
  await Promise.all([api.openTaskDetail("first-task"), api.openTaskDetail("second-task")]);
  assert.equal(state.activeView.value, "tasks");
  assert.equal(state.openTaskRequest.value?.localId, "second-task");
});

test("a workspace change during navigation cannot publish another account's task request", async () => {
  let finishNavigation;
  const { state, api } = await createApp({
    requestViewChange: () => new Promise((resolve) => { finishNavigation = resolve; }),
  }, ["openTaskDetail"]);
  const opening = api.openTaskDetail("account-a-task");
  state.auth.workspaceKey = "account-b";
  finishNavigation(true);
  await opening;
  assert.equal(state.openTaskRequest.value, null);
});

test("a quick add command resolving after a different page opens remains canceled", async () => {
  let finishNavigation;
  const { state, api } = await createApp({
    requestViewChange: () => new Promise((resolve) => { finishNavigation = resolve; }),
  }, ["openQuickAdd"]);
  const opening = api.openQuickAdd();
  state.activeView.value = "settings";
  finishNavigation(true);
  await opening;
  assert.equal(state.quickAddSignal.value, 0);
});

test("consuming a floating task request prevents it from returning on the next all-tasks mount", async () => {
  const { state, api } = await createApp();
  await api.openTaskDetail("floating-task");
  const firstNonce = state.openTaskRequest.value.nonce;
  api.consumeTaskDetailRequest(firstNonce);
  assert.equal(state.openTaskRequest.value, null);
  await api.requestViewChange("today");
  await api.requestViewChange("tasks");
  assert.equal(state.openTaskRequest.value, null);
  await api.openTaskDetail("floating-task");
  assert.ok(state.openTaskRequest.value.nonce > firstNonce);
});

test("a delayed consumption acknowledgement cannot clear a newer floating request", async () => {
  const { state, api } = await createApp();
  await api.openTaskDetail("first-task");
  const firstNonce = state.openTaskRequest.value.nonce;
  await api.openTaskDetail("second-task");
  const currentRequest = state.openTaskRequest.value;
  api.consumeTaskDetailRequest(firstNonce);
  assert.equal(state.openTaskRequest.value, currentRequest);
  api.consumeTaskDetailRequest(currentRequest.nonce);
  assert.equal(state.openTaskRequest.value, null);
});

test("consumed quick-add commands have distinct signals and an old acknowledgement preserves the next command", async () => {
  const { state, api } = await createApp();
  await api.openQuickAdd();
  const firstSignal = state.quickAddSignal.value;
  api.consumeQuickAddRequest(firstSignal);
  assert.equal(state.quickAddSignal.value, 0);
  await api.openQuickAdd();
  const nextSignal = state.quickAddSignal.value;
  assert.ok(nextSignal > firstSignal);
  api.consumeQuickAddRequest(firstSignal);
  assert.equal(state.quickAddSignal.value, nextSignal);
  api.consumeQuickAddRequest(nextSignal);
  assert.equal(state.quickAddSignal.value, 0);
});

test("a new quick-add command replaces a pending edit and a new floating click replaces pending quick add", async () => {
  const { state, api } = await createApp();
  await api.openTaskDetail("first-task");
  await api.openQuickAdd();
  assert.equal(state.openTaskRequest.value, null);
  assert.ok(state.quickAddSignal.value > 0);
  await api.openTaskDetail("second-task");
  assert.equal(state.quickAddSignal.value, 0);
  assert.equal(state.openTaskRequest.value.localId, "second-task");
});

test("an older edit navigation cannot override a newer quick-add command", async () => {
  const pending = [];
  const { state, api } = await createApp({
    requestViewChange: () => new Promise((resolve) => pending.push(resolve)),
  }, ["openTaskDetail", "openQuickAdd"]);
  const edit = api.openTaskDetail("first-task");
  const create = api.openQuickAdd();
  pending[1](true);
  await create;
  pending[0](true);
  await edit;
  assert.equal(state.openTaskRequest.value, null);
  assert.ok(state.quickAddSignal.value > 0);
});

test("clearing pending requests cancels an in-flight open even if the workspace key later matches again", async () => {
  let finishNavigation;
  const { state, api } = await createApp({
    requestViewChange: () => new Promise((resolve) => { finishNavigation = resolve; }),
  }, ["openTaskDetail", "clearPendingEditorRequests"]);
  const opening = api.openTaskDetail("old-workspace-task");
  api.clearPendingEditorRequests();
  finishNavigation(true);
  await opening;
  assert.equal(state.openTaskRequest.value, null);
});

test("resetting the workspace clears both commands without reusing a previous request's identity", async () => {
  const { state, api } = await createApp({
    taskStore: { resetWorkspace() {} },
    syncStore: { resetWorkspace() {} },
    settingsSectionRequest: { value: null },
    notifiedReminderIds: new Set(),
    saveNotifiedReminderIds() {},
    workspaceInstanceKey: { value: 0 },
  }, ["requestViewChange", "openTaskDetail", "openQuickAdd", "clearPendingEditorRequests", "resetWorkspaceUiState", "consumeTaskDetailRequest"]);
  await api.openTaskDetail("old-account-task");
  const oldNonce = state.openTaskRequest.value.nonce;
  api.resetWorkspaceUiState();
  assert.equal(state.openTaskRequest.value, null);
  assert.equal(state.quickAddSignal.value, 0);
  assert.equal(state.activeView.value, "today");
  await api.openTaskDetail("new-account-task");
  assert.ok(state.openTaskRequest.value.nonce > oldNonce);
  api.consumeTaskDetailRequest(oldNonce);
  assert.equal(state.openTaskRequest.value.localId, "new-account-task");
});
