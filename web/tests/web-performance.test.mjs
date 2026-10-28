import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, descendants } from "./helpers/app-harness.mjs";
import { createSessionHarness, jsonResponse } from "./helpers/session-harness.mjs";
import { normalizeRemoteTaskForOffline } from "../offline-core.js";
import { buildLocalMeta, compareCachedTasks, matchesTaskView } from "../offline-core.js";
import { createTaskWindow } from "../offline-repository.js";

const task = (id, extra = {}) => ({ id, title: `Task ${id}`, status: "open", version: 1, updated_at: "2026-10-26T08:00:00Z", ...extra });

test("refreshing 10000 unchanged cached tasks performs no task writes or clears", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  const tasks = Array.from({ length: 10000 }, (_, index) => task(index + 1));
  for (const item of tasks) h.workspace(1).get("tasks").set(item.id, normalizeRemoteTaskForOffline(item));
  h.context.remoteTasks = tasks;
  await h.run('cacheTasksForOffline(remoteTasks, { view: "", now: new Date() })');
  assert.equal(h.effects.writes.filter((write) => write.storeName === "tasks").length, 0);
});

test("online cursor refresh shows 100 tasks and continues with the next 100", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.view = "";
  const tasks = Array.from({ length: 250 }, (_, index) => task(250 - index));
  h.controls.respond = (request) => {
    if (request.path !== "/tasks") return;
    const cursor = Number(request.url.searchParams.get("cursor_id"));
    const start = cursor ? tasks.findIndex((item) => item.id === cursor) + 1 : 0;
    return jsonResponse(tasks.slice(start, start + 100));
  };
  await h.run("refreshTasks()");
  assert.equal(h.state.tasks.length, 100);
  assert.equal(h.state.cachedTaskTotalCount, 250);
  assert.equal(h.state.cachedTaskListLimited, true);
  assert.equal(h.requests.filter((request) => request.path === "/tasks").length, 3);
  await h.run("increaseOfflineTaskRenderLimit()");
  assert.equal(h.state.tasks.length, 200);
});

test("150 trash tasks are fully paged before reconciliation and continue beyond the first 100", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.view = "trash";
  const tasks = Array.from({ length: 150 }, (_, index) => task(index + 1, { is_deleted: true }));
  for (const item of tasks) h.workspace(1).get("tasks").set(item.id, normalizeRemoteTaskForOffline(item));
  h.controls.respond = (request) => {
    if (request.path !== "/tasks/trash") return;
    const offset = Number(request.url.searchParams.get("offset")) || 0;
    return jsonResponse(tasks.slice(offset, offset + 100));
  };
  await h.run("refreshTasks()");
  assert.equal(h.workspace(1).get("tasks").size, 150);
  assert.equal(h.state.cachedTaskTotalCount, 150);
  assert.equal(h.state.tasks.length, 100);
  assert.deepEqual(h.requests.filter((request) => request.path === "/tasks/trash").map((request) => Number(request.url.searchParams.get("offset"))), [0, 100]);
  await h.run("increaseOfflineTaskRenderLimit()");
  assert.equal(h.state.tasks.length, 150);
});

test("an incomplete trash page sequence preserves every cached trash task", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.view = "trash";
  const tasks = Array.from({ length: 150 }, (_, index) => task(index + 1, { is_deleted: true }));
  for (const item of tasks) h.workspace(1).get("tasks").set(item.id, normalizeRemoteTaskForOffline(item));
  let pages = 0;
  h.controls.respond = (request) => {
    if (request.path !== "/tasks/trash") return;
    if (++pages === 2) throw new TypeError("Trash pagination interrupted");
    return jsonResponse(tasks.slice(0, 100));
  };
  await h.run("refreshTasks()");
  assert.equal(pages, 2);
  assert.equal(h.workspace(1).get("tasks").size, 150);
  assert.equal(h.effects.writes.filter((write) => write.storeName === "tasks").length, 0);
});

test("hitting the trash pagination safety cap cannot reconcile an incomplete snapshot", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.view = "trash";
  const tasks = Array.from({ length: 150 }, (_, index) => task(index + 1, { is_deleted: true }));
  for (const item of tasks) h.workspace(1).get("tasks").set(item.id, normalizeRemoteTaskForOffline(item));
  h.controls.respond = (request) => request.path === "/tasks/trash" ? jsonResponse(tasks.slice(0, 100)) : undefined;
  await assert.rejects(h.run("refreshTasks()"), /pagination exceeded the safety limit/);
  assert.equal(h.workspace(1).get("tasks").size, 150);
  assert.equal(h.effects.writes.filter((write) => write.storeName === "tasks").length, 0);
  assert.equal(h.requests.filter((request) => request.path === "/tasks/trash").length, 50);
});

test("unchanged task renders preserve row identity, expanded notes, and keyboard focus", async () => {
  const h = createAppHarness();
  h.state.tasks = [task(1, { content: "A long note" }), task(2)];
  h.run("renderTasks()");
  const rows = descendants(h.nodes.taskList).filter((node) => node.classList.contains("task-item"));
  const action = descendants(rows[0]).find((node) => node.dataset.taskAction === "complete");
  const expand = descendants(rows[0]).find((node) => node.dataset.taskAction === "view-details");
  await h.dispatch(expand, "click");
  action.focus();
  h.run("renderTasks()");
  assert.ok(h.nodes.taskList.contains(rows[0]), "unchanged rows must remain connected");
  assert.ok(h.nodes.taskList.contains(action), "focused controls must remain connected");
  assert.equal(h.document.activeElement, action);
  assert.equal(expand.getAttribute("aria-expanded"), "true");
});

test("a 10000-task cursor keeps at most 100 entities while matching complete sorting and metadata", () => {
  const tasks = Array.from({ length: 10000 }, (_, index) => task(index + 1, {
    priority: index % 5, project: index % 3 ? "Work" : "Home", tag: `tag-${index % 7}`,
    updated_at: `2026-10-${String(index % 25 + 1).padStart(2, "0")}T08:00:00Z`,
  }));
  const viewContext = { view: "", now: new Date("2026-10-26T12:00:00Z"), timeZone: "Asia/Shanghai" };
  const window = createTaskWindow({ viewContext, limit: 100 });
  tasks.forEach(window.add);
  const result = window.result();
  assert.equal(result.retainedTaskCount, 100);
  assert.equal(result.total, 10000);
  assert.deepEqual(result.tasks.map((task) => task.id), tasks.filter((task) => matchesTaskView(task, viewContext)).sort((a, b) => compareCachedTasks(a, b, viewContext)).slice(0, 100).map((task) => task.id));
  assert.deepEqual(result.meta, buildLocalMeta(tasks, viewContext.now, viewContext));
});

test("filtered reconciliation changes only its scope, preserving pending, conflict, and queue-only work", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  const cached = [task(1, { project: "Work" }), task(2, { project: "Work" }), task(3, { project: "Home" }),
    task(4, { project: "Work", offline_status: "pending:update" }),
    task(5, { project: "Work", offline_status: "conflict" }), task(6, { project: "Work", offline_queue_id: 12 })];
  for (const item of cached) h.workspace(1).get("tasks").set(item.id, { ...normalizeRemoteTaskForOffline(item), offline_status: item.offline_status ?? null, offline_queue_id: item.offline_queue_id ?? null });
  h.context.remoteTasks = [task(1, { project: "Work", title: "Updated" }), task(4, { project: "Work", title: "Cloud" }), task(5, { project: "Work", title: "Cloud" })];
  await h.run('cacheTasksForOffline(remoteTasks, { view: "", project: "Work", now: new Date() })');
  const store = h.workspace(1).get("tasks");
  assert.equal(store.get(1).title, "Updated");
  assert.equal(store.has(2), false);
  assert.equal(store.get(3).project, "Home");
  assert.equal(store.get(4).offline_status, "pending:update");
  assert.equal(store.get(4).title, "Task 4");
  assert.equal(store.get(5).offline_status, "conflict");
  assert.equal(store.get(6).offline_queue_id, 12);
  assert.deepEqual(h.effects.writes.filter((write) => write.storeName === "tasks").map((write) => [write.method, write.key ?? write.record.id]), [["put", 1], ["delete", 2]]);
});

test("one changed row in 100 leaves 99 rows and their controls intact", () => {
  const h = createAppHarness();
  h.state.tasks = Array.from({ length: 100 }, (_, index) => task(index + 1));
  h.run("renderTasks()");
  const original = [...h.nodes.taskList.children];
  h.state.tasks[50] = { ...h.state.tasks[50], title: "Changed" };
  h.run("renderTasks()");
  assert.equal(h.nodes.taskList.children.length, 100);
  assert.equal(h.nodes.taskList.children.filter((row) => original.includes(row)).length, 99);
});

test("offline activation retains complete metadata while rendering a 100-task window", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.view = "";
  for (let id = 1; id <= 250; id += 1) h.workspace(1).get("tasks").set(id, task(id));
  h.controls.respond = (request) => {
    if (request.path === "/auth/me") throw new TypeError("Offline activation");
  };
  assert.equal(await h.run("activateSessionSingleflight()"), true);
  assert.equal(h.state.tasks.length, 100);
  assert.equal(h.state.cachedTaskTotalCount, 250);
  assert.equal(h.state.meta.counts.open, 250);
});

test("updating a focused more-actions summary preserves its control identity", () => {
  const h = createAppHarness();
  h.state.tasks = [task(1)];
  h.run("renderTasks()");
  const more = descendants(h.nodes.taskList).find((node) => node.tagName === "SUMMARY");
  assert.ok(more?.id);
  more.focus();
  h.state.tasks[0] = { ...h.state.tasks[0], title: "Refreshed title" };
  h.run("renderTasks()");
  assert.equal(h.document.activeElement.tagName, "SUMMARY");
  assert.equal(h.document.activeElement.id, more.id);
  assert.ok(h.nodes.taskList.contains(h.document.activeElement));
});

test("offline hydration streams 10000 records into 100 rows without a task getAll", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.offlineMode = true;
  h.state.view = "";
  for (let id = 1; id <= 10000; id += 1) h.workspace(1).get("tasks").set(id, task(id));
  await h.run("hydrateCachedTasks()");
  h.run("renderTasks()");
  assert.equal(h.state.tasks.length, 100);
  assert.equal(h.nodes.taskList.children.length, 100);
  assert.equal(h.state.cachedTaskTotalCount, 10000);
  assert.equal(h.effects.reads.some((read) => read.storeName === "tasks" && read.method === "getAll"), false);
});

test("project-filtered online windows use the project index and only visit matching records", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  for (let id = 1; id <= 1000; id += 1) h.workspace(1).get("tasks").set(id, task(id, { project: id <= 20 ? "Work" : "Home" }));
  const result = await h.run('readCachedTaskView({ view: "", project: "Work", now: new Date() }, false)');
  assert.equal(result.total, 20);
  assert.equal(h.effects.reads.filter((read) => read.method === "cursorValue").length, 20);
  assert.ok(h.effects.reads.some((read) => read.index === "project" && read.key === "Work"));
});

test("an incomplete server cursor snapshot cannot delete cached tasks", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  h.state.view = "";
  for (let id = 1; id <= 200; id += 1) h.workspace(1).get("tasks").set(id, task(id));
  let pages = 0;
  h.controls.respond = (request) => {
    if (request.path !== "/tasks") return;
    if (++pages > 1) throw new TypeError("Connection closed between pages");
    return jsonResponse(Array.from({ length: 100 }, (_, index) => task(index + 1)));
  };
  await h.run("refreshTasks()");
  assert.equal(pages, 2);
  assert.equal(h.workspace(1).get("tasks").size, 200);
  assert.equal(h.effects.writes.filter((write) => write.storeName === "tasks").length, 0);
  assert.equal(h.state.cachedTaskTotalCount, 200);
});

test("superseding a snapshot midway aborts its transaction and rolls back earlier changes", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  for (let id = 1; id <= 3; id += 1) h.workspace(1).get("tasks").set(id, normalizeRemoteTaskForOffline(task(id)));
  h.context.remoteTasks = [task(1, { title: "Superseded update" }), task(2, { title: "Superseded update" })];
  const applied = await h.run('let checks = 0; cacheTasksForOffline(remoteTasks, { view: "" }, { isCurrent: () => ++checks < 3 })');
  assert.equal(applied, false);
  assert.equal(h.workspace(1).get("tasks").get(1).title, "Task 1");
  assert.equal(h.workspace(1).get("tasks").size, 3);
});

test("notifications consume cached tasks through a cursor without materializing the full list", async () => {
  const h = createAppHarness();
  h.state.user = { id: 1 };
  h.state.offlineMode = true;
  h.context.indexedDB = {};
  h.context.window.indexedDB = h.context.indexedDB;
  h.context.Notification = { permission: "granted" };
  h.context.window.Notification = h.context.Notification;
  h.context.notificationTasks = [task(1, { remind_time: new Date(Date.now() + 60000).toISOString() })];
  h.context.scheduled = [];
  h.run(`
    listCachedTasks = async () => { throw new Error("Full task materialization must not be used"); };
    offlineRepository.visitTasks = async (visitor) => notificationTasks.forEach(visitor);
    scheduleTaskNotificationTimer = (task) => scheduled.push(task.id);
    renderNotificationSettings = () => {};
  `);
  await h.run("scheduleTaskNotifications()");
  assert.deepEqual(h.context.scheduled, [1]);
});
