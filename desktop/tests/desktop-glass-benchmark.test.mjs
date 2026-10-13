import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

function rendererHarness(failEvaluation = 0) {
  const originalTasks = [{ localId: "original", title: "Original task" }];
  const originalToday = [...originalTasks];
  const task = { tasks: originalTasks, todayTasks: originalToday };
  const settings = { desktopGlassEnabled: false, displayTimeZone: "Asia/Shanghai" };
  const pinia = { _s: new Map([["task", task], ["settings", settings], ["auth", { isAuthenticated: true }]]) };
  let panelOpen = false;
  const layer = {
    isConnected: true, getClientRects: () => [{}],
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 360, bottom: 850, width: 360, height: 850 }), focus() {},
  };
  const workspace = { ...layer, scrollTop: 125, clientHeight: 800, get scrollHeight() { return task.tasks.length * 80; } };
  const trigger = { ...layer, click() { panelOpen = true; } };
  const close = { ...layer, click() { panelOpen = false; } };
  const documentElement = {
    dataset: {},
    getAttribute(key) { return this.dataset[key.slice(5)] ?? null; },
    removeAttribute(key) { delete this.dataset[key.slice(5)]; },
    setAttribute(key, value) { this.dataset[key.slice(5)] = value; },
  };
  const document = {
    documentElement, visibilityState: "visible", activeElement: layer,
    querySelector(selector) {
      if (selector === "#app") return { __vue_app__: { config: { globalProperties: { $pinia: pinia } } } };
      if (selector.includes("panel-header")) return panelOpen ? close : null;
      if (selector.includes("side-panel")) return panelOpen ? layer : null;
      if (selector.includes("task-edit-trigger")) return trigger;
      if (selector.includes('data-task-id="glass-benchmark-259"')) return workspace.scrollTop >= workspace.scrollHeight - workspace.clientHeight ? layer : null;
      if (selector.includes("sidebar")) return layer;
      if (selector.includes("workspace-main")) return workspace;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes("data-task-count")) return [{ dataset: { taskCount: String(task.tasks.length) } }];
      return selector.includes("task-row") ? task.tasks.slice(0, 12).map(() => layer) : [];
    },
  };
  let clock = 0;
  let frame = 0;
  const context = vm.createContext({
    window: {}, document, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, console,
    setTimeout, clearTimeout,
    requestAnimationFrame(callback) { return setImmediate(() => { clock += ++frame % 10 === 0 ? 50 : 16.7; callback(clock); }); },
    cancelAnimationFrame: clearImmediate,
    getComputedStyle() { return { visibility: "visible", display: "block", backdropFilter: settings.desktopGlassEnabled ? "blur(12px)" : "none", backgroundColor: "rgba(255,255,255,0.8)" }; },
  });
  let evaluations = 0;
  const commands = [];
  const cdp = {
    async evaluate(expression) {
      evaluations += 1;
      if (evaluations === failEvaluation) throw new Error("synthetic measurement failure");
      return vm.runInContext(expression, context);
    },
    async send(method) {
      commands.push(method);
      return { metrics: [{ name: "JSHeapUsedSize", value: 1_000_000 }, { name: "JSHeapTotalSize", value: 2_000_000 }] };
    },
  };
  return { cdp, task, settings, originalTasks, originalToday, documentElement, workspace, context, commands, get panelOpen() { return panelOpen; } };
}

async function loadBenchmark() {
  assert.ok(existsSync(resolve(import.meta.dirname, "../scripts/desktop-glass-benchmark.mjs")), "a reproducible glass comparison helper must exist");
  return import("../scripts/desktop-glass-benchmark.mjs");
}

test("glass measurement reports real frame intervals and restores temporary renderer state", async () => {
  const { measureDesktopGlass } = await loadBenchmark();
  const h = rendererHarness();
  const result = await measureDesktopGlass(h.cdp);
  assert.equal(result.taskCount, 260);
  assert.equal(result.reachableTaskCount, 260);
  assert.equal(result.lastTaskReachable, true);
  assert.ok(result.renderedRows > 0 && result.renderedRows < 60);
  assert.deepEqual(result.order, ["off", "on", "on", "off"]);
  assert.equal(result.runs.length, 4);
  assert.equal(result.modes.off.maxMs, 50);
  assert.ok(result.modes.on.p95Ms > result.modes.on.medianMs);
  assert.ok(result.modes.on.slowFrameRatio > 0);
  assert.equal(result.runs[0].heap.usedBytes, 1_000_000);
  assert.equal(result.restored, true);
  assert.equal(h.task.tasks, h.originalTasks);
  assert.equal(h.task.todayTasks, h.originalToday);
  assert.equal(h.settings.desktopGlassEnabled, false);
  assert.equal(Object.hasOwn(h.documentElement.dataset, "glass"), false);
  assert.equal(h.workspace.scrollTop, 125);
  assert.equal(h.panelOpen, false);
});

test("glass measurement restores tasks and display settings even when one sample fails", async () => {
  const { measureDesktopGlass } = await loadBenchmark();
  const h = rendererHarness(3);
  await assert.rejects(measureDesktopGlass(h.cdp), /synthetic measurement failure/);
  assert.equal(h.task.tasks, h.originalTasks);
  assert.equal(h.task.todayTasks, h.originalToday);
  assert.equal(h.settings.desktopGlassEnabled, false);
  assert.equal(Object.hasOwn(h.documentElement.dataset, "glass"), false);
  assert.equal(h.panelOpen, false);
});
