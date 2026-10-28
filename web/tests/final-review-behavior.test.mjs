import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, descendants, nextTurn } from "./helpers/app-harness.mjs";

for (const status of ["completed", "done"]) {
  test(`${status} tasks render undo completion without open-task scheduling actions`, () => {
    const harness = createAppHarness();
    harness.context.task = { id: 12, title: "Already finished", status, is_deleted: false };
    const item = harness.run("renderTaskItem(task)");
    const controls = descendants(item).filter((node) => node.dataset.taskAction);
    assert.ok(controls.some((node) => node.dataset.taskAction === "undo-complete"));
    assert.ok(controls.find((node) => node.dataset.taskAction === "undo-complete").getAttribute("aria-label").includes("Already finished"));
    for (const action of ["complete", "plan-today", "plan-tomorrow", "snooze-later"]) {
      assert.ok(!controls.some((node) => node.dataset.taskAction === action), `${status} must not offer ${action}`);
    }
    assert.ok(descendants(item).some((node) => node.classList.contains("badge-success")));
  });
}

for (const [filter, field] of [["projectFilter", "project"], ["tagFilter", "tag"]]) {
  test(`editing the last matching ${field} preserves its selected filter until the user clears it`, async () => {
    const harness = createAppHarness();
    Object.assign(harness.state, { user: { id: 1 }, offlineMode: true, view: "", [filter]: "Work" });
    harness.context.cachedTasks = [{ id: 1, title: "Move this task", status: "pending", [field]: "Work" }];
    harness.run(`
      readCachedTaskView = async (viewContext, includeMeta = true) => readTaskWindow(cachedTasks, viewContext, includeMeta);
      readOfflineMeta = async () => true;
      countOfflineQueue = async () => 0;
      scheduleTaskNotifications = async () => {};
      render = () => renderTaskMetaFilters();
      renderActiveTaskFilters = () => {};
      bindEvents();
    `);
    await harness.run("hydrateCachedTasks()");
    assert.equal(harness.state.tasks.length, 1);
    assert.equal(harness.nodes[filter].value, "Work");

    harness.context.cachedTasks = [{ id: 1, title: "Move this task", status: "pending", [field]: "Personal" }];
    await harness.run("hydrateCachedTasks()");
    assert.equal(harness.state.tasks.length, 0);
    assert.equal(harness.state[filter], "Work", "rendering must not silently change the active filter");
    assert.equal(harness.nodes[filter].value, "Work");
    assert.ok(harness.nodes[filter].children.some((option) => option.value === "Work"));

    harness.nodes[filter].value = "";
    await harness.dispatch(harness.nodes[filter], "change");
    await nextTurn();
    assert.equal(harness.state[filter], "");
    assert.equal(harness.state.tasks.length, 1);
    assert.equal(harness.state.tasks[0][field], "Personal");
    assert.ok(!harness.nodes[filter].children.some((option) => option.value === "Work"));
  });
}

for (const online of [true, false]) {
  for (const status of [401, 403]) {
    test(`HTTP ${status} stays an account error when navigator.onLine is ${online}`, () => {
      const harness = createAppHarness();
      harness.context.navigator.onLine = online;
      harness.context.status = status;
      assert.equal(
        harness.run('normalizeAuthError(new ApiError("Account denied", status))'),
        harness.run(`t("${status === 401 ? "error.authInvalidCredentials" : "error.authForbidden"}")`),
      );
    });
  }
  for (const status of [404, 500, 503]) {
    test(`HTTP ${status} offers deployment or availability guidance when navigator.onLine is ${online}`, () => {
      const harness = createAppHarness();
      harness.context.navigator.onLine = online;
      harness.context.status = status;
      assert.equal(
        harness.run('normalizeAuthError(new ApiError("Service unavailable", status))'),
        harness.run(`t("${status === 404 ? "error.loginServiceNotFound" : "error.serverUnavailableWithLocalData"}")`),
      );
    });
  }
  test(`network errors offer network or administrator guidance when navigator.onLine is ${online}`, () => {
    const harness = createAppHarness();
    harness.context.navigator.onLine = online;
    assert.equal(harness.run('normalizeAuthError(new TypeError("Failed to fetch"))'), harness.run('t("error.connectionServiceUnavailable")'));
  });
}

function settingsHarness() {
  const harness = createAppHarness();
  const { nodes, document } = harness;
  nodes.settingsSupportPanel.hidden = true;
  nodes.settingsSupportBackdrop.hidden = true;
  nodes.confirmDialog.hidden = true;
  const first = document.createElement("button");
  const last = document.createElement("button");
  nodes.settingsSupportPanel.append(first, last);
  harness.run("bindEvents()");
  return { ...harness, first, last };
}

test("Shift+Tab from the newly opened settings panel stays inside the dialog", async () => {
  const harness = settingsHarness();
  harness.nodes.settingsSupportButton.focus();
  harness.run("openSettingsSupportPanel()");
  harness.flushAnimationFrames();
  const event = await harness.dispatch(harness.document, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.document.activeElement, harness.last);
});

test("settings focus boundaries wrap and Escape returns to the entry control", async () => {
  const harness = settingsHarness();
  harness.nodes.settingsSupportButton.focus();
  harness.run("openSettingsSupportPanel()");
  harness.flushAnimationFrames();
  harness.last.focus();
  await harness.dispatch(harness.document, "keydown", { key: "Tab", shiftKey: false });
  assert.equal(harness.document.activeElement, harness.first);
  harness.first.focus();
  await harness.dispatch(harness.document, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(harness.document.activeElement, harness.last);
  await harness.dispatch(harness.document, "keydown", { key: "Escape" });
  harness.flushAnimationFrames();
  assert.equal(harness.nodes.settingsSupportPanel.hidden, true);
  assert.equal(harness.document.activeElement, harness.nodes.settingsSupportButton);
});

test("closing settings opened from sync details returns focus to the sync entry", async () => {
  const harness = settingsHarness();
  harness.nodes.openSyncSupportButton.focus();
  harness.run("openSyncSupportPanel()");
  harness.flushAnimationFrames();
  assert.equal(harness.nodes.supportDataTools.open, true);
  assert.equal(harness.nodes.settingsSupportPanel.hidden, false);
  await harness.dispatch(harness.nodes.settingsSupportCloseButton, "click");
  harness.flushAnimationFrames();
  assert.equal(harness.document.activeElement, harness.nodes.openSyncSupportButton);
});


test("settings reverse tab skips controls inside collapsed details even when they have layout rectangles", async () => {
  const harness = settingsHarness();
  const details = harness.document.createElement("details");
  const summary = harness.document.createElement("summary");
  const hiddenButton = harness.document.createElement("button");
  details.open = false;
  details.append(summary, hiddenButton);
  harness.nodes.settingsSupportPanel.appendChild(details);
  assert.equal(hiddenButton.getClientRects().length, 1, "Chromium can report geometry for collapsed details content");
  harness.nodes.settingsSupportButton.focus();
  harness.run("openSettingsSupportPanel()");
  harness.flushAnimationFrames();
  await harness.dispatch(harness.document, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(harness.document.activeElement, summary);
});
