import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";

const require = createRequire(import.meta.url);
const vue = require("vue");
const ts = require("typescript");
const { parse, compileScript } = require("@vue/compiler-sfc");
const desktopRoot = resolve(import.meta.dirname, "..");
const viewPath = resolve(desktopRoot, "renderer/views/TaskView.vue");
const { descriptor } = parse(readFileSync(viewPath, "utf8"), { filename: viewPath });
const script = compileScript(descriptor, { id: "task-request-consumption" });
const compiled = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const { createWorkspaceViewState } = loadElectronModule("common/workspace-view-state.ts");

function task(localId) {
  return {
    localId, title: localId, content: "", project: "", tag: "", status: "open", priority: 0,
    listType: "inbox", syncStatus: "synced", isTemplate: false, isDeleted: false,
    dueTime: null, plannedDate: null, createdAt: "2026-10-14T00:00:00Z",
  };
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flush() {
  await vue.nextTick();
  await new Promise((resolve) => setImmediate(resolve));
  await vue.nextTick();
}

async function harness(t, { initialRequest = null, quickAddSignal = 0, tasks = [task("a"), task("b")], load, readDetail } = {}) {
  const props = vue.reactive({ openTaskRequest: initialRequest, quickAddSignal, searchSignal: 0 });
  const parent = {
    openTaskRequest: vue.toRef(props, "openTaskRequest"),
    quickAddSignal: vue.toRef(props, "quickAddSignal"),
  };
  const consumption = await loadTsFunctions("renderer/App.vue", ["consumeTaskDetailRequest", "consumeQuickAddRequest"], parent);
  const events = [];
  const errors = [];
  const beforeUnmount = [];
  const taskStore = vue.reactive({
    tasks,
    get activeTasks() { return this.tasks.filter((item) => !item.isDeleted); },
    get trashTasks() { return this.tasks.filter((item) => item.isDeleted); },
    timelineNow: new Date("2026-10-14T00:00:00Z"),
    load: load ?? (async () => {}),
  });
  const workspaceStore = vue.reactive({ workspaceKey: "account-a", ...createWorkspaceViewState() });
  const mocks = {
    vue: { ...vue, onBeforeUnmount: (callback) => beforeUnmount.push(callback), useTemplateRef: () => vue.shallowRef(null) },
    "../stores/task": { useTaskStore: () => taskStore },
    "../stores/workspace": { useWorkspaceStore: () => workspaceStore },
    "../stores/settings": { useSettingsStore: () => ({ language: "zh-CN", displayTimeZone: "Asia/Shanghai", t: (key) => key }) },
    "../stores/capture": { useCaptureStore: () => ({ updateDraft() {}, snapshot: () => ({}) }) },
    "../db/task.dao": { getTask: readDetail ?? (async (id) => taskStore.tasks.find(item => item.localId === id) ?? task(id)), searchTaskIds: async () => [] },
  };
  const module = { exports: {} };
  const resolveImport = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.endsWith(".vue")) return {};
    if (specifier.startsWith(".")) {
      const target = relative(desktopRoot, resolve(dirname(viewPath), `${specifier}.ts`)).replaceAll("\\", "/");
      return loadElectronModule(target, { vue });
    }
    return require(specifier);
  };
  new Function("module", "exports", "require", "window", "console", compiled)(
    module, module.exports, resolveImport, { setTimeout, clearTimeout }, { error: (...args) => errors.push(args) },
  );
  const component = module.exports.default;
  const scope = vue.effectScope();
  const view = scope.run(() => component.setup(props, {
    expose() {},
    emit(name, payload) {
      events.push([name, payload]);
      if (name === "taskRequestConsumed") consumption.consumeTaskDetailRequest(payload);
      if (name === "quickAddConsumed") consumption.consumeQuickAddRequest(payload);
    },
  }));
  let mounted = true;
  function unmount() {
    if (!mounted) return;
    mounted = false;
    beforeUnmount.forEach((callback) => callback());
    scope.stop();
  }
  t.after(unmount);
  return { view, props, events, errors, taskStore, workspaceStore, unmount };
}

test("a first floating task request opens the requested editor and is consumed exactly once", async (t) => {
  const h = await harness(t, { initialRequest: { localId: "a", nonce: 1 } });
  await flush();
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.view.editingTask.value.localId, "a");
  assert.equal(h.props.openTaskRequest, null);
  assert.deepEqual(h.events.filter(([name]) => name === "taskRequestConsumed"), [["taskRequestConsumed", 1]]);
});

test("opening an index summary reads complete detail and discards a slower previous detail read", async (t) => {
  const pending = deferred();
  const detail = { ...task("b"), content: "Full body beyond the preview", checklistJson: '[{"id":"x","title":"Full checklist"}]' };
  const h = await harness(t, { readDetail: async id => id === "a" ? pending.promise : detail });
  const first = h.view.openEdit({ localId: "a", title: "summary a" });
  await flush();
  await h.view.openEdit({ localId: "b", title: "summary b" });
  assert.equal(h.view.editingTask.value.content, detail.content);
  assert.equal(h.view.editingTask.value.checklistJson, detail.checklistJson);
  pending.resolve(task("a"));
  await first;
  assert.equal(h.view.editingTask.value.localId, "b");
});

test("closing and remounting all tasks cannot revive a consumed floating request", async (t) => {
  const first = await harness(t, { initialRequest: { localId: "a", nonce: 1 } });
  await flush();
  await first.view.closeEditor();
  assert.equal(first.view.editorOpen.value, false);
  first.unmount();
  const second = await harness(t, { initialRequest: first.props.openTaskRequest });
  await flush();
  assert.equal(second.view.editorOpen.value, false);
  assert.equal(second.view.editingTask.value, null);
  assert.equal(second.events.filter(([name]) => name === "taskRequestConsumed").length, 0);
});

test("consuming quick add resets the signal while leaving its newly opened editor visible", async (t) => {
  const h = await harness(t, { quickAddSignal: 1 });
  await flush();
  assert.equal(h.props.quickAddSignal, 0);
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.view.editingTask.value, null);
  assert.deepEqual(h.events.filter(([name]) => name === "quickAddConsumed"), [["quickAddConsumed", 1]]);
});

test("a slower first request cannot open a task or consume its newer pending request", async (t) => {
  const pendingLoads = [];
  const h = await harness(t, {
    tasks: [], initialRequest: { localId: "a", nonce: 1 },
    load: () => { const pending = deferred(); pendingLoads.push(pending); return pending.promise; },
  });
  h.props.openTaskRequest = { localId: "b", nonce: 2 };
  await flush();
  assert.equal(pendingLoads.length, 2);
  h.taskStore.tasks = [task("a"), task("b")];
  pendingLoads[0].resolve();
  await flush();
  assert.equal(h.view.editorOpen.value, false);
  assert.equal(h.props.openTaskRequest.nonce, 2);
  pendingLoads[1].resolve();
  await flush();
  assert.equal(h.view.editingTask.value.localId, "b");
  assert.equal(h.props.openTaskRequest, null);
  assert.deepEqual(h.events.filter(([name]) => name === "taskRequestConsumed"), [["taskRequestConsumed", 1], ["taskRequestConsumed", 2]]);
});

test("returning to all tasks after navigation during a load does not open the old editor", async (t) => {
  const loading = deferred();
  const first = await harness(t, { tasks: [], initialRequest: { localId: "a", nonce: 1 }, load: () => loading.promise });
  first.props.openTaskRequest = null;
  first.unmount();
  const returned = await harness(t, { initialRequest: first.props.openTaskRequest });
  first.taskStore.tasks = [task("a")];
  loading.resolve();
  await flush();
  assert.equal(first.view.editorOpen.value, false);
  assert.equal(returned.view.editorOpen.value, false);
  assert.equal(first.view.actionError.value, "");
});

test("an account switch invalidates a task load and cannot expose the previous account's editor", async (t) => {
  const loading = deferred();
  const h = await harness(t, { tasks: [], initialRequest: { localId: "a", nonce: 1 }, load: () => loading.promise });
  h.workspaceStore.workspaceKey = "account-b";
  h.taskStore.tasks = [task("a")];
  loading.resolve();
  await flush();
  assert.equal(h.view.editorOpen.value, false);
  assert.equal(h.view.editingTask.value, null);
  assert.equal(h.view.actionError.value, "");
  assert.equal(h.props.openTaskRequest, null);
});

test("quick add replaces an in-flight task load and its consumption does not revive the edit", async (t) => {
  const loading = deferred();
  const h = await harness(t, { tasks: [], initialRequest: { localId: "a", nonce: 1 }, load: () => loading.promise });
  h.props.openTaskRequest = null;
  h.props.quickAddSignal = 1;
  await flush();
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.view.editingTask.value, null);
  assert.equal(h.props.quickAddSignal, 0);
  h.taskStore.tasks = [task("a")];
  loading.resolve();
  await flush();
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.view.editingTask.value, null);
});

test("canceling a requested edit preserves dirty contents and consumes the canceled command", async (t) => {
  const h = await harness(t, { initialRequest: { localId: "a", nonce: 1 } });
  await flush();
  h.view.setEditorDirty(true);
  h.props.openTaskRequest = { localId: "b", nonce: 2 };
  await flush();
  assert.equal(h.view.confirmDialog.value.visible, true);
  h.view.cancelRequestedAction();
  await flush();
  assert.equal(h.view.editingTask.value.localId, "a");
  assert.equal(h.view.editorDirty.value, true);
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.props.openTaskRequest, null);
  assert.equal(h.events.filter(([name, nonce]) => name === "taskRequestConsumed" && nonce === 2).length, 1);
});

test("a floating edit replaces quick add while both await a dirty-editor confirmation", async (t) => {
  const h = await harness(t, { initialRequest: { localId: "a", nonce: 1 } });
  await flush();
  h.view.setEditorDirty(true);
  h.props.quickAddSignal = 1;
  await flush();
  assert.equal(h.view.confirmDialog.value.visible, true);
  h.props.quickAddSignal = 0;
  h.props.openTaskRequest = { localId: "b", nonce: 2 };
  await flush();
  h.view.confirmRequestedAction();
  await flush();
  assert.equal(h.view.editingTask.value.localId, "b");
  assert.equal(h.view.editorDirty.value, false);
  assert.equal(h.props.quickAddSignal, 0);
  assert.equal(h.props.openTaskRequest, null);
});

test("an older task load failing after a newer edit opens cannot overwrite the current error state", async (t) => {
  const loading = deferred();
  const h = await harness(t, { tasks: [], initialRequest: { localId: "a", nonce: 1 }, load: () => loading.promise });
  h.taskStore.tasks = [task("a"), task("b")];
  h.props.openTaskRequest = { localId: "b", nonce: 2 };
  await flush();
  assert.equal(h.view.editingTask.value.localId, "b");
  loading.reject(new Error("old load failed"));
  await flush();
  assert.equal(h.view.editingTask.value.localId, "b");
  assert.equal(h.view.actionError.value, "");
  assert.equal(h.errors.length, 0);
});

test("a failed current request reports an error and is consumed rather than replayed", async (t) => {
  const h = await harness(t, {
    tasks: [], initialRequest: { localId: "a", nonce: 1 },
    load: async () => { throw new Error("read failed"); },
  });
  await flush();
  assert.equal(h.view.editorOpen.value, false);
  assert.ok(h.view.actionError.value);
  assert.equal(h.props.openTaskRequest, null);
  assert.equal(h.errors.length, 1);
  assert.equal(h.events.filter(([name]) => name === "taskRequestConsumed").length, 1);
});

test("saving the requested task leaves no command that could reopen it on remount", async (t) => {
  const first = await harness(t, { initialRequest: { localId: "a", nonce: 1 } });
  first.taskStore.updateTask = async () => {};
  await flush();
  first.view.setEditorDirty(true);
  await first.view.save({ title: "saved task" });
  assert.equal(first.view.editorOpen.value, false);
  assert.equal(first.props.openTaskRequest, null);
  first.unmount();
  const returned = await harness(t, { initialRequest: first.props.openTaskRequest });
  await flush();
  assert.equal(returned.view.editorOpen.value, false);
});

test("a button click event opens a new draft without being treated as a request guard", async (t) => {
  const h = await harness(t);
  await h.view.openCreate({ type: "click" });
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.view.editingTask.value, null);
});

test("clicking new task while a floating request loads keeps the user's newer draft open", async (t) => {
  const loading = deferred();
  const h = await harness(t, { tasks: [], initialRequest: { localId: "a", nonce: 1 }, load: () => loading.promise });
  await h.view.openCreate({ type: "click" });
  assert.equal(h.view.editingTask.value, null);
  h.taskStore.tasks = [task("a")];
  loading.resolve();
  await flush();
  assert.equal(h.view.editorOpen.value, true);
  assert.equal(h.view.editingTask.value, null);
  assert.equal(h.props.openTaskRequest, null);
});

test("clicking a task directly while a floating request loads keeps the newer task selected", async (t) => {
  const loading = deferred();
  const h = await harness(t, { tasks: [], initialRequest: { localId: "a", nonce: 1 }, load: () => loading.promise });
  await h.view.openEdit(task("b"));
  h.taskStore.tasks = [task("a"), task("b")];
  loading.resolve();
  await flush();
  assert.equal(h.view.editingTask.value.localId, "b");
  assert.equal(h.props.openTaskRequest, null);
});

test("closing the current editor cancels a floating request still waiting for its task load", async (t) => {
  const loading = deferred();
  const h = await harness(t, { load: () => loading.promise });
  await h.view.openEdit(task("a"));
  h.taskStore.tasks = [];
  h.props.openTaskRequest = { localId: "b", nonce: 1 };
  await flush();
  await h.view.closeEditor();
  h.taskStore.tasks = [task("a"), task("b")];
  loading.resolve();
  await flush();
  assert.equal(h.view.editorOpen.value, false);
  assert.equal(h.view.editingTask.value, null);
  assert.equal(h.props.openTaskRequest, null);
});
