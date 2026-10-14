import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const {
  createWorkspaceViewState,
  normalizeTaskViewCriteria,
  readWorkspaceViewState,
  writeWorkspaceViewState,
  workspaceViewStorageKey,
  createSavedTaskView,
  calendarWeekBounds,
  isValidCalendarDate,
  matchesTaskView,
} = await loadTsModule("shared/workspace-view-state.ts");
const { todayLocalDate } = await loadTsModule("shared/quick-add-parser.ts");

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

const task = { title: "Review release", content: "Check desktop", project: "TaskBridge", tag: "review", priority: 3, listType: "inbox", syncStatus: "synced", isTemplate: false, isDeleted: false };
const context = { today: "2026-10-10", taskDate: "2026-10-05", completed: false, overdue: false };
const criteria = (changes = {}) => ({ ...normalizeTaskViewCriteria(changes), scrollTop: changes.scrollTop ?? 0 });

test("persists search, combined filters and both scroll positions for the same workspace", () => {
  const storage = memoryStorage();
  const state = createWorkspaceViewState();
  state.taskView = criteria({ search: "release", filter: "week", project: "TaskBridge", tag: "review", status: "open", priority: 3, scrollTop: 812 });
  state.todayScrollTop = 322;
  state.savedViews = [createSavedTaskView("本周高优先级", state.taskView, [], "saved-1")];
  assert.equal(writeWorkspaceViewState(storage, "https://one.test|1", state), true);
  assert.deepEqual(readWorkspaceViewState(storage, "https://one.test|1"), state);
  assert.deepEqual(readWorkspaceViewState(storage, "https://one.test|2"), createWorkspaceViewState());
  assert.deepEqual(readWorkspaceViewState(storage, "https://two.test|1"), createWorkspaceViewState());
});

test("never creates an anonymous shared workspace storage entry", () => {
  const storage = memoryStorage();
  assert.equal(writeWorkspaceViewState(storage, null, createWorkspaceViewState()), false);
  assert.deepEqual(readWorkspaceViewState(storage, null), createWorkspaceViewState());
  assert.equal(storage.data.size, 0);
});

test("rejects a copied envelope belonging to a different workspace", () => {
  const storage = memoryStorage();
  const state = createWorkspaceViewState();
  state.taskView.search = "private search";
  writeWorkspaceViewState(storage, "account-a", state);
  storage.setItem(workspaceViewStorageKey("account-b"), storage.getItem(workspaceViewStorageKey("account-a")));
  assert.deepEqual(readWorkspaceViewState(storage, "account-b"), createWorkspaceViewState());
});

test("recovers safely from malformed storage and unavailable storage", () => {
  const storage = memoryStorage();
  storage.setItem(workspaceViewStorageKey("account-a"), "{invalid");
  assert.deepEqual(readWorkspaceViewState(storage, "account-a"), createWorkspaceViewState());
  const unavailable = { getItem() { throw new Error("unavailable"); }, setItem() { throw new Error("quota"); } };
  assert.deepEqual(readWorkspaceViewState(unavailable, "account-a"), createWorkspaceViewState());
  assert.equal(writeWorkspaceViewState(unavailable, "account-a", createWorkspaceViewState()), false);
});

test("validates persisted criteria and does not reuse mutable defaults", () => {
  assert.deepEqual(normalizeTaskViewCriteria({ search: 2, filter: "unknown", project: false, tag: null, priority: 100, status: "unknown" }), {
    search: "", filter: "all", project: "", tag: "", priority: "all", status: "all",
    lists: [], statuses: [], categories: [], projects: [], priorities: [], sortMode: "time",
  });
  const first = createWorkspaceViewState();
  first.taskView.search = "changed";
  first.savedViews.push({});
  assert.equal(createWorkspaceViewState().taskView.search, "");
  assert.equal(createWorkspaceViewState().savedViews.length, 0);
});

test("saved views capture criteria without storing scroll or fixed calendar dates", () => {
  const current = criteria({ filter: "week", status: "open", priority: 3, scrollTop: 100 });
  const saved = createSavedTaskView("  本周重点  ", current, [], "saved-1");
  current.priority = 0;
  assert.deepEqual(saved, { id: "saved-1", name: "本周重点", criteria: normalizeTaskViewCriteria({ filter: "week", priority: 3, status: "open" }) });
});

test("rejects empty and duplicate saved names without replacing the original view", () => {
  const existing = [createSavedTaskView("Weekly", criteria({ filter: "week" }), [], "one")];
  assert.throws(() => createSavedTaskView(" weekly ", criteria(), existing, "two"), /view-name-duplicate/);
  assert.throws(() => createSavedTaskView("  ", criteria(), [], "two"), /view-name-empty/);
  assert.throws(() => createSavedTaskView("x".repeat(61), criteria(), [], "two"), /view-name-too-long/);
  assert.equal(existing[0].criteria.filter, "week");
});

test("calendar week runs Monday to Sunday including past days in the same week", () => {
  assert.deepEqual(calendarWeekBounds("2026-10-10"), { start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(calendarWeekBounds("2026-10-11"), { start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(calendarWeekBounds("2026-10-12"), { start: "2026-10-12", end: "2026-10-18" });
  assert.deepEqual(calendarWeekBounds("2027-01-01"), { start: "2026-12-28", end: "2027-01-03" });
});

test("week boundaries follow the user's time zone when Sunday and Monday differ", () => {
  const instant = new Date("2026-10-11T17:00:00Z");
  assert.equal(calendarWeekBounds(todayLocalDate(instant, "Asia/Shanghai")).start, "2026-10-12");
  assert.equal(calendarWeekBounds(todayLocalDate(instant, "America/Los_Angeles")).start, "2026-10-05");
});

test("this-week high-priority open view combines every saved condition", () => {
  const view = criteria({ filter: "week", priority: "high", status: "open", project: "TaskBridge", tag: "review", search: "desktop" });
  assert.equal(matchesTaskView(task, view, context), true);
  assert.equal(matchesTaskView({ ...task, priority: 5 }, view, context), true);
  assert.equal(matchesTaskView({ ...task, priority: 2 }, view, context), false);
  assert.equal(matchesTaskView({ ...task, project: "Other" }, view, context), false);
  assert.equal(matchesTaskView(task, view, { ...context, completed: true }), false);
  assert.equal(matchesTaskView(task, view, { ...context, taskDate: "2026-10-12" }), false);
  assert.equal(matchesTaskView(task, view, { ...context, taskDate: "2026-10-04" }), false);
  assert.equal(matchesTaskView(task, view, { ...context, taskDate: null }), false);
});

test("project open view excludes completed tasks while retaining undated work", () => {
  const view = criteria({ project: "TaskBridge", status: "open" });
  assert.equal(matchesTaskView(task, view, { ...context, taskDate: null }), true);
  assert.equal(matchesTaskView(task, view, { ...context, completed: true }), false);
  assert.equal(matchesTaskView({ ...task, project: "Other" }, view, context), false);
});

test("strict calendar validation rejects rollover dates and allows leap days", () => {
  for (const value of ["", "2026-02-29", "2026-04-31", "2026-13-01", "2026-01-00", "2026-1-1", "0000-01-01", "2026-10-10T12:00"]) {
    assert.equal(isValidCalendarDate(value), false, value);
  }
  for (const value of ["2028-02-29", "2026-10-10", "2000-02-29", "0099-01-01"]) {
    assert.equal(isValidCalendarDate(value), true, value);
  }
});

test("exact priority filters preserve all six levels while the high group includes three levels", () => {
  for (let priority = 0; priority <= 5; priority += 1) {
    assert.equal(normalizeTaskViewCriteria({ priority }).priority, priority);
    assert.equal(matchesTaskView({ ...task, priority }, criteria({ priority }), context), true);
    assert.equal(matchesTaskView({ ...task, priority: (priority + 1) % 6 }, criteria({ priority }), context), false);
  }
  assert.equal(normalizeTaskViewCriteria({ priority: "high" }).priority, "high");
  for (let priority = 0; priority <= 5; priority += 1) {
    assert.equal(matchesTaskView({ ...task, priority }, criteria({ priority: "high" }), context), priority >= 3);
  }
});

test("legacy single filters migrate into independent multi-select dimensions", () => {
  const legacy = normalizeTaskViewCriteria({ filter: "week", project: "TaskBridge", tag: "release", priority: "high", status: "completed" });
  assert.deepEqual(legacy.lists, ["week"]);
  assert.deepEqual(legacy.projects, ["TaskBridge"]);
  assert.deepEqual(legacy.categories, ["release"]);
  assert.deepEqual(legacy.priorities, ["high"]);
  assert.deepEqual(legacy.statuses, ["completed"]);
  assert.equal(legacy.sortMode, "time");
  assert.deepEqual(normalizeTaskViewCriteria({ filter: "inbox" }).statuses, ["open"]);
  assert.deepEqual(normalizeTaskViewCriteria({ filter: "completed", status: "open" }).statuses, ["open"], "an explicit status replaces the old completed preset instead of creating an impossible intersection");
});

test("explicit multi-select arrays replace stale single filters and validate stored values", () => {
  const selected = normalizeTaskViewCriteria({
    filter: "completed", project: "Old", tag: "old", priority: "high", status: "open",
    lists: ["week", "today", "week", "invalid"], statuses: ["completed", "invalid", "completed"],
    categories: ["", "release", "release", 3], projects: [], priorities: [0, 5, 8, "high", "all", 5], sortMode: "category",
  });
  assert.deepEqual(selected.lists, ["week", "today"]);
  assert.deepEqual(selected.statuses, ["completed"]);
  assert.deepEqual(selected.categories, ["", "release"]);
  assert.deepEqual(selected.projects, []);
  assert.deepEqual(selected.priorities, [0, 5, "high"]);
  assert.equal(selected.sortMode, "category");
  const cleared = normalizeTaskViewCriteria({ ...selected, lists: [], statuses: [], categories: [], priorities: [] });
  assert.equal(matchesTaskView(task, cleared, context), true, "clearing arrays must not reactivate legacy filters");
  assert.equal(normalizeTaskViewCriteria({ sortMode: "invalid" }).sortMode, "time");
});

test("multiple options union within a dimension and intersect across dimensions", () => {
  const selected = criteria({ lists: ["week", "today"], statuses: ["open", "completed"], projects: ["TaskBridge", "Other"], categories: ["review", "release"], priorities: [0, "high"] });
  assert.equal(matchesTaskView(task, selected, context), true);
  assert.equal(matchesTaskView({ ...task, project: "Other", tag: "release", priority: 0 }, selected, { ...context, taskDate: context.today, completed: true }), true);
  assert.equal(matchesTaskView(task, selected, { ...context, taskDate: "2026-10-14" }), false);
  assert.equal(matchesTaskView({ ...task, project: "Excluded" }, selected, context), false);
  assert.equal(matchesTaskView({ ...task, tag: "excluded" }, selected, context), false);
  assert.equal(matchesTaskView({ ...task, priority: 2 }, selected, context), false);
});

test("week and completed status work together without old completed or inbox status restrictions", () => {
  const selected = criteria({ filter: "inbox", lists: ["week"], statuses: ["completed"] });
  assert.equal(matchesTaskView(task, selected, { ...context, completed: true }), true);
  assert.equal(matchesTaskView(task, selected, context), false);
  assert.equal(matchesTaskView(task, selected, { ...context, completed: true, taskDate: "2026-10-12" }), false);
});

test("unclassified tasks and overdue tasks can be selected explicitly", () => {
  const selected = criteria({ lists: ["overdue"], categories: [""] });
  assert.equal(matchesTaskView({ ...task, tag: null }, selected, { ...context, overdue: true }), true);
  assert.equal(matchesTaskView({ ...task, tag: "" }, selected, { ...context, overdue: true }), true);
  assert.equal(matchesTaskView(task, selected, { ...context, overdue: true }), false);
  assert.equal(matchesTaskView({ ...task, tag: null }, selected, context), false);
});

test("trash can union with active lists without matching unrelated deleted tasks", () => {
  const selected = criteria({ lists: ["today", "trash"] });
  assert.equal(matchesTaskView({ ...task, isDeleted: true }, selected, context), true);
  assert.equal(matchesTaskView(task, selected, { ...context, taskDate: context.today }), true);
  assert.equal(matchesTaskView(task, selected, context), false);
  assert.equal(matchesTaskView({ ...task, isDeleted: true }, criteria({ lists: ["week"] }), context), false);
});

test("version one saved views migrate and round-trip selections without sharing mutable arrays", () => {
  const storage = memoryStorage();
  storage.setItem(workspaceViewStorageKey("old-account"), JSON.stringify({
    version: 1, workspaceKey: "old-account", taskView: { filter: "week", status: "completed", tag: "release", scrollTop: 80 },
    savedViews: [{ id: "legacy", name: "旧视图", criteria: { filter: "high", project: "TaskBridge" } }],
  }));
  const restored = readWorkspaceViewState(storage, "old-account");
  assert.deepEqual(restored.taskView.lists, ["week"]);
  assert.deepEqual(restored.taskView.statuses, ["completed"]);
  assert.equal(restored.taskView.scrollTop, 80);
  assert.deepEqual(restored.savedViews[0].criteria.priorities, ["high"]);
  assert.deepEqual(restored.savedViews[0].criteria.statuses, ["open"]);
  const saved = createSavedTaskView("新视图", restored.taskView, restored.savedViews, "new");
  restored.taskView.categories.push("changed");
  assert.deepEqual(saved.criteria.categories, ["release"]);
  restored.taskView.sortMode = "category";
  restored.savedViews.push(saved);
  assert.equal(writeWorkspaceViewState(storage, "old-account", restored), true);
  assert.deepEqual(readWorkspaceViewState(storage, "old-account"), {
    ...restored,
    taskView: { ...normalizeTaskViewCriteria(restored.taskView), scrollTop: restored.taskView.scrollTop },
  });
  assert.deepEqual(readWorkspaceViewState(storage, "other-account"), createWorkspaceViewState());
  const other = createWorkspaceViewState();
  other.taskView.lists.push("today");
  assert.deepEqual(createWorkspaceViewState().taskView.lists, []);
});
