import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";
import { loadElectronModule, MockWindow } from "./helpers/mock-electron-windows.mjs";

function captureHarness() {
  assert.ok(existsSync(resolve(import.meta.dirname, "../electron/quick-capture.ts")), "quick capture must have a shared single-window controller");
  const main = new MockWindow();
  let floating = null;
  let creations = 0;
  const windows = { mainWindow: main, floatingWindow: null };
  const floatingApi = {
    createFloatingWindow() {
      if (!floating || floating.isDestroyed()) {
        floating = new MockWindow();
        windows.floatingWindow = floating;
        creations += 1;
      }
      return floating;
    },
    showFloatingWindow() {
      const window = floatingApi.createFloatingWindow();
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      return true;
    },
  };
  const capture = loadElectronModule("electron/quick-capture.ts", {
    "./floating-window": floatingApi,
    "./state": { windows },
  });
  return { capture, main, windows, floatingApi, get floating() { return floating; }, get creations() { return creations; } };
}

test("disconnected WebSocket status is shown as waiting, not connected", () => {
  const tray = loadElectronModule("electron/tray.ts", {
    electron: {}, "./state": {}, "./floating-window": {}, "./app-icon": {}, "./quick-capture": {}, "./window-layout": {},
  });
  tray.setTraySyncStatus("ws: disconnected");
  assert.equal(tray.getTraySyncStatus(), "等待连接");
  tray.setTraySyncStatus("ws: connected");
  assert.equal(tray.getTraySyncStatus(), "实时连接");
});

test("sync status accepts defined tokens and localized states without substring collisions", async () => {
  assert.ok(existsSync(resolve(import.meta.dirname, "../shared/sync-status.ts")), "sync status must be shared with the renderer");
  const { normalizeSyncStatus, formatSyncStatus } = await loadTsModule("shared/sync-status.ts");
  const cases = [
    ["disconnected", "disconnected", "等待连接", "Waiting"],
    [" WS: DISCONNECTED ", "disconnected", "等待连接", "Waiting"],
    ["ws: connected", "connected", "实时连接", "Connected"],
    ["signed-out", "signed-out", "未登录", "Not signed in"],
    ["unauthenticated", "signed-out", "未登录", "Not signed in"],
    ["同步中", "syncing", "同步中", "Syncing"],
    ["离线", "offline", "离线", "Offline"],
    ["同步异常", "error", "同步异常", "Sync error"],
    ["等待连接", "disconnected", "等待连接", "Waiting"],
    ["idle", "synced", "已同步", "Synced"],
  ];
  for (const [input, normalized, zh, en] of cases) {
    assert.equal(normalizeSyncStatus(input), normalized);
    assert.equal(formatSyncStatus(input), zh);
    assert.equal(formatSyncStatus(input, "en-US"), en);
  }
  for (const input of ["unconnected", "not-connected", "not synced", "unsynced", "unexpected status", undefined]) {
    assert.equal(normalizeSyncStatus(input), "unknown", String(input));
  }
  assert.equal(formatSyncStatus("unexpected status"), "unexpected status");
});

test("global quick add routes only to the floating capture entry without a notification", () => {
  const callbacks = new Map();
  const main = new MockWindow();
  const floating = new MockWindow();
  const notifications = [];
  let captures = 0;
  const shortcuts = loadElectronModule("electron/shortcut.ts", {
    electron: { globalShortcut: { register(key, callback) { callbacks.set(key, callback); return true; }, unregisterAll() {} } },
    "./floating-window": { toggleFloatingWindow() {} },
    "./quick-capture": { openQuickCapture() { captures += 1; } },
    "./notification": { showTaskNotification(...args) { notifications.push(args); } },
    "./state": { windows: { mainWindow: main, floatingWindow: floating }, getSettings: () => ({ language: "zh-CN" }) },
  });
  shortcuts.registerGlobalShortcuts();
  callbacks.get("CommandOrControl+Shift+Space")();
  assert.equal(main.visible, false);
  assert.deepEqual(main.messages, []);
  assert.deepEqual(floating.messages, []);
  assert.equal(captures, 1);
  assert.deepEqual(notifications, []);
});

test("quick capture cold start queues one request until the floating renderer is ready", () => {
  const h = captureHarness();
  h.capture.openQuickCapture();
  h.capture.openQuickCapture();
  assert.equal(h.creations, 1);
  assert.equal(h.floating.visible, true);
  assert.equal(h.main.visible, false);
  assert.deepEqual(h.floating.messages, []);
  h.floating.finishLoading();
  assert.deepEqual(h.floating.messages, [], "page load alone does not guarantee that Vue listeners are attached");
  assert.equal(h.capture.markQuickCaptureReady(h.main.webContents), false);
  assert.equal(h.capture.markQuickCaptureReady(h.floating.webContents), true);
  assert.deepEqual(h.floating.messages, [["taskbridge:quick-add"]]);
  h.capture.markQuickCaptureReady(h.floating.webContents);
  assert.equal(h.floating.messages.length, 1);
});

test("quick capture restores a minimized floating window and survives renderer reload", () => {
  const h = captureHarness();
  const floating = h.floatingApi.createFloatingWindow();
  h.capture.markQuickCaptureReady(floating.webContents);
  floating.minimized = true;
  h.capture.openQuickCapture();
  assert.deepEqual(floating.calls.slice(0, 3), [["restore"], ["show"], ["focus"]]);
  assert.equal(floating.messages.length, 1);
  floating.webContents.loading = true;
  floating.webContents.emit("did-start-loading");
  h.capture.openQuickCapture();
  assert.equal(floating.messages.length, 1);
  floating.finishLoading();
  h.capture.markQuickCaptureReady(floating.webContents);
  assert.equal(floating.messages.length, 2);
});

test("a destroyed floating renderer cannot acknowledge readiness for its replacement", () => {
  const h = captureHarness();
  h.capture.openQuickCapture();
  const oldWindow = h.floating;
  oldWindow.destroy();
  h.capture.openQuickCapture();
  assert.equal(h.creations, 2);
  assert.equal(h.capture.markQuickCaptureReady(oldWindow.webContents), false);
  assert.equal(h.capture.markQuickCaptureReady(h.floating.webContents), true);
  assert.equal(h.floating.messages.length, 1);
  assert.deepEqual(h.main.messages, []);
});
