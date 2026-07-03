import assert from "node:assert/strict";

const {
  applyOfflineTaskAction,
  buildLocalMeta,
  compareCachedTasks,
  makeOfflineTask,
  matchesTaskView,
  normalizeRemoteTaskForOffline,
} = await import("../web/offline-core.js");

const fixedNow = new Date("2026-06-03T10:00:00.000Z");
const payload = {
  title: "Write offline regression",
  content: "Prove behavior instead of checking strings",
  project: "quality",
  tag: "web",
  priority: 4,
  list_type: "inbox",
  planned_date: "2026-06-03",
  due_time: "2026-06-03T12:00:00.000Z",
};

const created = makeOfflineTask(payload, {
  now: fixedNow,
  random: () => 0,
  nowMs: () => fixedNow.getTime(),
});

assert.equal(created.title, payload.title);
assert.equal(created.status, "open");
assert.equal(created.is_deleted, false);
assert.equal(created.version, 0);
assert.equal(created.offline_status, "pending:create");
assert.ok(created.id < 0, "offline-created tasks must use local negative ids");

const importedCompleted = makeOfflineTask(
  {
    ...payload,
    status: "completed",
    completed_at: "2026-06-03T13:00:00.000Z",
    is_deleted: true,
  },
  {
    now: fixedNow,
    random: () => 0.1,
    nowMs: () => fixedNow.getTime(),
  },
);
assert.equal(importedCompleted.status, "completed");
assert.equal(importedCompleted.completed_at, "2026-06-03T13:00:00.000Z");
assert.equal(importedCompleted.is_deleted, true);

const completed = applyOfflineTaskAction(created, "complete", 7, fixedNow);
assert.equal(completed.status, "completed");
assert.equal(completed.completed_at, fixedNow.toISOString());
assert.equal(completed.offline_status, "pending:complete");
assert.equal(completed.offline_queue_id, 7);
assert.equal(completed.version, 1);

const deleted = applyOfflineTaskAction(completed, "delete", 8, fixedNow);
assert.equal(deleted.is_deleted, true);
assert.equal(deleted.offline_status, "pending:delete");

const restored = applyOfflineTaskAction(deleted, "restore", 9, fixedNow);
assert.equal(restored.is_deleted, false);
assert.equal(restored.offline_status, "pending:restore");

const remote = normalizeRemoteTaskForOffline({
  id: 42,
  title: "Remote task",
  status: "open",
  offline_status: "conflict",
  offline_queue_id: 3,
  offline_error: "old error",
});
assert.equal(remote.offline_status, null);
assert.equal(remote.offline_queue_id, null);
assert.equal(remote.offline_error, null);

const conflict = {
  ...created,
  id: -2,
  title: "Conflict task",
  planned_date: "2026-06-04",
  due_time: null,
  offline_status: "conflict",
  offline_queue_id: 10,
};
const overdue = {
  ...remote,
  id: 43,
  title: "Late task",
  due_time: "2026-06-02T22:00:00.000Z",
  updated_at: "2026-06-02T08:00:00.000Z",
};
const trash = {
  ...remote,
  id: 44,
  title: "Deleted task",
  is_deleted: true,
  updated_at: "2026-06-01T08:00:00.000Z",
};
const tasks = [created, conflict, overdue, trash];

assert.equal(matchesTaskView(created, { view: "today", search: "regression", now: fixedNow }), true);
assert.equal(matchesTaskView(created, { view: "pending", search: "", now: fixedNow }), true);
assert.equal(matchesTaskView(conflict, { view: "conflict", search: "", now: fixedNow }), true);
assert.equal(matchesTaskView(overdue, { view: "overdue", search: "late", now: fixedNow }), true);
assert.equal(matchesTaskView(trash, { view: "trash", search: "", now: fixedNow }), true);
assert.equal(matchesTaskView(trash, { view: "", search: "", now: fixedNow }), false);

const meta = buildLocalMeta(tasks, fixedNow);
assert.deepEqual(meta.counts, {
  open: 3,
  today: 2,
  inbox: 3,
  overdue: 1,
  high: 2,
  pending: 2,
  conflict: 1,
  completed: 0,
  trash: 1,
});

const sorted = [...tasks].sort(compareCachedTasks);
assert.deepEqual(
  sorted.slice(0, 2).map((task) => task.id),
  [created.id, conflict.id],
  "pending offline tasks must stay at the top of cached lists",
);

console.log("web offline core behavior check passed");
