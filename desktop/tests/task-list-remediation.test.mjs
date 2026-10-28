import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadVueComponent } from "./helpers/load-vue-component.mjs";

const require = createRequire(import.meta.url);
const { createSSRApp, h, nextTick, reactive } = require("vue");
const { renderToString } = require("@vue/server-renderer");
const settings = { language: "zh-CN", displayTimeZone: "UTC", desktopDensity: "comfortable", t: key => key };
const empty = { render: () => null };

test("today conflict actions are connected for overdue and upcoming sections, with confirmation", async () => {
  const actions = [];
  const confirmations = [];
  const bindings = [];
  const tasks = [
    { localId: "past", title: "Past conflict", status: "todo", dueTime: "2026-10-09T00:00:00Z", syncStatus: "conflict" },
    { localId: "future", title: "Future conflict", status: "todo", dueTime: "2026-10-10T23:00:00Z", syncStatus: "conflict" },
  ];
  const taskStore = reactive({ todayTasks: tasks, timelineNow: new Date("2026-10-10T08:00:00Z"),
    resolveConflictUseServer: async task => actions.push(["server", task.localId]),
    forceOverwriteServer: async task => actions.push(["local", task.localId]),
  });
  const row = { setup: (_, { attrs }) => { bindings.push(attrs); return () => null; } };
  const component = loadVueComponent("renderer/views/TodayView.vue", {
    "../components/AppToast.vue": empty, "../components/ConfirmDialog.vue": empty,
    "../components/EditorDrawer.vue": empty, "../components/TaskEditor.vue": empty,
    "../components/WorkspaceQuickAdd.vue": empty, "../components/TaskItem.vue": row, "../components/TaskListSection.vue": row,
    "../stores/settings": { useSettingsStore: () => settings },
    "../stores/auth": { useAuthStore: () => ({ workspaceKey: "a" }) },
    "../stores/capture": { useCaptureStore: () => ({ draft: {} }) }, "../stores/task": { useTaskStore: () => taskStore },
    "../composables/useConfirmDialog": { useConfirmDialog: () => ({ confirmDialog: {}, requestConfirmation: async options => { confirmations.push(options); return true; } }) },
  }, { window: { setTimeout: () => 1, clearTimeout() {} } });
  await renderToString(createSSRApp(component));
  assert.equal(bindings.length, 2);
  for (const [index, binding] of bindings.entries()) {
    assert.equal(typeof binding.onUseServer, "function", "the visible server-recovery button needs a handler");
    assert.equal(typeof binding.onOverwriteServer, "function", "the visible local-recovery button needs a handler");
    await binding.onUseServer(tasks[index]);
    await binding.onOverwriteServer(tasks[index]);
  }
  assert.deepEqual(actions, [["server", "past"], ["local", "past"], ["server", "future"], ["local", "future"]]);
  assert.equal(confirmations.length, 4);
  assert.ok(confirmations.every(item => item.danger));
});

test("today conflict confirmation cannot apply an old workspace task after switching accounts", async () => {
  const actions = [];
  const bindings = [];
  const auth = { workspaceKey: "workspace-a" };
  const task = { localId: "conflict", title: "Conflict", status: "todo", syncStatus: "conflict" };
  const row = { setup: (_, { attrs }) => { bindings.push(attrs); return () => null; } };
  const component = loadVueComponent("renderer/views/TodayView.vue", {
    "../components/AppToast.vue": empty, "../components/ConfirmDialog.vue": empty,
    "../components/EditorDrawer.vue": empty, "../components/TaskEditor.vue": empty,
    "../components/WorkspaceQuickAdd.vue": empty, "../components/TaskListSection.vue": row,
    "../stores/settings": { useSettingsStore: () => settings },
    "../stores/auth": { useAuthStore: () => auth },
    "../stores/capture": { useCaptureStore: () => ({ draft: {} }) },
    "../stores/task": { useTaskStore: () => ({ todayTasks: [task], timelineNow: new Date("2026-10-10T08:00:00Z"),
      resolveConflictUseServer: async () => actions.push("server"), forceOverwriteServer: async () => actions.push("local"),
    }) },
    "../composables/useConfirmDialog": { useConfirmDialog: () => ({ confirmDialog: {}, requestConfirmation: async () => {
      auth.workspaceKey = "workspace-b";
      return true;
    } }) },
  }, { window: { setTimeout: () => 1, clearTimeout() {} } });
  await renderToString(createSSRApp(component));
  for (const action of ["onUseServer", "onOverwriteServer"]) {
    auth.workspaceKey = "workspace-a";
    await bindings[0][action](task);
  }
  assert.deepEqual(actions, []);
});

test("a large task section mounts only a visible window while exposing its complete count", async () => {
  const tasks = Array.from({ length: 2500 }, (_, index) => ({ localId: `row-${index}`, title: `Task ${index}`, status: "todo" }));
  let rows = 0;
  const row = { props: ["task"], setup: props => { rows++; return () => h("article", { class: "test-task" }, props.task.title); } };
  const component = loadVueComponent("renderer/components/TaskListSection.vue", {
    "./TaskItem.vue": row,
    "../stores/settings": { useSettingsStore: () => settings },
  }, { window: { innerHeight: 800 } });
  const html = await renderToString(createSSRApp(component, { tasks, title: "Tasks", selectedTaskIds: new Set() }));
  assert.ok(rows > 0 && rows < 60, `mounted ${rows} rows for one viewport`);
  assert.ok(html.includes("2500"), "the complete count must remain available");
});

test("closed task menus do not mount their secondary action controls", async () => {
  const task = { localId: "task-a", title: "A task", status: "todo", syncStatus: "synced", checklistJson: "[]", priority: 0 };
  const component = loadVueComponent("renderer/components/TaskItem.vue", {
    "../stores/settings": { useSettingsStore: () => settings },
    "../stores/task": { useTaskStore: () => ({ timelineNow: new Date() }) },
    "lucide-vue-next": { MoreHorizontal: empty },
  }, { window: {} });
  const html = await renderToString(createSSRApp(component, { task }));
  assert.ok(!html.includes('class="task-menu-panel"'), "closed action panels should be absent from the rendered tree");
});
