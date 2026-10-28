import assert from "node:assert/strict";
import test from "node:test";
import { assertDesktopDataBudget } from "../scripts/check-desktop-data-budget.mjs";

test("desktop payload budgets reject full-record lists and oversized incremental refreshes", () => {
  const report = { tasks: 10_000, summaryBytes: 9_000_000, fullBytes: 200_000_000, maxPageBytes: 900_000, incrementBytes: 1_200, unchangedBytes: 180 };
  assert.doesNotThrow(() => assertDesktopDataBudget(report));
  assert.throws(() => assertDesktopDataBudget({ ...report, summaryBytes: report.fullBytes }), /12 MiB/);
  assert.throws(() => assertDesktopDataBudget({ ...report, fullBytes: 20_000_000 }), /90%/);
  assert.throws(() => assertDesktopDataBudget({ ...report, maxPageBytes: 2_000_000 }), /page/);
  assert.throws(() => assertDesktopDataBudget({ ...report, incrementBytes: 20_000 }), /changed task/);
  assert.throws(() => assertDesktopDataBudget({ ...report, unchangedBytes: 1_000 }), /unchanged/);
});
