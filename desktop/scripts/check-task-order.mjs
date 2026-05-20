import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "src/utils/task-order.ts");
const source = await readFile(sourcePath, "utf8");
const parserSource = await readFile(resolve(root, "shared/quick-add-parser.ts"), "utf8");
const dbSource = await readFile(resolve(root, "electron/db.ts"), "utf8");
const parserCompiled = ts.transpileModule(parserSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const parserUrl = `data:text/javascript;base64,${Buffer.from(parserCompiled).toString("base64")}`;
const compiled = ts.transpileModule(source.replace('../../shared/quick-add-parser', parserUrl), {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { isTaskOverdue, sortCompletedTasksByRecency, sortTasksByTimeline } = await import(moduleUrl);

const tasks = [
  task("old-due-new-completed", {
    dueTime: "2026-05-01T09:00:00.000Z",
    completedAt: "2026-05-20T08:00:00.000Z",
    updatedAt: "2026-05-20T08:00:00.000Z",
  }),
  task("new-due-old-completed", {
    dueTime: "2026-05-20T09:00:00.000Z",
    completedAt: "2026-05-18T08:00:00.000Z",
    updatedAt: "2026-05-18T08:00:00.000Z",
  }),
  task("fallback-updated", {
    completedAt: null,
    updatedAt: "2026-05-19T08:00:00.000Z",
  }),
];

assert.deepEqual(
  sortCompletedTasksByRecency(tasks).map((item) => item.localId),
  ["old-due-new-completed", "fallback-updated", "new-due-old-completed"],
);

const timelineTasks = [
  task("tomorrow-early", {
    status: "todo",
    dueTime: "2026-05-21T01:00:00.000Z",
    updatedAt: "2026-05-20T07:00:00.000Z",
  }),
  task("yesterday-late", {
    status: "todo",
    dueTime: "2026-05-19T23:00:00.000Z",
    updatedAt: "2026-05-20T07:00:00.000Z",
  }),
  task("today-upcoming", {
    status: "todo",
    dueTime: "2026-05-20T09:00:00.000Z",
    updatedAt: "2026-05-20T07:00:00.000Z",
  }),
  task("planned-today", {
    status: "todo",
    plannedDate: "2026-05-20",
    updatedAt: "2026-05-20T07:00:00.000Z",
  }),
  task("completed-newest", {
    status: "completed",
    dueTime: "2026-05-19T09:00:00.000Z",
    completedAt: "2026-05-20T07:30:00.000Z",
    updatedAt: "2026-05-20T07:30:00.000Z",
  }),
];

assert.deepEqual(
  sortTasksByTimeline(timelineTasks, {
    now: new Date("2026-05-20T08:00:00.000Z"),
    displayTimeZone: "Asia/Shanghai",
  }).map((item) => item.localId),
  ["yesterday-late", "today-upcoming", "tomorrow-early", "planned-today", "completed-newest"],
);
assert.equal(isTaskOverdue(timelineTasks[1], new Date("2026-05-20T08:00:00.000Z")), true);
assert.equal(isTaskOverdue(timelineTasks[0], new Date("2026-05-20T08:00:00.000Z")), false);
assert.equal(
  isTaskOverdue(
    task("same-day-morning-upcoming", {
      status: "todo",
      dueTime: "2026-05-20T00:00:00.000Z",
    }),
    new Date("2026-05-19T19:00:00.000Z"),
  ),
  false,
);
assert.equal(
  isTaskOverdue(
    task("legacy-zone-less-8am-upcoming", {
      status: "todo",
      dueTime: "2026-05-21T00:00:00",
    }),
    new Date("2026-05-20T19:42:00.000Z"),
    "Asia/Shanghai",
  ),
  false,
);
assert.equal(
  isTaskOverdue(
    task("legacy-zone-less-10am-upcoming", {
      status: "todo",
      dueTime: "2026-05-21T02:00:00",
    }),
    new Date("2026-05-20T19:42:00.000Z"),
    "Asia/Shanghai",
  ),
  false,
);

const completedRecencySqlCount = (
  dbSource.match(/CASE WHEN status = 'completed' THEN COALESCE\(datetime\(completed_at\)/g) ?? []
).length;
assert.ok(completedRecencySqlCount >= 3, "Electron task queries should sort completed tasks by completion recency");
const todayTaskQuery = dbSource.slice(
  dbSource.indexOf("export function listTodayTasks"),
  dbSource.indexOf("export function listTodayFloatingTasks"),
);
assert.match(
  todayTaskQuery,
  /status != 'completed' AND due_time IS NOT NULL AND datetime\(due_time\) < datetime\(@nowTime\)/,
  "Desktop today tasks should include overdue open tasks by full due date-time",
);

console.log("task-order timeline check passed");

function task(localId, overrides = {}) {
  return {
    localId,
    serverId: null,
    title: localId,
    content: null,
    status: "completed",
    priority: 0,
    tag: null,
    project: null,
    listType: "inbox",
    dueTime: null,
    remindTime: null,
    repeatRule: null,
    plannedDate: null,
    completedAt: null,
    snoozedUntil: null,
    parentServerId: null,
    checklistJson: "[]",
    isTemplate: false,
    templateName: null,
    sortOrder: 0,
    version: 0,
    isDeleted: false,
    syncStatus: "synced",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    lastSyncAt: null,
    ...overrides,
  };
}
