import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";

const require = createRequire(import.meta.url);
const desktopRoot = resolve(import.meta.dirname, "..");

test("SQLite today pagination reaches every task beyond 200, including the last partial page", async () => {
  const parent = resolve(desktopRoot, "tmp/remediation-20261010/desktop");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "sqlite-regression-"));
  const runner = join(directory, "run.mjs");
  try {
    await writeFile(runner, `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      import { loadElectronModule } from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "helpers/mock-electron-windows.mjs")).href)};
      const require = createRequire(${JSON.stringify(resolve(desktopRoot, "package.json"))});
      const store = loadElectronModule("main/db.ts", {
        electron: { app: { getPath: () => ${JSON.stringify(directory)} } },
        "better-sqlite3": require("better-sqlite3"),
        "./state": { getSettings: () => ({ currentUserId: 1, baseUrl: "http://localhost:18080", displayTimeZone: "UTC" }),
          getActiveWorkspaceKey: () => "workspace-a", claimLegacyGlobalDatabaseWorkspace: () => false, claimLegacyUserDatabaseWorkspace: () => false },
      });
      const tasks = Array.from({ length: 1260 }, (_, i) => ({
        localId: "task-" + String(i).padStart(4, "0"), serverId: i + 1, title: "Today " + i, content: "full body " + i,
        status: "todo", priority: 0, tag: null, project: null, listType: "today", dueTime: null,
        remindTime: null, repeatRule: null, plannedDate: null, completedAt: null, snoozedUntil: null,
        parentServerId: null, checklistJson: "[]", isTemplate: false, templateName: null, sortOrder: i,
        version: 1, isDeleted: false, syncStatus: "synced", createdAt: "2026-10-10T00:00:00Z",
        updatedAt: "2026-10-10T00:00:00Z", lastSyncAt: null, conflictServerJson: null, conflictLocalJson: null,
      }));
      store.upsertTasks(tasks);
      const found = [];
      for (let offset = 0; offset < tasks.length; offset += 100) found.push(...store.listTodayTasks(100, offset));
      assert.equal(new Set(found.map(task => task.localId)).size, tasks.length);
      assert.equal(found.length, tasks.length);
      assert.equal(store.listTodayTasks(100, tasks.length).length, 0);
      const dao = loadElectronModule("renderer/db/task.dao.ts", {
        "./sqlite": { bridge: () => ({ db: {
          listTodayTasks: (...args) => store.listTodayTasks(...args),
          listTaskSnapshotPage: (...args) => store.listTaskSnapshotPage(...args),
          listTaskChanges: (...args) => store.listTaskChanges(...args),
        } }) },
      });
      assert.equal((await dao.listTodayTasks()).length, tasks.length, "the renderer DAO follows every today page");
      assert.equal(typeof store.listTaskSnapshotPage, "function", "the index needs a stable initial snapshot");
      const initial = store.listTaskSnapshotPage(null, 500);
      assert.equal(Object.hasOwn(initial.tasks[0], "content"), false, "list snapshots must not materialize full bodies");
      assert.equal(initial.tasks[0].contentPreview, tasks[0].content);
      assert.equal(Object.hasOwn(initial.tasks[0], "checklistJson"), false);
      assert.equal(Object.hasOwn(initial.tasks[0], "conflictServerJson"), false);
      assert.equal(store.getTask(tasks[0].localId).content, tasks[0].content, "detail reads retain the full record");
      const projection = loadElectronModule("common/task-summary.ts");
      const unicode = { ...tasks[0], content: "😀".repeat(200) + " suffix", syncStatus: "conflict", conflictServerJson: '{"title":"cloud"}' };
      store.upsertTask(unicode);
      const unicodeSummary = store.listTaskSnapshotPage(null, 1).tasks[0];
      assert.equal(projection.toTaskListSummary(unicode).contentPreview, unicodeSummary.contentPreview,
        "SQL and JS must project the same Unicode preview for conflict comparison");
      store.upsertTask(tasks[0]);
      initial.cursor = store.listTaskSnapshotPage(null, 1).cursor;
      const indexed = [...initial.tasks];
      let page = initial;
      while (page.nextLocalId !== null) {
        page = store.listTaskSnapshotPage(page.nextLocalId, 500);
        indexed.push(...page.tasks);
      }
      assert.equal(new Set(indexed.map(task => task.localId)).size, tasks.length);
      const unchanged = store.listTaskChanges(initial.cursor, 500);
      assert.equal(unchanged.tasks.length, 0);
      assert.equal(unchanged.removedIds.length, 0);
      store.upsertTask({ ...tasks[0], title: "Same timestamp, corrected title" });
      store.database().prepare("DELETE FROM tasks WHERE local_id = ?").run(tasks[1].localId);
      const changed = store.listTaskChanges(unchanged.cursor, 1);
      assert.equal(changed.tasks[0].title, "Same timestamp, corrected title");
      assert.equal(changed.hasMore, true);
      const deleted = store.listTaskChanges(changed.cursor, 1);
      assert.deepEqual(deleted.removedIds, [tasks[1].localId]);
      assert.equal(deleted.hasMore, false);
      store.database().prepare("UPDATE tasks SET checklist_json = ?, sync_status = 'conflict' WHERE local_id = ?")
        .run('[null,"legacy",{"done":true},{"done":1},{"done":false}]', tasks[0].localId);
      const checklistSummary = store.listTaskChanges(deleted.cursor, 500).tasks[0];
      assert.equal(checklistSummary.checklistTotal, 5);
      assert.equal(checklistSummary.checklistDone, 1, "legacy scalar values and numeric truthiness do not count as completed checklist objects");
      assert.ok(checklistSummary.changeRevision > initial.tasks[0].changeRevision);
      assert.equal(store.getSyncHealthSummary().conflictCount, 1);
      assert.equal(store.getSyncHealthSummary().pendingCount, 0);
      const captureA = store.createLocalTask("One capture submission", "capture-regression");
      const captureB = store.createLocalTask("One capture submission", "capture-regression");
      assert.equal(captureA.localId, captureB.localId, "retrying after renderer destruction must not create a second task");
      store.database().transaction(() => {
        for (let i = 0; i < 10005; i++) store.database().prepare("UPDATE tasks SET title = ? WHERE local_id = ?").run("Edit " + i, tasks[0].localId);
      })();
      assert.ok(store.database().prepare("SELECT COUNT(*) AS n FROM task_changes").get().n <= 10000, "the change journal must stay bounded");
      assert.equal(store.listTaskChanges(initial.cursor, 500).resetRequired, true, "an expired cursor requests a complete snapshot");
      const recovered = await dao.readTaskIndex(initial.cursor);
      assert.equal(recovered.reset, true);
      assert.equal(recovered.tasks.length, tasks.length, "the reset snapshot includes the capture and excludes the purged task");
      assert.equal(recovered.tasks.find(task => task.localId === tasks[0].localId).title, "Edit 10004");
      assert.equal((await dao.readTaskIndex(recovered.cursor)).tasks.length, 0);
      assert.equal(store.listTaskChanges({ ...deleted.cursor, epoch: "previous-database" }, 500).resetRequired, true);
      assert.equal(store.listTaskChanges({ ...deleted.cursor, revision: Number.MAX_SAFE_INTEGER }, 500).resetRequired, true);
      store.database().close();
    `, "utf8");
    await promisify(execFile)(resolve(desktopRoot, "node_modules/electron/dist/electron.exe"), [runner], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 30000,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("formatter caching evicts old locales and time zones instead of retaining an unbounded map", () => {
  const parser = loadElectronModule("common/quick-add-parser.ts");
  const first = parser.getDateTimeFormatter("en-US", { timeZone: "UTC", year: "numeric" });
  assert.strictEqual(parser.getDateTimeFormatter("en-US", { year: "numeric", timeZone: "UTC" }), first);
  for (const timeZone of Intl.supportedValuesOf("timeZone").slice(0, 40)) {
    parser.getDateTimeFormatter("en-US", { timeZone, year: "numeric" });
  }
  assert.notStrictEqual(parser.getDateTimeFormatter("en-US", { timeZone: "UTC", year: "numeric" }), first);
  assert.equal(parser.formatShanghaiDateTime("2026-10-10T23:30:00Z", "zh-CN", "Asia/Shanghai"),
    new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date("2026-10-10T23:30:00Z")));
});

test("incremental index refresh retains unchanged task references and same-timestamp corrections", async (t) => {
  const original = { localId: "a", title: "Original", content: "Complete content", checklistJson: "[]", status: "todo", listType: "today", updatedAt: "2026-10-10T00:00:00Z" };
  let reads = 0;
  let oldReads = 0;
  const cursor = { epoch: "database-a", revision: 1 };
  const responses = [
    { tasks: [structuredClone(original)], removedIds: [], cursor, reset: true },
    { tasks: [], removedIds: [], cursor, reset: false },
    { tasks: [{ ...original, title: "Corrected" }], removedIds: [], cursor: { ...cursor, revision: 2 }, reset: false },
    { tasks: [], removedIds: ["a"], cursor: { ...cursor, revision: 3 }, reset: false },
  ];
  const { useTaskStore } = loadElectronModule("renderer/stores/task.ts", {
    vue: require("vue"), pinia: require("pinia"),
    "../api/task": {}, "../db/sqlite": {}, "../db/sync-queue.dao": {}, "../sync/task-mapper": {},
    "../db/task.dao": {
      readTaskIndex: async () => responses[reads++],
      listTasks: async () => { oldReads++; return [structuredClone(original)]; }, listTodayTasks: async () => [],
    },
    "./auth": { useAuthStore: () => ({ workspaceKey: "workspace-a" }) },
    "./settings": { useSettingsStore: () => ({ displayTimeZone: "UTC" }) }, "./sync": {},
  }, { window: { setInterval: () => 1, clearInterval() {} } });
  const store = useTaskStore(require("pinia").createPinia());
  t.after(() => store.$dispose());
  await store.load();
  const array = store.tasks;
  const record = store.tasks[0];
  await store.load();
  assert.strictEqual(store.tasks, array);
  assert.strictEqual(store.tasks[0], record);
  await store.load();
  assert.equal(store.tasks[0].title, "Corrected");
  assert.equal(store.tasks[0].contentPreview, original.content);
  assert.equal(Object.hasOwn(store.tasks[0], "content"), false);
  assert.notStrictEqual(store.tasks[0], record);
  await store.load();
  assert.equal(store.tasks.length, 0);
  assert.equal(store.todayTasks.length, 0);
  assert.equal(oldReads, 0);
});

test("timeline sorting reuses date formatters across a batch while preserving task order", () => {
  let constructions = 0;
  const DateTimeFormat = function (...args) { constructions++; return new Intl.DateTimeFormat(...args); };
  const order = loadElectronModule("renderer/utils/task-order.ts", {}, { Intl: { ...Intl, DateTimeFormat } });
  const tasks = Array.from({ length: 1000 }, (_, i) => ({
    localId: String(i), status: "todo", dueTime: new Date(Date.UTC(2026, 9, 10, 0, i)).toISOString(),
    plannedDate: "2026-10-10", priority: 0, sortOrder: 0, updatedAt: "2026-10-10T00:00:00Z", completedAt: null,
  }));
  const sorted = order.sortTasksByTimeline(tasks, { now: "2026-10-10T08:00:00Z", displayTimeZone: "Asia/Shanghai" });
  assert.deepEqual(sorted.map(task => task.localId), tasks.map(task => task.localId));
  assert.ok(constructions <= 4, `constructed ${constructions} date formatters for one batch`);
});

test("a synchronization without persisted task changes does not reload the task index", async () => {
  let refreshed = 0;
  const { SyncManager } = loadElectronModule("renderer/sync/SyncManager.ts", {
    "../api/sync": { pullSync: async () => ({ changed_tasks: [], deleted_tasks: [], has_more: false, server_time: "2026-10-10T08:00:00Z" }) },
    "../api/auth": {}, "../api/device": { registerDevice: async () => {} },
    "../stores/auth": { useAuthStore: () => ({ workspaceKey: "workspace-a" }) },
    "../db/sqlite": { bridge: () => ({ auth: { hasTokens: async () => true }, app: {
      getSettings: async () => ({ deviceId: "test", lastSyncTime: "" }), setSetting: async () => {}, setSyncStatus: async () => {},
    } }) },
    "../db/sync-queue.dao": { listSyncQueue: async () => [] },
    "../db/task.dao": { getTasksByServerIds: async () => [] },
    "./task-mapper": {}, "./WebSocketClient": {},
  }, { navigator: { onLine: true }, window: {} });
  const manager = new SyncManager(() => {}, async () => { refreshed++; });
  manager.started = true;
  await manager.syncNow();
  assert.equal(refreshed, 0);
});
