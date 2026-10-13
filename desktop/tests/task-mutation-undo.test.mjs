import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { createPinia } = require("pinia");
const desktopRoot = resolve(import.meta.dirname, "..");
const clock = await loadTsModule("shared/quick-add-parser.ts");

const fixedNow = "2026-05-20T08:00:00.000Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return Date.parse(fixedNow); }
}

async function loadModule(path, dependencies = {}, globals = {}) {
  const source = await readFile(resolve(desktopRoot, path), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, crypto, Date: FixedDate, Intl, Promise,
    require: (name) => dependencies[name] ?? require(name),
    ...globals,
  }, { filename: path });
  return module.exports;
}

const taskOrder = await loadModule("src/utils/task-order.ts", { "../../shared/quick-add-parser": clock });

const policy = await loadModule("shared/task-mutation-policy.ts", { "./quick-add-parser": clock });

function task(localId, overrides = {}) {
  return {
    localId, serverId: 10, title: `Task ${localId}`, content: null, status: "todo", priority: 0,
    tag: "tag", project: "project", listType: "inbox", dueTime: null, remindTime: null,
    repeatRule: null, plannedDate: null, completedAt: null, snoozedUntil: null,
    parentServerId: null, checklistJson: "[]", isTemplate: false, templateName: null,
    sortOrder: 3, version: 2, isDeleted: false, syncStatus: "synced",
    createdAt: "2026-05-01T08:00:00.000Z", updatedAt: "2026-05-19T08:00:00.000Z",
    lastSyncAt: "2026-05-19T08:00:00.000Z", conflictServerJson: null, conflictLocalJson: null,
    ...overrides,
  };
}

function plain(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

async function harness(initial, options = {}) {
  const auth = { workspaceKey: "workspace-a" };
  const settings = { displayTimeZone: options.timeZone ?? "UTC" };
  const workspaces = new Map([[auth.workspaceKey, new Map(initial.map((item) => [item.localId, structuredClone(item)]))]]);
  const queues = new Map();
  const faults = { save: new Set(), queue: new Set(), removeQueue: new Set(), read: null, purge: new Set(), reload: false, allQueues: false, byServer: null, afterCommit: null };
  const stats = { reloads: 0, todayLoads: 0, syncs: 0, saves: [], queued: [], commits: [] };
  let sequence = 0;
  const records = () => workspaces.get(auth.workspaceKey) ?? new Map();
  const nowIso = () => new Date(Date.parse(fixedNow) + ++sequence).toISOString();
  const saveTask = async (item, expectedWorkspaceKey) => {
    if (expectedWorkspaceKey !== undefined && expectedWorkspaceKey !== auth.workspaceKey) throw new Error("Workspace changed");
    if (faults.save.has(item.localId)) throw new Error("save failed");
    records().set(item.localId, structuredClone(item));
    stats.saves.push(structuredClone(item));
    return structuredClone(item);
  };
  const getTask = async (id) => {
    const found = structuredClone(records().get(id) ?? null);
    if (faults.read) await faults.read(id);
    return found;
  };
  const enqueueChange = async (change) => {
    if (faults.allQueues || faults.queue.has(change.localId)) throw new Error("queue failed");
    queues.set(change.localId, structuredClone({ ...change, id: ++sequence }));
    stats.queued.push(structuredClone(change));
    return sequence;
  };
  const readTaskMutationState = async (id, workspaceKey) => {
    if (!workspaceKey || workspaceKey !== auth.workspaceKey) throw new Error("Workspace changed");
    const queueId = queues.get(id)?.id ?? null;
    const found = await getTask(id);
    return { task: found, queueId };
  };
  const commitTaskChange = async (request) => {
    stats.commits.push(structuredClone(request));
    if (!request.expectedWorkspaceKey || request.expectedWorkspaceKey !== auth.workspaceKey) throw new Error("Workspace changed");
    const current = records().get(request.task.localId) ?? null;
    const queueId = queues.get(request.task.localId)?.id ?? null;
    const sameTask = current === null ? request.expected === null
      : request.expected !== null && Object.keys(current).every((field) => current[field] === request.expected[field]);
    if (!sameTask || queueId !== request.expectedQueueId) return { applied: false, task: structuredClone(current), queueId };
    if (faults.save.has(request.task.localId)) throw new Error("save failed");
    if (request.queueAction && (faults.allQueues || faults.queue.has(request.task.localId))) throw new Error("queue failed");
    if (request.queueAction === null && faults.removeQueue.has(request.task.localId)) throw new Error("queue removal failed");
    const saved = structuredClone(request.task);
    records().set(saved.localId, saved);
    stats.saves.push(structuredClone(saved));
    if (request.queueAction === null) queues.delete(saved.localId);
    else if (request.queueAction !== undefined) {
      const queued = { ...saved, action: request.queueAction, localUpdatedAt: saved.updatedAt, createdAt: nowIso(), attemptCount: 0, id: ++sequence };
      queues.set(saved.localId, structuredClone(queued));
      stats.queued.push(structuredClone(queued));
    }
    if (request.removeQueueId !== undefined && queues.get(saved.localId)?.id === request.removeQueueId) queues.delete(saved.localId);
    const result = { applied: true, task: structuredClone(saved), queueId: queues.get(saved.localId)?.id ?? null };
    if (faults.afterCommit) await faults.afterCommit(request);
    return result;
  };
  const db = {
    readTaskMutationState, commitTaskChange,
    getTask, saveTask, saveRemoteTask: saveTask,
    saveTasks: async (items) => { for (const item of items) await saveTask(item); },
    getTasksByServerIds: async (ids) => {
      const found = [...records().values()].filter((item) => ids.includes(item.serverId)).map((item) => structuredClone(item));
      if (faults.byServer) await faults.byServer();
      return found;
    },
    listTasks: async () => { stats.reloads++; if (faults.reload) throw new Error("reload failed"); return [...records().values()].map((item) => structuredClone(item)); },
    readTaskIndex: async () => {
      stats.reloads++;
      if (faults.reload) throw new Error("reload failed");
      return { tasks: [...records().values()].map((item) => structuredClone(item)), removedIds: [], cursor: { epoch: auth.workspaceKey, revision: sequence }, reset: true };
    },
    listTodayTasks: async () => {
      stats.todayLoads++;
      return [...records().values()].filter((item) => !item.isDeleted && item.plannedDate === clock.todayLocalDate(new FixedDate(), settings.displayTimeZone));
    },
    purgeLocalTask: async (id) => {
      if (faults.purge.has(id)) throw new Error("purge failed");
      records().delete(id);
    },
  };
  const queue = {
    enqueueChange,
    removeQueueByLocalId: async (id) => {
      if (faults.removeQueue.has(id)) throw new Error("queue removal failed");
      queues.delete(id);
    },
    removeQueueItem: async (id) => {
      for (const [key, value] of queues) if (value.id === id) queues.delete(key);
    },
    listSyncQueue: async () => [...queues.values()].map((item) => structuredClone(item)),
    incrementQueueAttempt: async () => {},
  };
  const api = { deleteTask: async () => {}, purgeTask: async () => {}, createNextOccurrence: async () => {} };
  const mapper = await loadModule("src/sync/task-mapper.ts", { "../db/sqlite": { nowIso } });
  const dependencies = {
    "../api/task": api, "../db/sqlite": { nowIso, createEmptyTask: (title) => task(`local-${++sequence}`, { title, serverId: null }) },
    "../db/sync-queue.dao": queue, "../db/task.dao": db,
    "../sync/task-mapper": mapper, "../utils/task-order": taskOrder,
    "../../shared/quick-add-parser": clock, "../../shared/task-mutation-policy": policy,
    "./auth": { useAuthStore: () => auth }, "./settings": { useSettingsStore: () => settings },
    "./sync": { useSyncStore: () => ({ syncNow: async () => { stats.syncs++; } }) },
  };
  const { useTaskStore } = await loadModule("src/stores/task.ts", dependencies, {
    window: { setInterval: () => 1, clearInterval: () => {} },
  });
  const store = useTaskStore(createPinia());
  const syncIO = { pullResponse: { changed_tasks: [], deleted_tasks: [], has_more: false, server_time: fixedNow }, settingsWrites: [] };
  const syncDependencies = {
    "../api/sync": { pullSync: async () => syncIO.pullResponse }, "../api/auth": {}, "../api/device": {},
    "../db/sqlite": { nowIso, bridge: () => ({ app: {
      getSettings: async () => ({ lastSyncTime: "" }),
      setSetting: async (...args) => { syncIO.settingsWrites.push(args); },
    } }) }, "../db/sync-queue.dao": queue, "../db/task.dao": db,
    "./task-mapper": mapper, "./WebSocketClient": {},
    "../stores/auth": { useAuthStore: () => auth },
    "../../shared/task-mutation-policy": policy,
  };
  const { SyncManager } = await loadModule("src/sync/SyncManager.ts", syncDependencies, {
    window: { setTimeout: () => 1, clearTimeout: () => {} },
  });
  const manager = new SyncManager(() => {}, async () => {});
  manager.started = true;
  manager.generation = 1;
  return {
    store, auth, settings, workspaces, records, queues, faults, stats, manager, syncIO,
    read: (id) => records().get(id),
    changeWorkspace: (key, items = []) => {
      workspaces.set(key, new Map(items.map((item) => [item.localId, structuredClone(item)])));
      auth.workspaceKey = key;
      store.resetWorkspace();
    },
  };
}

function remoteTask(item, overrides = {}) {
  return {
    id: item.serverId, user_id: 1, title: item.title, content: item.content, status: item.status,
    priority: item.priority, tag: item.tag, project: item.project, list_type: item.listType,
    due_time: item.dueTime, remind_time: item.remindTime, repeat_rule: item.repeatRule,
    planned_date: item.plannedDate, completed_at: item.completedAt, snoozed_until: item.snoozedUntil,
    parent_task_id: item.parentServerId, checklist: JSON.parse(item.checklistJson), is_template: item.isTemplate,
    template_name: item.templateName, sort_order: item.sortOrder, version: item.version,
    is_deleted: item.isDeleted, created_at: item.createdAt, updated_at: item.updatedAt,
    ...overrides,
  };
}

function conflictedTask() {
  const original = task("conflicted", { title: "Local edit", version: 5, syncStatus: "conflict" });
  return { ...original, conflictServerJson: JSON.stringify(remoteTask(original, { title: "Cloud edit" })), conflictLocalJson: JSON.stringify(original) };
}

test("keeping a local conflict preserves the complete conflict when queue persistence fails", async (t) => {
  const original = conflictedTask();
  const h = await harness([original]); t.after(() => h.store.$dispose());
  h.faults.queue.add(original.localId);
  await assert.rejects(h.store.forceOverwriteServer(original), /queue failed/);
  assert.deepEqual(h.read(original.localId), original);
  assert.equal(h.queues.size, 0);
  h.faults.queue.clear();
  await h.store.forceOverwriteServer(original);
  assert.equal(h.read(original.localId).title, "Local edit");
  assert.equal(h.read(original.localId).conflictServerJson, null);
  assert.equal(h.queues.get(original.localId).version, 5);
  assert.equal(h.queues.get(original.localId).action, "update");
});

test("accepting a cloud conflict preserves the local record when queue cleanup fails", async (t) => {
  const original = conflictedTask();
  const h = await harness([original]); t.after(() => h.store.$dispose());
  h.queues.set(original.localId, { id: 9, localId: original.localId });
  h.faults.removeQueue.add(original.localId);
  await assert.rejects(h.store.resolveConflictUseServer(original), /queue removal failed/);
  assert.deepEqual(h.read(original.localId), original);
  assert.equal(h.queues.get(original.localId).id, 9);
  h.faults.removeQueue.clear();
  await h.store.resolveConflictUseServer(original);
  assert.equal(h.read(original.localId).title, "Cloud edit");
  assert.equal(h.read(original.localId).syncStatus, "synced");
  assert.equal(h.queues.size, 0);
});

for (const action of ["resolveConflictUseServer", "forceOverwriteServer"]) {
  test(`${action} keeps a durable recovery successful when the following index refresh fails`, async (t) => {
    const original = conflictedTask();
    const h = await harness([original]); t.after(() => h.store.$dispose());
    h.faults.reload = true;
    await h.store[action](original);
    assert.equal(h.read(original.localId).conflictServerJson, null);
    assert.equal(h.store.tasks[0].conflictServerJson, null);
    assert.equal(h.store.tasks[0].title, action === "resolveConflictUseServer" ? "Cloud edit" : "Local edit");
    assert.equal(h.queues.size, action === "resolveConflictUseServer" ? 0 : 1);
  });

  test(`${action} rejects a workspace switch before applying conflict recovery`, async (t) => {
    const original = conflictedTask();
    const h = await harness([original]); t.after(() => h.store.$dispose());
    const nextWorkspaceTask = task(original.localId, { title: "Other workspace" });
    const pending = h.store[action](original);
    h.changeWorkspace("workspace-b", [nextWorkspaceTask]);
    await assert.rejects(pending, /Workspace changed/);
    assert.deepEqual(h.read(original.localId), nextWorkspaceTask);
    assert.equal(h.queues.size, 0);
  });

  test(`${action} cannot replace an edit committed after the displayed conflict`, async (t) => {
    const original = conflictedTask();
    const h = await harness([original]); t.after(() => h.store.$dispose());
    const newer = { ...original, title: "Newer local edit", syncStatus: "pending_update" };
    h.records().set(original.localId, newer);
    await assert.rejects(h.store[action](original), /conflict.*changed|no longer/i);
    assert.deepEqual(h.read(original.localId), newer);
  });
}

test("completion undo restores only its fields and queues the latest synchronized version", async (t) => {
  const original = task("a", { repeatRule: "daily" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  assert.equal(typeof h.store.undoLastAction, "function", "completion exposes an undo action");
  assert.equal(h.store.pendingUndo.kind, "complete");
  const later = { ...h.read("a"), title: "Edited on another device", version: 5, lastSyncAt: "2026-05-20T08:00:02.000Z", syncStatus: "synced" };
  h.records().set("a", later);
  const result = await h.store.undoLastAction();
  assert.equal(result.succeeded, 1);
  assert.equal(h.read("a").status, "todo");
  assert.equal(h.read("a").completedAt, null);
  assert.equal(h.read("a").title, later.title);
  assert.equal(h.read("a").version, 5);
  assert.equal(h.read("a").lastSyncAt, later.lastSyncAt);
  assert.equal(h.read("a").repeatRule, "daily");
  assert.equal(h.queues.get("a").action, "update");
  assert.equal(h.queues.get("a").version, 5);
  assert.equal(h.store.pendingUndo, null);
});

test("undoing an unsynced deletion restores its create instead of inventing a server identity", async (t) => {
  const original = task("local-only", { serverId: null, version: 0, syncStatus: "pending_create" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.deleteTask(original);
  assert.equal(h.queues.size, 0);
  assert.equal(typeof h.store.undoLastAction, "function");
  await h.store.undoLastAction();
  assert.equal(h.read(original.localId).isDeleted, false);
  assert.equal(h.read(original.localId).serverId, null);
  assert.equal(h.queues.get(original.localId).action, "create");
});

test("a synchronized deletion is undone with restore while retaining completed status", async (t) => {
  const original = task("a", { status: "completed", completedAt: "2026-05-18T08:00:00.000Z" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.deleteTask(original);
  h.records().set("a", { ...h.read("a"), version: 3, syncStatus: "synced" });
  assert.equal(typeof h.store.undoLastAction, "function");
  await h.store.undoLastAction();
  assert.equal(h.read("a").isDeleted, false);
  assert.equal(h.read("a").status, original.status);
  assert.equal(h.read("a").completedAt, original.completedAt);
  assert.equal(h.queues.get("a").action, "restore");
});

test("undo skips purged tasks and a newer edit of the same fields", async (t) => {
  const a = task("a"); const b = task("b", { serverId: 11 });
  const h = await harness([a, b]); t.after(() => h.store.$dispose());
  await h.store.batchComplete([a, b]);
  assert.equal(typeof h.store.undoLastAction, "function");
  h.records().delete("a");
  h.records().set("b", { ...h.read("b"), status: "in_progress", version: 9 });
  const writes = h.stats.saves.length;
  const result = await h.store.undoLastAction();
  assert.equal(result.succeeded, 0);
  assert.equal(result.skipped, 2);
  assert.equal(h.stats.saves.length, writes);
  assert.equal(h.read("a"), undefined);
  assert.equal(h.read("b").status, "in_progress");
});

test("batch mutations group successes, continue after failures and refresh/sync once", async (t) => {
  const items = [task("a"), task("b", { serverId: 11 }), task("c", { serverId: 12 })];
  const h = await harness(items); t.after(() => h.store.$dispose());
  h.faults.save.add("b");
  const result = await h.store.batchComplete(items);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(plain(result.failedIds), ["b"]);
  assert.deepEqual(plain(result.queueFailedIds), []);
  assert.equal(h.store.pendingUndo.count, 2);
  assert.equal(h.stats.reloads, 1);
  assert.equal(h.stats.syncs, 1);
  assert.equal(h.read("b").status, "todo");
  h.faults.save.clear();
  const undone = await h.store.undoLastAction();
  assert.equal(undone.succeeded, 2);
  assert.equal(h.stats.reloads, 2);
  assert.equal(h.stats.syncs, 2);
});

test("atomic queue failures retain only committed changes in the undo group", async (t) => {
  const items = [task("a"), task("b", { serverId: 11 })];
  const h = await harness(items); t.after(() => h.store.$dispose());
  h.faults.queue.add("b");
  const result = await h.store.batchDelete(items);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(plain(result.queueFailedIds), []);
  assert.equal(h.store.pendingUndo.count, 1);
  assert.equal(h.read("b").isDeleted, false);
  h.faults.queue.clear();
  assert.equal((await h.store.undoLastAction()).succeeded, 1);
  assert.equal(h.read("a").isDeleted, false);
  assert.equal(h.read("b").isDeleted, false);
});

test("a failed new operation leaves the previous undo available", async (t) => {
  const items = [task("a"), task("b", { serverId: 11 })];
  const h = await harness(items); t.after(() => h.store.$dispose());
  await h.store.completeTask(items[0]);
  assert.ok(h.store.pendingUndo);
  const previousId = h.store.pendingUndo.id;
  h.faults.save.add("b");
  const result = await h.store.batchDelete([items[1]]);
  assert.equal(result.failed, 1);
  assert.equal(h.store.pendingUndo.id, previousId);
});

test("failed undo writes stay available for retry", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  assert.equal(typeof h.store.undoLastAction, "function");
  h.faults.save.add("a");
  assert.equal((await h.store.undoLastAction()).failed, 1);
  assert.equal(h.store.pendingUndo.count, 1);
  h.faults.save.clear();
  assert.equal((await h.store.undoLastAction()).succeeded, 1);
  assert.equal(h.store.pendingUndo, null);
});

test("workspace reset clears history and a delayed undo cannot write into another account", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  assert.equal(typeof h.store.undoLastAction, "function");
  let releaseRead; const blockedRead = new Promise((resolve) => { releaseRead = resolve; });
  let readStarted; const started = new Promise((resolve) => { readStarted = resolve; });
  h.faults.read = async () => { readStarted(); await blockedRead; };
  const pending = h.store.undoLastAction();
  await started;
  const otherAccount = task("a", { title: "Account B", serverId: 99 });
  h.changeWorkspace("workspace-b", [otherAccount]);
  releaseRead();
  await pending;
  assert.equal(h.store.pendingUndo, null);
  assert.deepEqual(h.read("a"), otherAccount);
});

test("batch reschedule respects display timezone, local clock and reminder offset", async (t) => {
  const original = task("a", {
    dueTime: "2026-05-20T06:00:00.000Z", remindTime: "2026-05-20T05:30:00.000Z",
    plannedDate: "2026-05-20", snoozedUntil: "2026-05-20T11:00:00.000Z", repeatRule: "weekly",
  });
  const h = await harness([original], { timeZone: "Asia/Shanghai" }); t.after(() => h.store.$dispose());
  assert.equal(typeof h.store.batchReschedule, "function");
  const result = await h.store.batchReschedule([original], "2026-05-24");
  assert.equal(result.succeeded, 1);
  assert.equal(h.read("a").dueTime, "2026-05-24T06:00:00.000Z");
  assert.equal(h.read("a").remindTime, "2026-05-24T05:30:00.000Z");
  assert.equal(h.read("a").plannedDate, "2026-05-24");
  assert.equal(h.read("a").snoozedUntil, null);
  assert.equal(h.read("a").repeatRule, "weekly");
  await h.store.undoLastAction();
  assert.equal(h.read("a").dueTime, original.dueTime);
  assert.equal(h.read("a").remindTime, original.remindTime);
});

test("batch reschedule rejects impossible dates without mutating tasks", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  assert.equal(typeof h.store.batchReschedule, "function");
  for (const date of ["2026-02-30", "2026-13-01", "2026-5-20", "not-a-date"]) {
    await assert.rejects(h.store.batchReschedule([original], date));
  }
  assert.equal(h.stats.saves.length, 0);
});

test("planning today removes elapsed scheduling but keeps future deadlines", async (t) => {
  const overdue = task("overdue", { dueTime: "2026-05-19T06:00:00.000Z", remindTime: "2026-05-19T05:30:00.000Z", snoozedUntil: "2026-05-21T09:00:00.000Z" });
  const future = task("future", { serverId: 11, dueTime: "2026-05-25T10:00:00.000Z", remindTime: "2026-05-25T09:00:00.000Z" });
  const h = await harness([overdue, future], { timeZone: "America/Los_Angeles" }); t.after(() => h.store.$dispose());
  assert.equal(typeof h.store.batchPlanToday, "function");
  await h.store.batchPlanToday([overdue, future]);
  assert.equal(h.read("overdue").plannedDate, "2026-05-20");
  assert.equal(h.read("overdue").listType, "today");
  assert.equal(h.read("overdue").dueTime, null);
  assert.equal(h.read("overdue").remindTime, null);
  assert.equal(h.read("overdue").snoozedUntil, null);
  assert.equal(h.read("future").dueTime, future.dueTime);
  assert.equal(h.read("future").remindTime, future.remindTime);
  assert.equal(h.store.todayTasks.length, 2);
});

test("tomorrow keeps the existing 09:00 action and shifts reminders by their due offset", async (t) => {
  const original = task("a", { dueTime: "2026-05-20T15:00:00.000Z", remindTime: "2026-05-20T14:30:00.000Z", snoozedUntil: "2026-05-20T14:00:00.000Z" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.postponeTomorrow(original);
  assert.equal(h.read("a").dueTime, "2026-05-21T09:00:00.000Z");
  assert.equal(h.read("a").remindTime, "2026-05-21T08:30:00.000Z");
  assert.equal(h.read("a").snoozedUntil, null);
  assert.ok(h.store.pendingUndo);
});

test("priority changes affect only priority and form one undo action", async (t) => {
  const items = [task("a"), task("b", { serverId: 11, priority: 3 })];
  const h = await harness(items); t.after(() => h.store.$dispose());
  assert.equal(typeof h.store.batchSetPriority, "function");
  await assert.rejects(h.store.batchSetPriority(items, 6));
  await h.store.batchSetPriority(items, 2);
  assert.equal(h.store.pendingUndo.kind, "priority");
  assert.equal(h.store.pendingUndo.count, 2);
  assert.equal(h.read("a").plannedDate, null);
  await h.store.undoLastAction();
  assert.equal(h.read("a").priority, 0);
  assert.equal(h.read("b").priority, 3);
});

test("a completion acknowledgement updates undo's canonical server timestamp", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const confirmedAt = "2026-05-20T08:00:03.123Z";
  const remote = remoteTask(h.read("a"), { version: 3, completed_at: confirmedAt, updated_at: confirmedAt });
  await h.manager.markQueueItemApplied(queued, { task: remote, server_id: 10, version: 3 }, 1);
  assert.equal(h.read("a").completedAt, confirmedAt);
  assert.equal(typeof h.store.undoLastAction, "function");
  assert.equal((await h.store.undoLastAction()).succeeded, 1);
  assert.equal(h.read("a").status, "todo");
});

test("a delayed completion acknowledgement preserves a newer undo and rebases its queue", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const completed = structuredClone(h.read("a"));
  assert.equal(typeof h.store.undoLastAction, "function");
  await h.store.undoLastAction();
  h.records().set("a", { ...h.read("a"), content: "new local content" });
  await h.manager.markQueueItemApplied(queued, { task: remoteTask(completed, { version: 3 }), server_id: 10, version: 3 }, 1);
  assert.equal(h.read("a").status, "todo");
  assert.equal(h.read("a").content, "new local content");
  assert.equal(h.read("a").version, 3);
  assert.equal(h.queues.get("a").action, "update");
  assert.equal(h.queues.get("a").version, 3);
});

test("a delayed deletion acknowledgement preserves undo and queues restore", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.deleteTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const deleted = structuredClone(h.read("a"));
  assert.equal(typeof h.store.undoLastAction, "function");
  await h.store.undoLastAction();
  await h.manager.markQueueItemApplied(queued, { task: remoteTask(deleted, { version: 3 }), server_id: 10, version: 3 }, 1);
  assert.equal(h.read("a").isDeleted, false);
  assert.equal(h.queues.get("a").action, "restore");
  assert.equal(h.queues.get("a").version, 3);
});

test("a delayed acknowledgement never revives a purged record", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const completed = structuredClone(h.read("a"));
  h.records().delete("a");
  await h.manager.markQueueItemApplied(queued, { task: remoteTask(completed, { version: 3 }), server_id: 10, version: 3 }, 1);
  assert.equal(h.read("a"), undefined);
});

test("undo retries an atomic queue failure without partially restoring the task", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.deleteTask(original);
  h.faults.queue.add("a");
  const firstAttempt = await h.store.undoLastAction();
  assert.equal(firstAttempt.failed, 1);
  assert.deepEqual(plain(firstAttempt.queueFailedIds), []);
  assert.equal(h.read("a").isDeleted, true);
  assert.equal(h.store.pendingUndo.count, 1);
  h.records().set("a", { ...h.read("a"), title: "Subsequent unrelated edit" });
  h.faults.queue.clear();
  assert.equal((await h.store.undoLastAction()).succeeded, 1);
  assert.equal(h.queues.get("a").action, "restore");
  assert.equal(h.queues.get("a").title, "Subsequent unrelated edit");
  assert.equal(h.store.pendingUndo, null);
});

test("an offline completion that gains a server identity undoes with update", async (t) => {
  const original = task("offline", { serverId: null, version: 0, syncStatus: "pending_create" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("offline"));
  const confirmed = remoteTask(h.read("offline"), { id: 77, version: 1 });
  await h.manager.markQueueItemApplied(queued, { task: confirmed, server_id: 77, version: 1 }, 1);
  assert.equal((await h.store.undoLastAction()).succeeded, 1);
  assert.equal(h.read("offline").serverId, 77);
  assert.equal(h.queues.get("offline").action, "update");
  assert.equal(h.queues.get("offline").version, 1);
});

test("a create acknowledged after local deletion queues delete without reviving it", async (t) => {
  const original = task("offline", { serverId: null, version: 0, syncStatus: "pending_create" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.planToday(original);
  const queued = structuredClone(h.queues.get("offline"));
  const created = structuredClone(h.read("offline"));
  await h.store.deleteTask(created);
  assert.equal(h.queues.size, 0);
  await h.manager.markQueueItemApplied(queued, { task: remoteTask(created, { id: 77, version: 1 }), server_id: 77, version: 1 }, 1);
  assert.equal(h.read("offline").isDeleted, true);
  assert.equal(h.read("offline").serverId, 77);
  assert.equal(h.queues.get("offline").action, "delete");
  assert.equal(h.queues.get("offline").version, 1);
});

test("restore acknowledgements preserve the original completion time through a followup update", async (t) => {
  const original = task("a", { status: "completed", completedAt: "2026-05-18T07:30:00.000Z" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.deleteTask(original);
  await h.store.undoLastAction();
  const queued = structuredClone(h.queues.get("a"));
  const restored = remoteTask(h.read("a"), { completed_at: null, version: 3 });
  await h.manager.markQueueItemApplied(queued, { task: restored, server_id: 10, version: 3 }, 1);
  assert.equal(h.read("a").completedAt, original.completedAt);
  assert.equal(h.queues.get("a").action, "update");
  assert.equal(h.queues.get("a").completedAt, original.completedAt);
  assert.equal(h.queues.get("a").version, 3);
});

test("editing a schedule preserves unrelated newer content and supports field undo", async (t) => {
  const original = task("a", { dueTime: "2026-05-21T08:00:00.000Z", remindTime: "2026-05-21T07:30:00.000Z" });
  const h = await harness([original]); t.after(() => h.store.$dispose());
  h.records().set("a", { ...original, title: "Remote title", version: 6 });
  await h.store.updateTask(original, {
    title: original.title, content: original.content, priority: original.priority, tag: original.tag,
    project: original.project, dueTime: "2026-05-24T08:00:00.000Z", remindTime: "2026-05-24T07:30:00.000Z",
  });
  assert.equal(h.read("a").title, "Remote title");
  assert.equal(h.read("a").version, 6);
  assert.equal(h.store.pendingUndo.kind, "edit");
  await h.store.undoLastAction();
  assert.equal(h.read("a").dueTime, original.dueTime);
  assert.equal(h.read("a").title, "Remote title");
});

test("today uses the configured calendar even when the system UTC date differs", async (t) => {
  const original = task("a");
  const h = await harness([original], { timeZone: "Pacific/Honolulu" }); t.after(() => h.store.$dispose());
  await h.store.planToday(original);
  assert.equal(h.read("a").plannedDate, "2026-05-19");
  assert.equal(h.store.todayTasks.length, 1);
});

test("rescheduling across daylight saving keeps the local clock and relative reminder", async (t) => {
  const original = task("a", { dueTime: "2026-05-20T14:00:00.000Z", remindTime: "2026-05-20T13:45:00.000Z" });
  const h = await harness([original], { timeZone: "America/New_York" }); t.after(() => h.store.$dispose());
  await h.store.batchReschedule([original], "2026-11-04");
  assert.equal(h.read("a").dueTime, "2026-11-04T15:00:00.000Z");
  assert.equal(h.read("a").remindTime, "2026-11-04T14:45:00.000Z");
});

test("a refresh failure after task creation does not turn a durable save into a retry", async (t) => {
  const h = await harness([]); t.after(() => h.store.$dispose());
  h.faults.reload = true;
  const saved = await h.store.addTask({ title: "Durably saved", listType: "today", plannedDate: "2026-05-20" });
  assert.equal(h.records().size, 1);
  assert.equal(h.store.tasks[0].localId, saved.localId);
  assert.equal(h.store.todayTasks[0].localId, saved.localId);
  assert.equal(h.queues.get(saved.localId).action, "create");
});

test("retrying an atomic create failure reuses the submission identity", async (t) => {
  const h = await harness([]); t.after(() => h.store.$dispose());
  h.faults.allQueues = true;
  const draft = { title: "Do not duplicate", checklistText: "one\ntwo" };
  await assert.rejects(h.store.addTask(draft), /queue failed/);
  assert.equal(h.records().size, 0);
  const id = h.stats.commits[0].task.localId;
  h.faults.allQueues = false;
  const saved = await h.store.addTask(draft);
  assert.equal(h.records().size, 1);
  assert.equal(saved.localId, id);
  assert.equal(h.queues.get(id).action, "create");
});

test("a refresh failure after editing is reported without rejecting the durable save", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  h.faults.reload = true;
  const updated = await h.store.updateTask(original, { title: "Updated", tag: original.tag });
  assert.equal(updated.title, "Updated");
  assert.equal(h.read("a").title, "Updated");
  assert.equal(h.store.tasks[0].title, "Updated");
  assert.equal(h.store.pendingUndo.kind, "edit");
});


test("batch priority preserves the existing urgent and highest levels", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  for (const priority of [4, 5]) {
    assert.equal((await h.store.batchSetPriority([original], priority)).succeeded, 1);
    assert.equal(h.read("a").priority, priority);
    assert.equal(h.queues.get("a").priority, priority);
    await h.store.undoLastAction();
    assert.equal(h.read("a").priority, 0);
  }
});


test("failed-create retry identities are cleared when the workspace changes", async (t) => {
  const h = await harness([]); t.after(() => h.store.$dispose());
  h.faults.allQueues = true;
  const draft = { title: "Same words, different account" };
  await assert.rejects(h.store.addTask(draft));
  const accountATask = h.stats.commits[0].task;
  h.changeWorkspace("workspace-b");
  h.faults.allQueues = false;
  const saved = await h.store.addTask(draft);
  assert.notEqual(saved.localId, accountATask.localId);
  assert.equal(h.workspaces.get("workspace-a").size, 0);
  assert.equal(h.records().size, 1);
});


test("an acknowledgement paused after reading cannot overwrite an intervening undo", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const completed = structuredClone(h.read("a"));
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const began = new Promise((resolve) => { started = resolve; });
  h.faults.read = async () => { started(); await gate; };
  const acknowledgement = h.manager.markQueueItemApplied(queued, {
    task: remoteTask(completed, { version: 3 }), server_id: 10, version: 3,
  }, 1);
  await began;
  h.faults.read = null;
  await h.store.undoLastAction();
  assert.equal(h.read("a").status, "todo");
  release();
  await acknowledgement;
  assert.equal(h.read("a").status, "todo");
  assert.equal(h.read("a").version, 3);
  assert.equal(h.queues.get("a").status, "todo");
  assert.equal(h.queues.get("a").version, 3);
});

test("an undo paused after reading rebases on an intervening acknowledgement", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const completed = structuredClone(h.read("a"));
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const began = new Promise((resolve) => { started = resolve; });
  h.faults.read = async () => { started(); await gate; };
  const undo = h.store.undoLastAction();
  await began;
  h.faults.read = null;
  await h.manager.markQueueItemApplied(queued, {
    task: remoteTask(completed, { version: 3, completed_at: "2026-05-20T08:00:03.000Z" }), server_id: 10, version: 3,
  }, 1);
  release();
  assert.equal((await undo).succeeded, 1);
  assert.equal(h.read("a").status, "todo");
  assert.equal(h.read("a").version, 3);
  assert.equal(h.queues.get("a").version, 3);
});

test("a mutation paused after reading keeps a newly acknowledged server version", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const completed = structuredClone(h.read("a"));
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const began = new Promise((resolve) => { started = resolve; });
  h.faults.read = async () => { started(); await gate; };
  const mutation = h.store.batchSetPriority([completed], 4);
  await began;
  h.faults.read = null;
  await h.manager.markQueueItemApplied(queued, {
    task: remoteTask(completed, { version: 3 }), server_id: 10, version: 3,
  }, 1);
  release();
  assert.equal((await mutation).succeeded, 1);
  assert.equal(h.read("a").priority, 4);
  assert.equal(h.read("a").version, 3);
  assert.equal(h.queues.get("a").version, 3);
});

test("switching a failed quick capture to the full editor never creates a duplicate", async (t) => {
  const h = await harness([]); t.after(() => h.store.$dispose());
  h.faults.allQueues = true;
  await assert.rejects(h.store.addTask({ title: "same capture", listType: "today", plannedDate: "2026-05-20" }));
  assert.equal(h.records().size, 0);
  const submissionId = h.stats.commits[0].task.localId;
  h.faults.allQueues = false;
  const saved = await h.store.addTask({
    title: "same capture", content: "", priority: 0, tag: "", project: "", listType: "today",
    dueTime: null, remindTime: null, repeatRule: "", plannedDate: "2026-05-20", checklistText: "",
    checklistItems: [], isTemplate: false, templateName: "",
  });
  assert.equal(saved.localId, submissionId);
  assert.equal(h.records().size, 1);
  assert.equal(h.queues.size, 1);
});


test("main-process task commits compare both records and queue identity and roll back queue failures", async () => {
  const source = await readFile(resolve(desktopRoot, "electron/db.ts"), "utf8");
  const ast = ts.createSourceFile("db.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set([
    "getTask", "getTaskByServerId", "upsertTask", "upsertTasks", "saveTaskRecord", "taskFromRow", "toSyncStatus",
    "readTaskMutationState", "commitTaskChange", "enqueueTaskChange", "enqueueChange", "removeQueueByLocalId",
  ]);
  const selected = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
  for (const name of names) assert.ok(selected.some((node) => node.name.text === name), `missing function ${name}`);
  const compiled = ts.transpileModule(selected.map((node) => node.getText(ast)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const schema = source.match(/db\.exec\(\s*`([\s\S]*?)`\s*\)/)?.[1];
  assert.ok(schema, "load the production schema for the transaction regression");
  const directory = await mkdtemp(join(tmpdir(), "taskbridge-task-commit-"));
  const runner = join(directory, "atomic.mjs");
  try {
    await writeFile(runner, `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      const require = createRequire(${JSON.stringify(resolve(desktopRoot, "package.json"))});
      const Database = require("better-sqlite3");
      const connection = new Database(":memory:");
      connection.exec(${JSON.stringify(schema)});
      const database = () => connection;
      let workspace = "workspace-a";
      const getActiveWorkspaceKey = () => workspace;
      ${compiled}
      const original = ${JSON.stringify(task("db-a"))};
      upsertTask(original);
      enqueueTaskChange(original, "update");
      const initial = readTaskMutationState(original.localId, workspace);
      const completed = { ...original, status: "completed", completedAt: "2026-05-20T08:00:01.000Z", updatedAt: "2026-05-20T08:00:01.000Z", syncStatus: "pending_update" };
      const changed = { ...original, title: "Concurrent window edit" };
      upsertTask(changed);
      enqueueTaskChange(changed, "update");
      const stale = commitTaskChange({ expectedWorkspaceKey: workspace, expected: initial.task, expectedQueueId: initial.queueId, task: completed, queueAction: "complete" });
      assert.equal(stale.applied, false);
      assert.equal(stale.task.title, changed.title);
      assert.equal(getTask(original.localId).title, changed.title);
      const fresh = readTaskMutationState(original.localId, workspace);
      const previousQueue = connection.prepare("SELECT * FROM sync_queue").all();
      connection.exec("CREATE TEMP TRIGGER fail_queue BEFORE INSERT ON sync_queue BEGIN SELECT RAISE(FAIL, 'queue failed'); END;");
      const request = { expectedWorkspaceKey: workspace, expected: fresh.task, expectedQueueId: fresh.queueId, task: { ...completed, title: changed.title }, queueAction: "complete", removeQueueId: fresh.queueId };
      assert.throws(() => commitTaskChange(request), /queue failed/);
      assert.deepEqual(getTask(original.localId), fresh.task);
      assert.deepEqual(connection.prepare("SELECT * FROM sync_queue").all(), previousQueue);
      const newTask = { ...original, localId: "new-a", serverId: null, version: 0, syncStatus: "pending_create" };
      assert.throws(() => commitTaskChange({ expectedWorkspaceKey: workspace, expected: null, expectedQueueId: null, task: newTask, queueAction: "create" }), /queue failed/);
      assert.equal(getTask(newTask.localId), null);
      connection.exec("DROP TRIGGER fail_queue;");
      const committed = commitTaskChange(request);
      assert.equal(committed.applied, true);
      assert.equal(committed.task.status, "completed");
      assert.notEqual(committed.queueId, fresh.queueId);
      assert.equal(connection.prepare("SELECT COUNT(*) AS count FROM sync_queue").get().count, 1);
      const sameTaskState = readTaskMutationState(original.localId, workspace);
      enqueueTaskChange(sameTaskState.task, "update");
      const laterQueueId = connection.prepare("SELECT id FROM sync_queue").get().id;
      const staleQueue = commitTaskChange({ expectedWorkspaceKey: workspace, expected: sameTaskState.task, expectedQueueId: sameTaskState.queueId, task: { ...sameTaskState.task, version: 3, syncStatus: "synced" }, removeQueueId: sameTaskState.queueId });
      assert.equal(staleQueue.applied, false, "queue-only changes invalidate an old acknowledgement");
      assert.equal(staleQueue.queueId, laterQueueId);
      assert.equal(connection.prepare("SELECT id FROM sync_queue").get().id, laterQueueId);
      workspace = "workspace-b";
      assert.throws(() => readTaskMutationState(original.localId, "workspace-a"), /workspace/i);
      assert.throws(() => commitTaskChange(request), /workspace/i);
      workspace = "workspace-a";
      assert.throws(() => readTaskMutationState(original.localId, ""), /workspace/i);
      const beforePurge = readTaskMutationState(original.localId, workspace);
      connection.prepare("DELETE FROM tasks WHERE local_id = ?").run(original.localId);
      const afterPurge = commitTaskChange({ expectedWorkspaceKey: workspace, expected: beforePurge.task, expectedQueueId: beforePurge.queueId, task: { ...beforePurge.task, version: 3 }, removeQueueId: beforePurge.queueId });
      assert.equal(afterPurge.applied, false);
      assert.equal(afterPurge.task, null);
      assert.equal(getTask(original.localId), null);
      connection.close();
      process.stdout.write("atomic-task-commit-ok");
    `, "utf8");
    const { stdout } = await promisify(execFile)(resolve(desktopRoot, "node_modules/electron/dist/electron.exe"), [runner], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 20000,
    });
    assert.match(stdout, /atomic-task-commit-ok/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("a pull paused after reading cannot overwrite a newer undo", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  await h.store.completeTask(original);
  const queued = structuredClone(h.queues.get("a"));
  const completed = remoteTask(h.read("a"), { version: 3 });
  await h.manager.markQueueItemApplied(queued, { task: completed, server_id: 10, version: 3 }, 1);
  h.syncIO.pullResponse = { changed_tasks: [completed], deleted_tasks: [], has_more: false, server_time: fixedNow };
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const began = new Promise((resolve) => { started = resolve; });
  h.faults.byServer = async () => { started(); await gate; };
  const pull = h.manager.pullRemoteChanges(1);
  await began;
  h.faults.byServer = null;
  await h.store.undoLastAction();
  release();
  await pull;
  assert.equal(h.read("a").status, "todo");
  assert.equal(h.read("a").version, 3);
  assert.equal(h.queues.get("a").status, "todo");
  assert.equal(h.queues.get("a").version, 3);
});


test("an acknowledgement arriving before the commit reply still canonicalizes the undo snapshot", async (t) => {
  const original = task("a");
  const h = await harness([original]); t.after(() => h.store.$dispose());
  let release; const gate = new Promise((resolve) => { release = resolve; });
  let started; const began = new Promise((resolve) => { started = resolve; });
  h.faults.afterCommit = async (request) => {
    if (request.queueAction !== "complete") return;
    started(); await gate;
  };
  const completion = h.store.completeTask(original);
  await began;
  const queued = structuredClone(h.queues.get("a"));
  const confirmed = remoteTask(h.read("a"), { version: 3, completed_at: "2026-05-20T08:00:03.000Z", updated_at: "2026-05-20T08:00:03.000Z" });
  await h.manager.markQueueItemApplied(queued, { task: confirmed, server_id: 10, version: 3 }, 1);
  release();
  await completion;
  h.faults.afterCommit = null;
  assert.equal((await h.store.undoLastAction()).succeeded, 1);
  assert.equal(h.read("a").status, "todo");
  assert.equal(h.queues.get("a").version, 3);
});

test("a lost create reply and regenerated checklist IDs still reuse the quick-capture submission", async (t) => {
  const h = await harness([]); t.after(() => h.store.$dispose());
  h.faults.afterCommit = async () => { throw new Error("lost commit reply"); };
  await assert.rejects(h.store.addTask({ title: "same checklist", checklistText: "Buy\nPack" }), /lost commit reply/);
  assert.equal(h.records().size, 1);
  const id = [...h.records().keys()][0];
  h.faults.afterCommit = null;
  const saved = await h.store.addTask({
    title: "same checklist", content: "", priority: 0, tag: "", project: "", listType: "inbox",
    dueTime: null, remindTime: null, repeatRule: "", plannedDate: null, checklistText: "Buy\nPack",
    checklistItems: [{ id: "editor-one", title: "Buy", done: false }, { id: "editor-two", title: "Pack", done: false }],
    isTemplate: false, templateName: "",
  });
  assert.equal(saved.localId, id);
  assert.equal(h.records().size, 1);
  assert.equal(h.queues.size, 1);
});
