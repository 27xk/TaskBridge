import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPinia } from "pinia";
import { reactive } from "vue";
import { compileTsModule } from "./helpers/load-ts-module.mjs";

const stateModule = await compileTsModule("common/workspace-view-state.ts");
const storeModule = await compileTsModule("renderer/stores/workspace.ts", { resolvePackagesFromProject: true });
const compiled = await readFile(storeModule.modulePath, "utf8");
await writeFile(storeModule.modulePath, compiled
  .replace('import { useAuthStore } from "./auth";', 'const useAuthStore = () => globalThis.__workspaceStoreTestAuth;')
  .replace('"../../common/workspace-view-state"', JSON.stringify(pathToFileURL(stateModule.modulePath).href)), "utf8");
const { useWorkspaceStore } = await import(pathToFileURL(storeModule.modulePath).href);
after(async () => { await Promise.all([stateModule.cleanup(), storeModule.cleanup()]); });

function memoryStorage() {
  const data = new Map();
  return { data, failWrites: false, writes: 0,
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { if (this.failWrites) throw new Error("quota"); this.writes += 1; data.set(key, value); },
  };
}

function harness(storage = memoryStorage(), workspaceKey = "workspace-a") {
  const previousWindow = globalThis.window;
  const auth = reactive({ workspaceKey });
  globalThis.window = { localStorage: storage };
  globalThis.__workspaceStoreTestAuth = auth;
  const store = useWorkspaceStore(createPinia());
  delete globalThis.__workspaceStoreTestAuth;
  return { auth, store, storage, dispose() { store.$dispose(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; } };
}

test("actual workspace store switches accounts synchronously without leaking conditions or saved views", () => {
  const h = harness();
  try {
    h.store.taskView.search = "account-a search";
    h.store.toggleTaskViewSelection("projects", "Project A");
    h.store.toggleTaskViewSelection("priorities", 3);
    h.store.rememberScroll("all", 510);
    h.store.rememberScroll("today", 205);
    h.store.saveCurrentView("View A");
    const boundState = h.store.taskView;
    h.auth.workspaceKey = "workspace-b";
    assert.equal(h.store.taskView, boundState, "bindings keep the same reactive state object");
    assert.equal(h.store.taskView.search, "");
    assert.equal(h.store.taskView.scrollTop, 0);
    assert.equal(h.store.todayScrollTop, 0);
    assert.equal(h.store.savedViews.length, 0);
    h.store.taskView.search = "account-b search";
    h.store.saveCurrentView("View B");
    h.auth.workspaceKey = "workspace-a";
    assert.equal(h.store.taskView.search, "account-a search");
    assert.equal(h.store.taskView.project, "Project A");
    assert.equal(h.store.taskView.priority, 3);
    assert.equal(h.store.taskView.scrollTop, 510);
    assert.equal(h.store.todayScrollTop, 205);
    assert.deepEqual(h.store.savedViews.map((view) => view.name), ["View A"]);
    h.auth.workspaceKey = null;
    assert.equal(h.store.taskView.search, "");
    assert.equal(h.store.savedViews.length, 0);
    h.store.taskView.search = "anonymous content";
    h.auth.workspaceKey = "workspace-b";
    assert.equal(h.store.taskView.search, "account-b search");
    assert.deepEqual(h.store.savedViews.map((view) => view.name), ["View B"]);
    assert.equal(h.storage.data.size, 2);
  } finally { h.dispose(); }
});

test("a new store instance restores the last working conditions and saved view after restart", () => {
  const storage = memoryStorage();
  const first = harness(storage);
  first.store.applyTaskView({ filter: "week", status: "open", priority: 3, tag: "release" });
  first.store.rememberScroll("all", 804);
  first.store.rememberScroll("today", 302);
  first.store.saveCurrentView("Weekly release");
  first.dispose();
  const second = harness(storage);
  try {
    assert.equal(second.store.taskView.filter, "week");
    assert.equal(second.store.taskView.status, "open");
    assert.equal(second.store.taskView.priority, 3);
    assert.equal(second.store.taskView.tag, "release");
    assert.equal(second.store.taskView.scrollTop, 804);
    assert.equal(second.store.todayScrollTop, 302);
    second.store.applyTaskView({ search: "temporary" });
    assert.equal(second.store.applySavedView(second.store.savedViews[0].id), true);
    assert.equal(second.store.taskView.filter, "week");
    assert.equal(second.store.taskView.scrollTop, 0);
    assert.equal(second.store.todayScrollTop, 302);
  } finally { second.dispose(); }
});

test("failed saved-view persistence keeps the existing list intact and reports a failure", () => {
  const h = harness();
  try {
    const original = h.store.saveCurrentView("Keep me");
    h.storage.failWrites = true;
    assert.throws(() => h.store.saveCurrentView("Will fail"), /view-storage-unavailable/);
    assert.throws(() => h.store.deleteSavedView(original.id), /view-storage-unavailable/);
    assert.deepEqual(h.store.savedViews.map((view) => view.name), ["Keep me"]);
    assert.equal(h.store.persistenceError, true);
  } finally { h.dispose(); }
});

test("duplicate names cannot silently overwrite filters in an existing saved view", () => {
  const h = harness();
  try {
    h.store.applyTaskView({ filter: "week" });
    h.store.saveCurrentView("Weekly");
    h.store.applyTaskView({ filter: "today" });
    assert.throws(() => h.store.saveCurrentView(" weekly "), /view-name-duplicate/);
    assert.equal(h.store.savedViews[0].criteria.filter, "week");
    h.store.deleteSavedView(h.store.savedViews[0].id);
    assert.equal(h.store.savedViews.length, 0);
    assert.equal(h.store.applySavedView("missing"), false);
  } finally { h.dispose(); }
});

test("scroll bursts debounce writes and workspace switches synchronously flush the final position", async () => {
  const h = harness();
  try {
    for (let position = 1; position <= 80; position += 1) h.store.rememberScroll("all", position);
    assert.equal(h.storage.writes, 0);
    await new Promise((resolve) => setTimeout(resolve, 240));
    assert.equal(h.storage.writes, 1);
    h.store.rememberScroll("all", 450);
    h.auth.workspaceKey = "workspace-b";
    assert.equal(h.storage.writes, 2);
    h.auth.workspaceKey = "workspace-a";
    assert.equal(h.store.taskView.scrollTop, 450);
  } finally { h.dispose(); }
});

test("filter selections toggle independently and allow multiple values", () => {
  const h = harness();
  try {
    h.store.toggleTaskViewSelection("lists", "week");
    h.store.toggleTaskViewSelection("lists", "today");
    h.store.toggleTaskViewSelection("statuses", "open");
    h.store.toggleTaskViewSelection("statuses", "completed");
    h.store.toggleTaskViewSelection("categories", "");
    h.store.toggleTaskViewSelection("categories", "release");
    assert.deepEqual(h.store.taskView.lists, ["week", "today"]);
    assert.deepEqual(h.store.taskView.statuses, ["open", "completed"]);
    assert.deepEqual(h.store.taskView.categories, ["", "release"]);
    h.store.toggleTaskViewSelection("lists", "week");
    h.store.toggleTaskViewSelection("statuses", "completed");
    assert.deepEqual(h.store.taskView.lists, ["today"]);
    assert.deepEqual(h.store.taskView.statuses, ["open"]);
    assert.deepEqual(h.store.taskView.categories, ["", "release"]);
  } finally { h.dispose(); }
});

test("quick presets replace list status and priority restrictions while retaining categories and ordering", () => {
  const h = harness();
  try {
    h.store.applyTaskView({ search: "release", categories: ["review"], projects: ["TaskBridge"], priorities: [0], statuses: ["open"], lists: ["week", "inbox"], sortMode: "category" });
    h.store.setTaskViewFilter("completed");
    assert.deepEqual(h.store.taskView.lists, []);
    assert.deepEqual(h.store.taskView.statuses, ["completed"]);
    assert.deepEqual(h.store.taskView.priorities, []);
    assert.deepEqual(h.store.taskView.categories, ["review"]);
    assert.deepEqual(h.store.taskView.projects, ["TaskBridge"]);
    assert.equal(h.store.taskView.search, "release");
    assert.equal(h.store.taskView.sortMode, "category");
    h.store.toggleTaskViewSelection("lists", "week");
    assert.equal(h.store.taskView.filter, "all", "a multi-select action leaves the legacy quick preset");
    assert.deepEqual(h.store.taskView.statuses, ["completed"]);
    h.store.setTaskViewFilter("all");
    assert.deepEqual(h.store.taskView.lists, []);
    assert.deepEqual(h.store.taskView.statuses, []);
    assert.deepEqual(h.store.taskView.priorities, []);
  } finally { h.dispose(); }
});

test("multi-select saved views retain values after edits and remain isolated between accounts", () => {
  const h = harness();
  try {
    h.store.applyTaskView({ lists: ["week", "today"], statuses: ["completed"], categories: ["", "release"], priorities: [0, 4], sortMode: "category" });
    const saved = h.store.saveCurrentView("Multiple choices");
    h.store.taskView.categories.push("changed");
    assert.deepEqual(saved.criteria.categories, ["", "release"]);
    assert.equal(h.store.applySavedView(saved.id), true);
    assert.deepEqual(h.store.taskView.categories, ["", "release"]);
    h.store.taskView.lists.push("overdue");
    assert.deepEqual(saved.criteria.lists, ["week", "today"]);
    h.auth.workspaceKey = "workspace-b";
    assert.deepEqual(h.store.taskView.lists, []);
    assert.deepEqual(h.store.taskView.categories, []);
    assert.equal(h.store.taskView.sortMode, "time");
    h.auth.workspaceKey = "workspace-a";
    assert.deepEqual(h.store.taskView.lists, ["week", "today", "overdue"]);
    assert.equal(h.store.taskView.sortMode, "category");
    assert.deepEqual(h.store.savedViews[0].criteria.lists, ["week", "today"]);
  } finally { h.dispose(); }
});
