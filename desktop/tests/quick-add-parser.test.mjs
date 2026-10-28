import assert from "node:assert/strict";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { localDateAfterDays, parseQuickTask } = await loadTsModule("common/quick-add-parser.ts");

test("quick add parser extracts project shorthand without polluting title", () => {
  const parsed = parseQuickTask(
    "明天 9 write launch notes @Growth #release P3",
    new Date("2026-05-20T06:50:00.000Z"),
    "Asia/Shanghai",
  );

  assert.equal(parsed.title, "write launch notes");
  assert.equal(parsed.project, "Growth");
  assert.equal(parsed.tag, "release");
  assert.equal(parsed.priority, 3);
  assert.equal(parsed.plannedDate, "2026-05-21");
  assert.equal(parsed.dueTime, "2026-05-21T01:00:00.000Z");
});

test("quick add parser keeps ordinary quantities in plain titles", () => {
  const parsed = parseQuickTask(
    "购买 2 个苹果",
    new Date("2026-05-20T06:50:00.000Z"),
    "Asia/Shanghai",
  );

  assert.equal(parsed.title, "购买 2 个苹果");
  assert.equal(parsed.dueTime, null);
});

test("calendar-day shifts remain tomorrow across a daylight-saving fallback", () => {
  assert.equal(
    localDateAfterDays(new Date("2026-11-01T07:30:00.000Z"), 1, "America/Los_Angeles"),
    "2026-11-02",
  );
});

test("quick add preserves complete clock minutes before the task title", () => {
  const now = new Date("2026-05-20T00:00:00.000Z");
  for (const [input, title, dueTime] of [
    ["09:30 meeting", "meeting", "2026-05-20T01:30:00.000Z"],
    ["Meet 09:30 planning", "Meet planning", "2026-05-20T01:30:00.000Z"],
    ["明天09:30 开会", "开会", "2026-05-21T01:30:00.000Z"],
    ["明天 09:30 开会", "开会", "2026-05-21T01:30:00.000Z"],
  ]) {
    const parsed = parseQuickTask(input, now, "Asia/Shanghai");
    assert.equal(parsed.title, title, input);
    assert.equal(parsed.dueTime, dueTime, input);
  }
});

test("quick add retains trailing quantities without explicit time markers", () => {
  for (const title of ["苹果数量 2", "report 8", "release 16", "购买 2 个苹果"]) {
    const parsed = parseQuickTask(title, new Date("2026-05-20T06:50:00.000Z"), "Asia/Shanghai");
    assert.equal(parsed.title, title);
    assert.equal(parsed.dueTime, null);
    assert.equal(parsed.plannedDate, null);
  }
});

test("quick add recognizes period and clock markers without relying on bare numbers", () => {
  const now = new Date("2026-05-20T00:00:00.000Z");
  for (const input of ["下午3 开会", "下午3点 开会", "开会 下午3点"]) {
    const parsed = parseQuickTask(input, now, "Asia/Shanghai");
    assert.equal(parsed.title, "开会", input);
    assert.equal(parsed.dueTime, "2026-05-20T07:00:00.000Z", input);
  }
});
