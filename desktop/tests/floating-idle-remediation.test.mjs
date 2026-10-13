import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { createScreen, loadElectronModule, MockWindow } from "./helpers/mock-electron-windows.mjs";

const require = createRequire(import.meta.url);
const vue = require("vue");

function floatingHarness() {
  let time = 0;
  let id = 0;
  const timers = new Map();
  const clock = {
    setTimeout: (callback, delay) => { const key = ++id; timers.set(key, { callback, at: time + delay }); return key; },
    clearTimeout: key => timers.delete(key),
    advance(ms) { time += ms; for (const [key, timer] of [...timers]) if (timer.at <= time) { timers.delete(key); timer.callback(); } },
  };
  const windows = { mainWindow: new MockWindow(), floatingWindow: null, isQuitting: false };
  let bounds = { x: 120, y: 130, width: 320, height: 460 };
  const floating = loadElectronModule("electron/floating-window.ts", {
    electron: { app: { isPackaged: false }, BrowserWindow: MockWindow, screen: createScreen() },
    "./state": { windows, getFloatingOpacity: () => 0.96, getFloatingPosition: () => bounds,
      getFloatingSize: () => bounds, saveFloatingBounds: value => { bounds = value; } },
    "node:fs": { existsSync: () => true },
  }, clock);
  return { floating, windows, clock };
}

test("a hidden floating window ignores refresh notifications and releases its renderer after idle", () => {
  const h = floatingHarness();
  h.floating.showFloatingWindow();
  const first = h.windows.floatingWindow;
  first.finishLoading();
  h.floating.setFloatingDraftDurable(true);
  first.setBounds({ x: 180, y: 190 });
  h.floating.hideFloatingWindow();
  first.messages.length = 0;
  h.floating.notifyFloatingTasksChanged();
  h.floating.notifyFloatingSyncStatusChanged();
  h.clock.advance(200);
  assert.deepEqual(first.messages, [], "hidden renderers should not perform database/status refreshes");
  h.clock.advance(60000);
  assert.equal(first.destroyed, true);
  assert.equal(h.windows.floatingWindow, null);
  assert.equal(h.windows.mainWindow.destroyed, false, "the reminder/sync owner must remain running");
  h.floating.showFloatingWindow();
  assert.notEqual(h.windows.floatingWindow, first);
  assert.deepEqual(h.windows.floatingWindow.getPosition(), [180, 190]);
  h.windows.floatingWindow.destroy();
});

test("reopening during the idle grace period cancels the old destruction timer", () => {
  const h = floatingHarness();
  h.floating.showFloatingWindow();
  const first = h.windows.floatingWindow;
  h.floating.hideFloatingWindow();
  h.clock.advance(30000);
  h.floating.showFloatingWindow();
  h.clock.advance(40000);
  assert.equal(first.destroyed, false);
  assert.equal(first.visible, true);
  first.destroy();
});

test("floating drafts and submission identity survive destruction and remain workspace-scoped", () => {
  assert.ok(existsSync(resolve(import.meta.dirname, "../src/composables/useFloatingCaptureDraft.ts")), "floating capture needs a durable draft");
  const storage = new Map();
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const { useFloatingCaptureDraft } = loadElectronModule("src/composables/useFloatingCaptureDraft.ts", { vue }, { window: { localStorage } });
  const workspace = vue.ref("workspace-a");
  const mount = () => { const scope = vue.effectScope(); const capture = scope.run(() => useFloatingCaptureDraft(() => workspace.value)); return { scope, capture }; };
  const first = mount();
  first.capture.title.value = "An unsaved capture";
  const submitted = first.capture.snapshot();
  first.scope.stop();
  const second = mount();
  assert.equal(second.capture.title.value, "An unsaved capture");
  assert.equal(second.capture.snapshot().submissionId, submitted.submissionId);
  workspace.value = "workspace-b";
  assert.equal(second.capture.title.value, "");
  second.capture.title.value = "Other workspace";
  assert.equal(second.capture.clearIfCurrent(submitted), false);
  workspace.value = "workspace-a";
  assert.equal(second.capture.title.value, "An unsaved capture");
  second.capture.title.value = "Newer input";
  assert.equal(second.capture.clearIfCurrent(submitted), false);
  assert.equal(second.capture.clearIfCurrent(second.capture.snapshot()), true);
  assert.equal(second.capture.title.value, "");
  second.scope.stop();
});

test("a storage failure keeps the hidden renderer and its draft until persistence succeeds", () => {
  const h = floatingHarness();
  h.floating.showFloatingWindow();
  const first = h.windows.floatingWindow;
  const storage = new Map();
  let available = false;
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { if (!available) throw new Error("storage unavailable"); storage.set(key, value); },
    removeItem: key => storage.delete(key),
  };
  const { useFloatingCaptureDraft } = loadElectronModule("src/composables/useFloatingCaptureDraft.ts", { vue }, { window: { localStorage } });
  const workspace = vue.ref("a");
  const scope = vue.effectScope();
  const capture = scope.run(() => useFloatingCaptureDraft(() => workspace.value, safe => h.floating.setFloatingDraftDurable(safe)));
  capture.title.value = "Keep this unsaved draft";
  h.floating.hideFloatingWindow();
  h.clock.advance(61000);
  assert.equal(first.destroyed, false, "an unpersisted draft blocks idle destruction");
  h.floating.showFloatingWindow();
  assert.equal(capture.title.value, "Keep this unsaved draft");
  workspace.value = "b";
  workspace.value = "a";
  assert.equal(capture.title.value, "Keep this unsaved draft", "failed writes survive account switches in memory");
  available = true;
  capture.retryPersistence();
  h.floating.hideFloatingWindow();
  h.clock.advance(61000);
  assert.equal(first.destroyed, true, "a successfully persisted draft permits suspension again");
  scope.stop();
});

test("a failed draft deletion stays pending across workspaces and blocks idle release until retried", () => {
  const h = floatingHarness();
  h.floating.showFloatingWindow();
  const first = h.windows.floatingWindow;
  const storage = new Map();
  let removeAvailable = true;
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => { if (!removeAvailable) throw new Error("storage unavailable"); storage.delete(key); },
  };
  const { useFloatingCaptureDraft } = loadElectronModule("src/composables/useFloatingCaptureDraft.ts", { vue }, { window: { localStorage } });
  const workspace = vue.ref("a");
  const scope = vue.effectScope();
  const capture = scope.run(() => useFloatingCaptureDraft(() => workspace.value, safe => h.floating.setFloatingDraftDurable(safe)));
  capture.title.value = "A draft that was cleared";
  removeAvailable = false;
  capture.title.value = "";
  assert.equal(capture.durable.value, false, "a failed deletion is still an unpersisted draft change");
  workspace.value = "b";
  workspace.value = "a";
  assert.equal(capture.title.value, "", "workspace switches must retain the pending deletion instead of resurrecting storage");
  h.floating.hideFloatingWindow();
  h.clock.advance(61000);
  assert.equal(first.destroyed, false);
  removeAvailable = true;
  capture.retryPersistence();
  assert.equal(capture.durable.value, true);
  assert.equal(storage.size, 0);
  h.clock.advance(61000);
  assert.equal(first.destroyed, true);
  scope.stop();
  const reopenedScope = vue.effectScope();
  const reopened = reopenedScope.run(() => useFloatingCaptureDraft(() => workspace.value));
  assert.equal(reopened.title.value, "");
  reopenedScope.stop();
});
