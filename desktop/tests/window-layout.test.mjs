import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";
import { createScreen, createTimers, loadElectronModule, MockWindow } from "./helpers/mock-electron-windows.mjs";

const initialBounds = { x: 2200, y: 110, width: 1020, height: 720 };
const limits = { minWidth: 760, minHeight: 600 };

function layoutHarness() {
  assert.ok(existsSync(resolve(import.meta.dirname, "../main/window-layout.ts")), "window lifecycle must persist normal bounds independently of maximized state");
  const screen = createScreen();
  const timers = createTimers();
  const layout = loadElectronModule("main/window-layout.ts", { electron: { screen } }, {
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  });
  const window = new MockWindow(initialBounds);
  const saved = [];
  layout.trackWindowLayout(window, { bounds: initialBounds, maximized: false }, limits, (state) => saved.push(state));
  return { layout, screen, timers, window, saved };
}

function floatingHarness() {
  const screen = createScreen();
  const timers = createTimers();
  const values = { floatingX: 2200, floatingY: 110, floatingWidth: 320, floatingHeight: 460, floatingVisibleOnStart: false };
  const windows = { mainWindow: null, floatingWindow: null, isQuitting: false };
  const writes = [];
  const state = {
    windows,
    settingsStore: { get(key) { return values[key]; } },
    getFloatingOpacity: () => 0.96,
    getFloatingPosition: () => ({ x: values.floatingX, y: values.floatingY }),
    getFloatingSize: () => ({ width: values.floatingWidth, height: values.floatingHeight }),
    saveFloatingPosition(x, y) { values.floatingX = x; values.floatingY = y; writes.push({ x, y }); },
    saveFloatingSize(width, height) { values.floatingWidth = width; values.floatingHeight = height; writes.push({ width, height }); return { width, height }; },
    saveFloatingBounds(bounds) {
      Object.assign(values, { floatingX: bounds.x, floatingY: bounds.y, floatingWidth: bounds.width, floatingHeight: bounds.height });
      writes.push({ ...bounds });
    },
    normalizeFloatingSize: (width, height) => ({ width: Math.max(280, Math.min(520, width)), height: Math.max(260, Math.min(720, height)) }),
    setFloatingOpacity(value) { return value; },
  };
  const floating = loadElectronModule("main/floating-window.ts", {
    electron: { app: { isPackaged: false }, BrowserWindow: MockWindow, screen },
    "./state": state,
    "node:fs": { existsSync: () => true },
  }, { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  return { floating, screen, timers, windows, values, writes };
}

test("showing the floating window preserves its last position on the second display", () => {
  const h = floatingHarness();
  h.floating.showFloatingWindow();
  assert.deepEqual(h.windows.floatingWindow.getPosition(), [2200, 110]);
  h.windows.floatingWindow.finishLoading();
  h.floating.hideFloatingWindow();
  h.floating.showFloatingWindow();
  assert.deepEqual(h.windows.floatingWindow.getPosition(), [2200, 110]);
  h.windows.floatingWindow.destroy();
});

test("hidden floating windows do not reappear when their first renderer load completes", () => {
  const h = floatingHarness();
  h.floating.showFloatingWindow();
  h.floating.hideFloatingWindow();
  h.windows.floatingWindow.finishLoading();
  assert.equal(h.windows.floatingWindow.visible, false);
  h.windows.floatingWindow.destroy();
});

test("window bounds stay on the display they overlap and recover from a removed display", async () => {
  assert.ok(existsSync(resolve(import.meta.dirname, "../common/window-layout.ts")), "bounds clamping must be shared and testable without Electron");
  const { clampWindowBounds, normalizeWindowBounds } = await loadTsModule("common/window-layout.ts");
  const screen = createScreen();
  assert.deepEqual(clampWindowBounds(initialBounds, screen.areas, limits), initialBounds);
  assert.deepEqual(clampWindowBounds(initialBounds, [screen.areas[0]], limits), { x: 900, y: 110, width: 1020, height: 720 });
  const left = { x: -1920, y: -200, width: 1920, height: 1040 };
  assert.deepEqual(clampWindowBounds({ x: -2400, y: -120, width: 1000, height: 680 }, [screen.areas[0], left], limits), { x: -1920, y: -120, width: 1000, height: 680 });
  assert.deepEqual(clampWindowBounds({ x: 9000, y: 80, width: 1000, height: 680 }, screen.areas, limits), { x: 2840, y: 80, width: 1000, height: 680 });
  assert.deepEqual(clampWindowBounds({ x: 0, y: 0, width: 1200, height: 900 }, [{ x: 10, y: 20, width: 640, height: 480 }], limits), { x: 10, y: 20, width: 640, height: 480 });
  assert.equal(normalizeWindowBounds({ ...initialBounds, x: NaN }), null);
  assert.equal(normalizeWindowBounds({ ...initialBounds, width: -10 }), null);
  assert.equal(normalizeWindowBounds({ ...initialBounds, y: Infinity }), null);
  assert.equal(normalizeWindowBounds({ width: 1120, height: 760 }), null);
});

test("move and resize events coalesce into one write with the latest normal bounds", () => {
  const h = layoutHarness();
  h.window.setPosition(2280, 120);
  h.window.setSize(1100, 740);
  h.window.setPosition(2340, 140);
  assert.equal(h.saved.length, 0);
  assert.equal(h.timers.size, 1);
  h.timers.tick();
  assert.deepEqual(h.saved, [{ bounds: { x: 2340, y: 140, width: 1100, height: 740 }, maximized: false }]);
  h.window.destroy();
});

test("maximized and minimized events cannot replace ordinary window bounds", () => {
  const h = layoutHarness();
  h.window.maximize();
  h.window.bounds = { x: 1920, y: 0, width: 1920, height: 1040 };
  h.window.emit("resize");
  h.window.minimized = true;
  h.window.maximized = false;
  h.window.bounds = { x: -32000, y: -32000, width: 160, height: 32 };
  h.window.emit("minimize");
  h.window.emit("move");
  h.layout.flushWindowLayouts();
  assert.deepEqual(h.saved.at(-1), { bounds: initialBounds, maximized: true });
  h.window.destroy();
});

test("closing a window flushes pending geometry and removes timers and screen listeners", () => {
  const h = layoutHarness();
  h.window.setPosition(2280, 120);
  h.window.close();
  assert.deepEqual(h.saved.at(-1), { bounds: { ...initialBounds, x: 2280, y: 120 }, maximized: false });
  assert.equal(h.timers.size, 0);
  h.window.destroy();
  assert.equal(h.screen.listenerCount("display-removed"), 0);
  assert.equal(h.screen.listenerCount("display-metrics-changed"), 0);
});

test("removing a display moves a visible floating window into a remaining work area", () => {
  const h = floatingHarness();
  const window = h.floating.createFloatingWindow();
  h.screen.areas = [h.screen.areas[0]];
  h.screen.emit("display-removed");
  assert.deepEqual(window.getBounds(), { x: 1600, y: 110, width: 320, height: 460 });
  h.floating.hideFloatingWindow();
  assert.deepEqual(h.writes.at(-1), window.getBounds());
  window.destroy();
});

async function mainHarness({ saved = { bounds: initialBounds, maximized: true }, hidden = false, gpu = false } = {}) {
  const screen = createScreen();
  const timers = createTimers();
  const created = [];
  const gpuCalls = [];
  const persisted = [];
  const windows = { mainWindow: null, floatingWindow: null, isQuitting: false };
  const app = Object.assign(new EventEmitter(), {
    disableHardwareAcceleration() { gpuCalls.push("hardware"); },
    commandLine: { appendSwitch(value) { gpuCalls.push(value); } },
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    isReady: () => true,
    isPackaged: false,
    setAppUserModelId() {},
    getLoginItemSettings: () => ({ wasOpenedAsHidden: false }),
  });
  class MainWindow extends MockWindow { constructor(options) { super(options); created.push(this); } }
  loadElectronModule("main/main.ts", {
    electron: { app, BrowserWindow: MainWindow, Menu: { setApplicationMenu() {} }, screen },
    "node:fs": { existsSync: () => true },
    "./app-icon": { resolveAppIconPath() {} },
    "./floating-window": { createFloatingWindow() {}, showFloatingWindow() {} },
    "./ipc": { registerIpcHandlers() {} },
    "./notification": { showTaskNotification() {} },
    "./shortcut": { registerGlobalShortcuts() {}, unregisterGlobalShortcuts() {} },
    "./state": {
      windows, getMainWindowState: () => saved, saveMainWindowState: (state) => persisted.push(state),
      consumeSettingsRecoveryNotice: () => null, getSettings: () => ({ language: "zh-CN", floatingVisibleOnStart: false }), hasTokens: () => false,
    },
    "./tray": { createAppTray() {} },
    "./updater": { initializeAutoUpdater() {} },
  }, {
    process: { env: gpu ? { TASKBRIDGE_ENABLE_GPU: "1" } : {}, platform: "win32", argv: hidden ? ["--hidden"] : [] },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  });
  await Promise.resolve();
  return { app, window: created[0], gpuCalls, timers, persisted };
}

test("main window restores stored ordinary bounds and maximized state after renderer readiness", async () => {
  const h = await mainHarness();
  assert.deepEqual(h.window.getBounds(), initialBounds);
  assert.equal(h.window.visible, false);
  h.window.finishLoading();
  assert.equal(h.window.visible, true);
  assert.equal(h.window.maximized, true);
  h.app.emit("before-quit");
  assert.deepEqual(h.persisted.at(-1), { bounds: initialBounds, maximized: true });
  h.window.destroy();
});

test("hidden launch restores saved maximization only when the main window is opened", async () => {
  const h = await mainHarness({ hidden: true });
  h.window.finishLoading();
  assert.equal(h.window.visible, false);
  assert.equal(h.window.maximized, false);
  h.window.show();
  assert.equal(h.window.maximized, true);
  h.window.destroy();
});

test("GPU experiment is opt-in and default startup retains compatibility switches", async () => {
  const compatible = await mainHarness();
  assert.deepEqual(compatible.gpuCalls, ["hardware", "disable-gpu", "disable-gpu-compositing"]);
  compatible.window.destroy();
  const experiment = await mainHarness({ gpu: true });
  assert.deepEqual(experiment.gpuCalls, []);
  experiment.window.destroy();
});

test("floating resize uses the latest dimensions without writing settings on every pointer move", () => {
  const h = floatingHarness();
  const window = h.floating.createFloatingWindow();
  for (let width = 340; width <= 420; width += 10) h.floating.setFloatingWindowSize(width, 540);
  assert.equal(h.writes.length, 0);
  assert.equal(h.timers.size, 1);
  h.timers.tick();
  assert.deepEqual(h.writes, [{ x: 2200, y: 110, width: 420, height: 540 }]);
  assert.equal(h.floating.setFloatingWindowOpacity(0.6), 0.6);
  assert.equal(window.opacity, 0.6);
  window.destroy();
});

test("quitting a hidden login launch retains a saved maximized preference", async () => {
  const h = await mainHarness({ hidden: true });
  h.window.finishLoading();
  h.app.emit("before-quit");
  assert.equal(h.window.visible, false);
  assert.deepEqual(h.persisted.at(-1), { bounds: initialBounds, maximized: true });
  h.window.destroy();
});

test("second-instance and taskbar reopen preserve ordinary bounds after minimization", async () => {
  const h = await mainHarness({ saved: { bounds: initialBounds, maximized: false } });
  h.window.finishLoading();
  h.window.minimized = true;
  h.window.bounds = { x: -32000, y: -32000, width: 160, height: 32 };
  h.window.emit("minimize");
  h.app.emit("second-instance");
  assert.equal(h.window.minimized, false);
  assert.deepEqual(h.window.getBounds(), initialBounds);
  h.window.hide();
  h.window.show();
  assert.deepEqual(h.window.getBounds(), initialBounds);
  h.app.emit("before-quit");
  assert.deepEqual(h.persisted.at(-1), { bounds: initialBounds, maximized: false });
  h.window.destroy();
});

test("window layouts survive a settings-store restart and preserve unrelated preferences", () => {
  const parent = resolve(import.meta.dirname, "../.test-modules");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "window-settings-"));
  const configPath = join(directory, "config.json");
  writeFileSync(configPath, JSON.stringify({ language: "en-US", floatingOpacity: 0.7, desktopDensity: "comfortable" }));
  const openState = () => loadElectronModule("main/state.ts", {
    electron: { app: { isPackaged: false, getPath: () => directory }, safeStorage: {} },
  }, { __TASKBRIDGE_BASE_URL__: "", __TASKBRIDGE_WS_URL__: "" });
  try {
    const first = openState();
    assert.deepEqual(first.getMainWindowState(), { bounds: null, maximized: false });
    first.saveMainWindowState({ bounds: initialBounds, maximized: true });
    first.saveFloatingBounds({ x: -1180, y: 130, width: 400, height: 520 });
    first.setSetting("desktopDensity", "compact");
    first.setSetting("desktopGlassEnabled", false);
    const second = openState();
    assert.deepEqual(second.getMainWindowState(), { bounds: initialBounds, maximized: true });
    assert.deepEqual(second.getFloatingPosition(), { x: -1180, y: 130 });
    assert.deepEqual(second.getFloatingSize(), { width: 400, height: 520 });
    assert.equal(second.getSettings().floatingOpacity, 0.7);
    assert.equal(second.getSettings().language, "en-US");
    assert.equal(second.getSettings().desktopDensity, "compact");
    assert.equal(second.getSettings().desktopGlassEnabled, false);
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    raw.mainWindowState.bounds.x = "invalid";
    raw.desktopDensity = "invalid";
    raw.desktopGlassEnabled = "false";
    writeFileSync(configPath, JSON.stringify(raw));
    const corrupted = openState();
    assert.equal(corrupted.getMainWindowState().bounds, null);
    assert.equal(corrupted.getSettings().desktopDensity, "comfortable");
    assert.equal(corrupted.getSettings().desktopGlassEnabled, true);
  } finally {
    assert.equal(dirname(resolve(directory)), parent);
    rmSync(directory, { recursive: true, force: true });
  }
});
