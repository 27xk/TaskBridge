import assert from "node:assert/strict";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { parseQuickTask } = await loadTsModule("shared/quick-add-parser.ts");

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
