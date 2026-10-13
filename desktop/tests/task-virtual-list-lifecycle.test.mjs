import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";

const require = createRequire(import.meta.url);
const vue = require("vue");
const tanstack = require("@tanstack/vue-virtual");

function harness(t) {
  const mounted = [];
  const unmounted = [];
  const observers = [];
  const browser = { innerHeight: 800, setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  let virtualizer;
  class ResizeObserver {
    observed = new Set();
    constructor() { observers.push(this); }
    observe(target) { this.observed.add(target); }
    disconnect() { this.observed.clear(); }
  }
  const { useTaskVirtualList } = loadElectronModule("src/composables/useTaskVirtualList.ts", {
    vue: { ...vue, onMounted: callback => mounted.push(callback), onBeforeUnmount: callback => unmounted.push(callback) },
    "@tanstack/vue-virtual": { ...tanstack, useVirtualizer: options => (virtualizer = tanstack.useVirtualizer(options)) },
  }, { window: browser, ResizeObserver });
  const element = vue.shallowRef(null);
  const tasks = vue.shallowRef([]);
  const scope = vue.effectScope();
  const list = scope.run(() => useTaskVirtualList(element, () => tasks.value, () => "comfortable"));
  t.after(() => { unmounted.forEach(callback => callback()); scope.stop(); });
  mounted.forEach(callback => callback());

  function surface(top = 100) {
    const parent = Object.assign(new EventTarget(), {
      ownerDocument: { defaultView: browser }, offsetWidth: 600, offsetHeight: 800,
      scrollTop: 0, clientTop: 0, scrollHeight: 50000,
      getBoundingClientRect: () => ({ top: 0, width: 600, height: 800 }),
      scrollTo({ top: offset }) { if (offset !== undefined) this.scrollTop = offset; },
    });
    const container = {};
    const node = {
      closest: selector => selector === ".workspace-main" ? parent : container,
      getBoundingClientRect: () => ({ top: top - parent.scrollTop, width: 600 }),
    };
    return { node, parent, container };
  }

  async function flush() { await vue.nextTick(); await vue.nextTick(); }
  function populate() {
    tasks.value = Array.from({ length: 260 }, (_, index) => ({ localId: `task-${index}`, content: null, syncStatus: "synced" }));
  }
  async function scrollToLast(parent) {
    parent.scrollTop = list.totalHeight.value + list.scrollMargin.value - parent.offsetHeight;
    parent.dispatchEvent(new Event("scroll"));
    await flush();
  }
  return { element, tasks, list, observers, surface, flush, populate, scrollToLast, current: () => virtualizer.value };
}

test("a task section mounted empty later scrolls through all 260 tasks", async t => {
  const h = harness(t);
  const first = h.surface();
  h.element.value = first.node;
  h.populate();
  await h.flush();
  await h.scrollToLast(first.parent);
  assert.ok(h.list.rows.value.some(row => row.index === 259), "the last task must become reachable after an initially empty section fills");
  assert.ok(h.list.rows.value.length < 60, "late population must keep DOM work bounded");
  assert.equal(h.list.scrollMargin.value, 100);
});

test("removing and replacing a task section releases its old scroll and resize targets", async t => {
  const h = harness(t);
  const first = h.surface();
  h.element.value = first.node;
  h.populate();
  await h.flush();
  assert.equal(h.current().scrollElement, first.parent);
  h.element.value = null;
  h.tasks.value = [];
  await h.flush();
  assert.equal(h.current().scrollElement, null);
  assert.ok(h.observers.every(observer => observer.observed.size === 0));
  const second = h.surface(320);
  h.element.value = second.node;
  h.populate();
  await h.flush();
  const offsetBeforeOldScroll = h.current().getScrollOffset();
  first.parent.scrollTop = 12000;
  first.parent.dispatchEvent(new Event("scroll"));
  await h.flush();
  assert.equal(h.current().getScrollOffset(), offsetBeforeOldScroll, "detached scroll parents must no longer drive the list");
  await h.scrollToLast(second.parent);
  assert.ok(h.list.rows.value.some(row => row.index === 259));
  assert.equal(h.list.scrollMargin.value, 320);
  assert.ok(h.observers.some(observer => observer.observed.has(second.parent)));
  assert.ok(h.observers.every(observer => !observer.observed.has(first.parent)));
});
