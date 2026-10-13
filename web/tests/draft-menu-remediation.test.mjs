import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, createDeferred, descendants, nextTurn } from "./helpers/app-harness.mjs";
import { buildTaskDraftStorageKey } from "../offline-core.js";

const prefix = "taskbridge.web.v1";
const task = (id, title = `Task ${id}`) => ({ id, title, content: "", version: 3, status: "open", priority: 0, list_type: "inbox", checklist: [], is_deleted: false });

function editorHarness(options) {
  const h = createAppHarness(options);
  h.state.user = { id: 71, username: "draft-fixture" };
  h.state.offlineMode = true;
  h.state.view = "";
  h.state.tasks = [task(1), task(2)];
  h.nodes.settingsSupportPanel.hidden = true;
  h.nodes.confirmDialog.hidden = true;
  const fields = ["taskTitle", "taskContent", "taskProject", "taskTag", "taskPriority", "taskListType", "taskPlannedDate", "taskDueTime", "taskRemindTime", "taskRepeatRule", "taskChecklist", "taskTemplateName"];
  h.nodes.taskForm.reset = () => {
    for (const field of fields) h.nodes[field].value = "";
    h.nodes.taskIsTemplate.checked = false;
  };
  h.nodes.taskForm.reset();
  h.nodes.taskPriority.value = "0";
  h.nodes.taskListType.value = "inbox";
  h.nodes.taskIsTemplate.checked = false;
  // Network refresh is outside these editor tests; form, storage and request construction are real.
  h.run("refreshTasks = async () => {}; refreshMeta = async () => {}; render = () => {}; bindEvents();");
  return h;
}

async function fillTitle(h, value, quick = false) {
  h.nodes[quick ? "quickTaskTitle" : "taskTitle"].value = value;
  await h.dispatch(quick ? h.nodes.quickTaskTitle : h.nodes.taskForm, "input");
}

function online(h, respond) {
  h.state.offlineMode = false;
  h.state.accessToken = "fixture-access";
  h.state.refreshToken = "fixture-refresh";
  const requests = [];
  h.context.fetch = async (url, options) => {
    const request = { url, method: options.method, body: JSON.parse(options.body || "null") };
    requests.push(request);
    return respond ? respond(request) : response({ ...request.body, id: 100, version: 1 });
  };
  return requests;
}

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) };
}

test("switching and reopening tasks restores each unsaved edit, including metadata", async () => {
  const h = editorHarness();
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "A still unsaved");
  h.nodes.taskContent.value = "Private long note\nSecond line";
  h.nodes.taskTag.value = "keep-A";
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[1])");
  await fillTitle(h, "B still unsaved");
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[0])");
  assert.equal(h.nodes.taskTitle.value, "A still unsaved");
  assert.equal(h.nodes.taskContent.value, "Private long note\nSecond line");
  assert.equal(h.nodes.taskTag.value, "keep-A");
  h.run("beginTaskEdit(state.tasks[1])");
  assert.equal(h.nodes.taskTitle.value, "B still unsaved");
});

test("quick detail always enters the shared creation draft after editing an existing task", async () => {
  const h = editorHarness();
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Existing edit");
  h.run("closeTaskEditor()");
  await fillTitle(h, "New task #launch !2", true);
  await h.dispatch(h.nodes.openTaskCreateButton, "click");
  assert.equal(h.state.editingTaskId, null);
  assert.equal(h.nodes.taskTitle.value, "New task #launch !2");
  h.nodes.taskContent.value = "Details survive both capture paths";
  await h.dispatch(h.nodes.taskForm, "input");
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[0])");
  assert.equal(h.nodes.taskTitle.value, "Existing edit");
  h.run("closeTaskEditor()");
  await h.dispatch(h.nodes.openTaskCreateButton, "click");
  assert.equal(h.nodes.taskTitle.value, "New task #launch !2");
  assert.equal(h.nodes.taskContent.value, "Details survive both capture paths");
});

test("quick creation title persists through account exit and returns only to its owner", async () => {
  const h = editorHarness();
  await fillTitle(h, "Account A new task", true);
  h.run("clearSession()");
  assert.equal(h.nodes.quickTaskTitle.value, "");
  h.state.user = { id: 72 };
  h.state.offlineMode = true;
  h.run("restoreTaskDraft()");
  assert.equal(h.nodes.taskTitle.value, "");
  assert.equal(h.nodes.quickTaskTitle.value, "");
  await fillTitle(h, "Account B new task", true);
  h.run("clearSession()");
  h.state.user = { id: 71 };
  h.state.offlineMode = true;
  h.run("restoreTaskDraft()");
  assert.equal(h.nodes.quickTaskTitle.value, "Account A new task");
  assert.equal(h.nodes.taskTitle.value, "Account A new task");
});

test("direct account replacement saves old edits and clears its fields before new activation", async () => {
  const h = editorHarness();
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Owner A only");
  h.run('persistTokens({ access_token: "access-B", refresh_token: "refresh-B", user: { id: 72 } })');
  assert.equal(h.nodes.taskTitle.value, "");
  assert.equal(h.nodes.quickTaskTitle.value, "");
  assert.equal(h.state.editorOpen, false);
  h.run("restoreTaskDraft()");
  assert.equal(h.state.editingTaskId, null);
  h.run("clearSession()");
  h.state.user = { id: 71 };
  h.state.offlineMode = true;
  h.run("restoreTaskDraft()");
  assert.equal(h.nodes.taskTitle.value, "Owner A only");
});

test("drafts on another origin do not enter the active workspace", async () => {
  const h = editorHarness();
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Original server only");
  h.run("clearSession()");
  h.state.apiBaseUrl = "https://other.taskbridge.test/api/v1";
  h.state.user = { id: 71 };
  h.state.offlineMode = true;
  h.run("restoreTaskDraft()");
  assert.equal(h.nodes.taskTitle.value, "");
  h.run("clearSession()");
  h.state.apiBaseUrl = "https://taskbridge.test/api/v1";
  h.state.user = { id: 71 };
  h.state.offlineMode = true;
  h.run("restoreTaskDraft()");
  assert.equal(h.nodes.taskTitle.value, "Original server only");
});

for (const legacyKind of ["origin", "user", "workspace"]) {
  test(`legacy ${legacyKind} single draft migrates without being replaced by the next task`, async () => {
    const base = buildTaskDraftStorageKey(prefix, "https://taskbridge.test/api/v1", 71);
    const legacyKey = legacyKind === "origin" ? base : legacyKind === "user" ? `${prefix}.taskDraft.71` : `${prefix}.taskDraft.server.https%3A%2F%2Ftaskbridge.test%2Fapi%2Fv1.user.71`;
    const h = editorHarness({ session: { [legacyKey]: JSON.stringify({ editingTaskId: 1, editingTaskVersion: 2, title: "Legacy edit", content: "kept", list_type: "inbox" }) } });
    assert.equal(h.run("restoreTaskDraft()"), true);
    assert.equal(h.state.editingTaskVersion, 2);
    h.run("beginTaskEdit(state.tasks[1]); beginTaskEdit(state.tasks[0])");
    assert.equal(h.nodes.taskTitle.value, "Legacy edit");
    assert.equal(h.nodes.taskContent.value, "kept");
    assert.equal(h.context.localStorage.getItem(base), null);
  });
}

test("an edit outside the current task filter keeps its identity during restoration", async () => {
  const h = editorHarness();
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Filtered edit");
  h.run("closeTaskEditor()");
  h.state.tasks = [task(2)];
  h.run("restoreTaskDraft()");
  assert.equal(h.state.editingTaskId, 1);
  assert.equal(h.nodes.taskTitle.value, "Filtered edit");
});

test("quick submission retains detailed metadata and clears only the successfully created draft", async () => {
  const h = editorHarness();
  const requests = online(h);
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Keep existing edit");
  h.run("closeTaskEditor()");
  await fillTitle(h, "Creation title", true);
  await h.dispatch(h.nodes.openTaskCreateButton, "click");
  h.nodes.taskContent.value = "Detailed note";
  h.nodes.taskProject.value = "Shared project";
  h.nodes.taskPriority.value = "2";
  h.nodes.taskChecklist.value = "First step\nSecond step";
  await h.dispatch(h.nodes.taskForm, "input");
  h.run("closeTaskEditor()");
  await h.run("submitQuickTask()");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.title, "Creation title");
  assert.equal(requests[0].body.content, "Detailed note");
  assert.equal(requests[0].body.project, "Shared project");
  assert.equal(requests[0].body.priority, 2);
  assert.equal(requests[0].body.checklist.length, 2);
  assert.equal(h.nodes.quickTaskTitle.value, "");
  h.run("beginTaskEdit(state.tasks[0])");
  assert.equal(h.nodes.taskTitle.value, "Keep existing edit");
  h.run("closeTaskEditor(); openTaskCreatePanel()");
  assert.equal(h.nodes.taskTitle.value, "");
});

test("failed creation keeps text and the same request identity for a later successful retry", async () => {
  const h = editorHarness();
  let failures = true;
  const requests = online(h, (request) => failures ? response({ detail: "Try later" }, 422) : response({ ...request.body, id: 100, version: 1 }));
  await fillTitle(h, "Retry only once", true);
  await h.dispatch(h.nodes.openTaskCreateButton, "click");
  await h.dispatch(h.nodes.taskForm, "submit");
  assert.equal(h.nodes.taskTitle.value, "Retry only once");
  h.run("closeTaskEditor(); openTaskCreatePanel()");
  assert.equal(h.nodes.taskTitle.value, "Retry only once");
  failures = false;
  await h.dispatch(h.nodes.taskForm, "submit");
  assert.equal(requests.length, 2);
  assert.ok(requests[0].body.client_request_id);
  assert.equal(requests[0].body.client_request_id, requests[1].body.client_request_id);
  assert.equal(h.nodes.quickTaskTitle.value, "");
  assert.equal(h.state.editorOpen, false);
  h.run("openTaskCreatePanel()");
  assert.equal(h.nodes.taskTitle.value, "");
});

test("overlapping quick and detailed submits create a single task", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  const requests = online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 100 }); });
  await fillTitle(h, "One creation", true);
  await h.dispatch(h.nodes.openTaskCreateButton, "click");
  await fillTitle(h, "One creation");
  const quick = h.run("submitQuickTask()");
  await nextTurn();
  const detailed = h.dispatch(h.nodes.taskForm, "submit");
  pending.resolve();
  await Promise.all([quick, detailed]);
  assert.equal(requests.length, 1);
  assert.equal(h.nodes.taskTitle.value, "");
  assert.equal(h.nodes.quickTaskTitle.value, "");
});

test("saving an edit removes that draft while preserving the creation draft and other edits", async () => {
  const h = editorHarness();
  online(h);
  await fillTitle(h, "Pending new task", true);
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Saved A");
  h.run("beginTaskEdit(state.tasks[1])");
  await fillTitle(h, "Unsaved B");
  h.run("beginTaskEdit(state.tasks[0])");
  await h.dispatch(h.nodes.taskForm, "submit");
  h.run("beginTaskEdit(state.tasks[1])");
  assert.equal(h.nodes.taskTitle.value, "Unsaved B");
  h.run("closeTaskEditor(); openTaskCreatePanel()");
  assert.equal(h.nodes.taskTitle.value, "Pending new task");
});

function renderMenu(h, id) {
  h.context.menuTask = task(id);
  const item = h.run("renderTaskItem(menuTask)");
  h.nodes.taskList.appendChild(item);
  const menu = descendants(item).find((node) => node.classList.contains("task-action-menu"));
  return { item, menu, trigger: menu.children[0] };
}

async function openMenu(h, menu) {
  menu.open = true;
  await h.dispatch(menu, "toggle");
  h.flushAnimationFrames();
}

test("task menus mount actions on demand and only one remains open", async () => {
  const h = editorHarness();
  const a = renderMenu(h, 1);
  const b = renderMenu(h, 2);
  assert.equal(descendants(a.menu).filter((node) => node.dataset.taskAction).length, 0);
  await openMenu(h, a.menu);
  assert.ok(descendants(a.menu).some((node) => node.dataset.taskAction === "edit"));
  await openMenu(h, b.menu);
  assert.equal(a.menu.open, false);
  assert.equal(descendants(a.menu).filter((node) => node.dataset.taskAction).length, 0);
  assert.equal(b.menu.open, true);
});

test("Escape closes the task menu and returns focus to its own trigger", async () => {
  const h = editorHarness();
  const { menu, trigger } = renderMenu(h, 1);
  await openMenu(h, menu);
  descendants(menu).find((node) => node.dataset.taskAction)?.focus();
  const event = await h.dispatch(h.document, "keydown", { key: "Escape" });
  h.flushAnimationFrames();
  assert.equal(menu.open, false);
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.document.activeElement, trigger);
  assert.equal(descendants(menu).filter((node) => node.dataset.taskAction).length, 0);
});

test("outside interaction closes task menus and leaves focus with the clicked control", async () => {
  const h = editorHarness();
  const { menu } = renderMenu(h, 1);
  await openMenu(h, menu);
  await h.dispatch(h.document, "pointerdown", { target: h.nodes.quickTaskTitle });
  h.nodes.quickTaskTitle.focus();
  await h.dispatch(h.document, "click", { target: h.nodes.quickTaskTitle });
  h.flushAnimationFrames();
  assert.equal(menu.open, false);
  assert.equal(h.document.activeElement, h.nodes.quickTaskTitle);
});

test("a long task keeps completion next to its title and exposes the complete note", async () => {
  const h = editorHarness();
  h.context.longTask = { ...task(3), content: Array.from({ length: 35 }, (_, index) => `Line ${index + 1}`).join("\n") };
  const item = h.run("renderTaskItem(longTask)");
  const heading = descendants(item).find((node) => node.tagName === "H3");
  const complete = descendants(item).find((node) => node.dataset.taskAction === "complete");
  assert.ok(complete.closest(".task-item__title") === heading.parentElement, "completion must stay inside the heading row");
  const details = descendants(item).find((node) => node.dataset.taskAction === "view-details");
  assert.ok(details, "long notes need an explicit full-details entry");
  const content = descendants(item).find((node) => node.classList.contains("task-item__content"));
  assert.equal(content.textContent, h.context.longTask.content);
});

test("submission finishing after sign-out does not clear another account's creation draft", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 100 }); });
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "A in flight");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("clearSession()");
  h.state.user = { id: 72 };
  h.state.offlineMode = true;
  h.state.loading = false;
  h.run("restoreTaskDraft(); openTaskCreatePanel()");
  await fillTitle(h, "B must remain");
  pending.resolve();
  await saving;
  assert.equal(h.nodes.taskTitle.value, "B must remain");
  assert.equal(h.nodes.quickTaskTitle.value, "B must remain");
  assert.equal(h.state.editorOpen, true);
  assert.equal(h.run("readTaskDraft(null).title"), "B must remain");
});

test("network failure after account replacement cannot queue the old account's task locally", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  online(h, async () => { await pending.promise; throw new TypeError("Failed to fetch"); });
  h.context.queuedOwners = [];
  h.run("createTaskOffline = async () => queuedOwners.push(getCurrentUserId())");
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "A in flight");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("clearSession()");
  h.state.user = { id: 72 };
  h.state.offlineMode = true;
  h.state.loading = false;
  h.run("restoreTaskDraft()");
  pending.resolve();
  await saving;
  assert.deepEqual(h.context.queuedOwners, []);
});

test("uploading a locally created task migrates its still-unsaved edit to the server ID", async () => {
  const h = editorHarness();
  h.state.tasks = [task(-1)];
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Keep edit during upload");
  h.run("closeTaskEditor()");
  online(h);
  h.run("deleteCachedTask = async () => {}; putCachedTask = async () => {}; deleteOfflineMutation = async () => {}; listOfflineQueue = async () => [];");
  await h.run('processOfflineMutationRecord({ action: "create", task_id: -1, offline_queue_id: 7, payload: { title: "Uploaded original", client_request_id: "fixture-create" } })');
  h.state.tasks = [task(100, "Uploaded original")];
  h.run("beginTaskEdit(state.tasks[0])");
  assert.equal(h.state.editingTaskId, 100);
  assert.equal(h.nodes.taskTitle.value, "Keep edit during upload");
  assert.equal(h.state.editingTaskVersion, 1);
});

test("explicit tomorrow syntax wins over today's default in both capture paths", async () => {
  const h = editorHarness();
  h.state.view = "today";
  const expected = h.run('parseWebQuickTask("Write report tomorrow").planned_date');
  await fillTitle(h, "Write report tomorrow", true);
  await h.dispatch(h.nodes.openTaskCreateButton, "click");
  const detailed = h.run("readTaskPayload()");
  const quick = h.run("readQuickTaskPayload()");
  assert.equal(detailed.planned_date, expected);
  assert.equal(quick.planned_date, expected);
  assert.equal(detailed.list_type, "inbox");
  assert.equal(quick.list_type, "inbox");
});

test("reloading the client restores creation and edit drafts without conflating them", async () => {
  const h = editorHarness();
  await fillTitle(h, "Restored creation", true);
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Restored edit");
  const key = h.run("taskDraftSessionKey()");
  const reloaded = editorHarness({ session: { [key]: h.context.sessionStorage.getItem(key) } });
  reloaded.run("restoreTaskDraft()");
  assert.equal(reloaded.nodes.taskTitle.value, "Restored edit");
  assert.equal(reloaded.nodes.quickTaskTitle.value, "Restored creation");
  reloaded.run("closeTaskEditor(); openTaskCreatePanel()");
  assert.equal(reloaded.state.editingTaskId, null);
  assert.equal(reloaded.nodes.taskTitle.value, "Restored creation");
});

test("keyboard navigation stays in the open menu and selecting edit returns to its trigger after closing", async () => {
  const h = editorHarness();
  const { menu, trigger } = renderMenu(h, 1);
  await h.dispatch(trigger, "keydown", { key: "ArrowDown" });
  let actions = descendants(menu).filter((node) => node.dataset.taskAction);
  assert.equal(h.document.activeElement, actions[0]);
  await h.dispatch(h.document, "keydown", { key: "End" });
  assert.equal(h.document.activeElement, actions.at(-1));
  await h.dispatch(h.document, "keydown", { key: "ArrowDown" });
  assert.equal(h.document.activeElement, actions[0]);
  const edit = actions.find((node) => node.dataset.taskAction === "edit");
  await h.dispatch(h.nodes.taskList, "click", { target: edit });
  h.flushAnimationFrames();
  assert.equal(menu.open, false);
  assert.equal(h.state.editingTaskId, 1);
  assert.equal(h.document.activeElement, h.nodes.taskTitle);
  h.run("closeTaskEditor()");
  h.flushAnimationFrames();
  assert.equal(h.document.activeElement, trigger);
});

test("menu placement flips above a low trigger and clamps its horizontal edge", async () => {
  const h = editorHarness();
  const { menu, trigger } = renderMenu(h, 1);
  trigger.rect = { top: 748, bottom: 792, left: 1190, right: 1272, width: 82, height: 44 };
  await openMenu(h, menu);
  const content = descendants(menu).find((node) => node.classList.contains("task-action-menu__items"));
  assert.equal(content.dataset.placement, "top");
  assert.ok(Number.parseFloat(content.style.top) + content.getBoundingClientRect().height <= trigger.rect.top);
  assert.ok(Number.parseFloat(content.style.left) + content.getBoundingClientRect().width <= 1272);
});

test("expanding and collapsing a task note preserves the complete text", async () => {
  const h = editorHarness();
  const longNote = "Visible first line\n" + "Remaining detail\n".repeat(30);
  h.context.longTask = { ...task(3), content: longNote };
  const item = h.run("renderTaskItem(longTask)");
  const button = descendants(item).find((node) => node.dataset.taskAction === "view-details");
  const content = descendants(item).find((node) => node.classList.contains("task-item__content"));
  assert.equal(button.getAttribute("aria-expanded"), "false");
  await h.dispatch(button, "click");
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(content.textContent, longNote);
  await h.dispatch(button, "click");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(content.textContent, longNote);
});

test("a summary ArrowDown event is handled once when it bubbles to the document", async () => {
  const h = editorHarness();
  const { menu, trigger } = renderMenu(h, 1);
  const event = await h.dispatch(trigger, "keydown", { key: "ArrowDown" });
  await h.dispatch(h.document, "keydown", event);
  const actions = descendants(menu).filter((node) => node.dataset.taskAction);
  assert.equal(h.document.activeElement, actions[0]);
});

test("signing out during submission immediately releases the login controls", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 100 }); });
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "Pending A");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("clearSession()");
  const canSignIn = !h.state.loading && !h.nodes.authSubmitButton.disabled;
  pending.resolve();
  await saving;
  assert.equal(canSignIn, true);
});

test("a successful save clears its submitted edit without discarding a different opened draft", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 1, version: 4 }); });
  h.run("beginTaskEdit(state.tasks[1])");
  await fillTitle(h, "Keep pending B");
  h.run("beginTaskEdit(state.tasks[0])");
  await fillTitle(h, "Saving A");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[1])");
  pending.resolve();
  await saving;
  assert.equal(h.state.editingTaskId, 2);
  assert.equal(h.nodes.taskTitle.value, "Keep pending B");
  assert.equal(h.state.editorOpen, true);
  assert.equal(h.run("readTaskDraft(1)"), null);
});

test("submission temporarily disables editable fields so late keystrokes cannot be discarded", async () => {
  const h = editorHarness();
  h.nodes.taskTitle.tagName = 'INPUT';
  h.nodes.taskForm.appendChild(h.nodes.taskTitle);
  const pending = createDeferred();
  online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 100 }); });
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "Saving once");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  const frozen = h.nodes.taskTitle.disabled;
  pending.resolve();
  await saving;
  assert.equal(frozen, true);
  assert.equal(h.nodes.taskTitle.disabled, false);
});

test("creation finishing while B is open clears its quick title and cannot be submitted twice", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  const requests = online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 100, version: 1 }); });
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "Already created A");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[1])");
  pending.resolve();
  await saving;
  assert.equal(h.state.editingTaskId, 2);
  assert.equal(h.nodes.taskTitle.value, "Task 2");
  assert.equal(h.nodes.quickTaskTitle.value, "");
  assert.equal(h.run("readTaskDraft(null)"), null);
  h.run("closeTaskEditor()");
  await h.run("submitQuickTask()");
  assert.equal(requests.length, 1);
});

test("creation completion preserves a newer quick draft C and gives C its own request identity", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  const requests = online(h, async (request) => { await pending.promise; return response({ ...request.body, id: 100, version: 1 }); });
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "Submitted creation A");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[1])");
  await fillTitle(h, "Newer creation C", true);
  pending.resolve();
  await saving;
  assert.equal(h.state.editingTaskId, 2);
  assert.equal(h.nodes.quickTaskTitle.value, "Newer creation C");
  assert.equal(h.run("readTaskDraft(null)?.title"), "Newer creation C");
  h.run("closeTaskEditor()");
  await h.run("submitQuickTask()");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.title, "Newer creation C");
  assert.notEqual(requests[0].body.client_request_id, requests[1].body.client_request_id);
});

for (const status of [422, 409]) {
  test(`late HTTP ${status} belongs to submitted A and does not overwrite B's editor message`, async () => {
    const h = editorHarness();
    const pending = createDeferred();
    online(h, async () => { await pending.promise; return response({ detail: status === 409 ? "version conflict" : "Rejected A" }, status); });
    h.run("beginTaskEdit(state.tasks[0])");
    await fillTitle(h, "Rejected A draft");
    const saving = h.dispatch(h.nodes.taskForm, "submit");
    await nextTurn();
    h.run("closeTaskEditor(); beginTaskEdit(state.tasks[1])");
    const before = h.nodes.taskMessage.textContent;
    pending.resolve();
    await saving;
    assert.equal(h.state.editingTaskId, 2);
    assert.equal(h.nodes.taskMessage.textContent, before);
    assert.equal(h.run("readTaskDraft(1).title"), "Rejected A draft");
    h.run("closeTaskEditor(); beginTaskEdit(state.tasks[0])");
    assert.match(h.nodes.taskMessage.textContent, status === 409 ? /refresh|another device/i : /failed/i);
    await fillTitle(h, "Retry revised A");
    assert.doesNotMatch(h.nodes.taskMessage.textContent, /failed|refresh.*saving/i);
  });
}

test("a rejected creation shows its error when reopened without contaminating B", async () => {
  const h = editorHarness();
  const pending = createDeferred();
  online(h, async () => { await pending.promise; return response({ detail: "Rejected creation" }, 422); });
  h.run("openTaskCreatePanel()");
  await fillTitle(h, "Rejected creation draft");
  const saving = h.dispatch(h.nodes.taskForm, "submit");
  await nextTurn();
  h.run("closeTaskEditor(); beginTaskEdit(state.tasks[1])");
  const before = h.nodes.taskMessage.textContent;
  pending.resolve();
  await saving;
  assert.equal(h.nodes.taskMessage.textContent, before);
  h.run("closeTaskEditor(); openTaskCreatePanel()");
  assert.equal(h.nodes.taskTitle.value, "Rejected creation draft");
  assert.match(h.nodes.taskMessage.textContent, /failed/i);
});
