import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { isValidCalendarDate } = await loadTsModule("common/workspace-view-state.ts");

async function harness() {
  const globals = { props: { busy: false }, date: { value: "2026-10-10" }, invalidDate: { value: false }, priority: { value: "" }, calls: [], isValidCalendarDate };
  globals.emit = (...args) => globals.calls.push(args);
  const functions = await loadTsFunctions("renderer/components/TaskBatchSchedule.vue", ["submitDate", "submitPriority"], globals);
  return { ...functions, globals };
}

test("invalid calendar dates show a local error without emitting or clearing the input", async () => {
  const h = await harness();
  h.globals.date.value = "2026-02-29";
  h.submitDate();
  assert.equal(h.globals.invalidDate.value, true);
  assert.equal(h.globals.date.value, "2026-02-29");
  assert.deepEqual(h.globals.calls, []);
  h.globals.date.value = "2028-02-29";
  h.submitDate();
  assert.equal(h.globals.invalidDate.value, false);
  assert.deepEqual(h.globals.calls, [["reschedule", "2028-02-29"]]);
});

test("a busy batch cannot emit another schedule or priority mutation", async () => {
  const h = await harness();
  h.globals.props.busy = true;
  h.globals.priority.value = 5;
  h.submitDate();
  h.submitPriority();
  assert.deepEqual(h.globals.calls, []);
});

test("batch priority input requires a choice and supports all six existing levels", async () => {
  const h = await harness();
  h.submitPriority();
  assert.equal(h.globals.calls.length, 0);
  for (let priority = 0; priority <= 5; priority += 1) {
    h.globals.priority.value = priority;
    h.submitPriority();
  }
  assert.deepEqual(h.globals.calls, Array.from({ length: 6 }, (_, priority) => ["setPriority", priority]));
});
