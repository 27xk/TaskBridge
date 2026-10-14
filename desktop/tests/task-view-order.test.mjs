import assert from "node:assert/strict";
import test from "node:test";
import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";

const { sortTasksBySchedule, groupTasksByCategory } = loadElectronModule("src/utils/task-view-order.ts");
const task = (id, fields = {}) => ({ id, dueTime: null, plannedDate: null, createdAt: "2026-10-01T00:00:00Z", tag: null, ...fields });

test("planned days and deadlines are sorted on a shared timeline", () => {
  const tasks = [
    task("late", { dueTime: "2026-10-15T11:00:00Z" }),
    task("planned", { plannedDate: "2026-10-14" }),
    task("early", { dueTime: "2026-10-14T02:00:00Z" }),
    task("undated"),
  ];
  assert.deepEqual(sortTasksBySchedule(tasks, "Asia/Shanghai").map(entry => entry.id), ["planned", "early", "late", "undated"]);
  assert.deepEqual(tasks.map(entry => entry.id), ["late", "planned", "early", "undated"]);
});

test("calendar planning respects the selected time zone and daylight saving", () => {
  const tasks = [task("deadline", { dueTime: "2026-03-08T06:00:00Z" }), task("planned", { plannedDate: "2026-03-08" })];
  assert.deepEqual(sortTasksBySchedule(tasks, "America/New_York").map(entry => entry.id), ["planned", "deadline"]);
  assert.deepEqual(sortTasksBySchedule(tasks, "America/Los_Angeles").map(entry => entry.id), ["deadline", "planned"]);
});

test("invalid schedules remain visible and ties retain stable creation order", () => {
  const tasks = [task("invalid", { dueTime: "invalid", plannedDate: "2026-02-30" }), task("older", { createdAt: "2026-09-01T00:00:00Z" }), task("valid", { dueTime: "2026-10-14T02:00:00Z" })];
  assert.deepEqual(sortTasksBySchedule(tasks).map(entry => entry.id), ["valid", "older", "invalid"]);
});

test("category grouping preserves timeline order and puts uncategorized tasks last", () => {
  const tasks = sortTasksBySchedule([
    task("late-A", { tag: "分类2", dueTime: "2026-10-15T00:00:00Z" }),
    task("early-B", { tag: "分类10", dueTime: "2026-10-12T00:00:00Z" }),
    task("none", { dueTime: "2026-10-13T00:00:00Z" }),
    task("early-A", { tag: "分类2", dueTime: "2026-10-14T00:00:00Z" }),
  ]);
  const groups = groupTasksByCategory(tasks);
  assert.deepEqual(groups.map(group => group.category), ["分类2", "分类10", ""]);
  assert.deepEqual(groups[0].tasks.map(entry => entry.id), ["early-A", "late-A"]);
});
