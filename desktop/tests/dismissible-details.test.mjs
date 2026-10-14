import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { effectScope, shallowRef } from "vue";
import { compileTsModule } from "./helpers/load-ts-module.mjs";

const module = await compileTsModule("src/composables/useDismissibleDetails.ts", { resolvePackagesFromProject: true });
const { useDismissibleDetails } = await import(pathToFileURL(module.modulePath).href);
after(module.cleanup);

function harness() {
  const document = new EventTarget();
  const summary = { nodeType: 1, focusCalls: 0, focus() { this.focusCalls += 1; } };
  const option = { nodeType: 1 };
  const outside = { nodeType: 1 };
  const details = { nodeType: 1, open: true, ownerDocument: document, contains: (node) => node === details || node === summary || node === option };
  const menuRef = shallowRef(details);
  const summaryRef = shallowRef(summary);
  const scope = effectScope();
  const menu = scope.run(() => useDismissibleDetails(menuRef, summaryRef));
  function dispatch(type, target, key) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "target", { value: target });
    if (key) Object.defineProperty(event, "key", { value: key });
    document.dispatchEvent(event);
    return event;
  }
  return { document, summary, option, outside, details, menu, scope, dispatch };
}

test("clicking filter options keeps the panel open and outside clicks dismiss without stealing focus", () => {
  const h = harness();
  try {
    h.dispatch("pointerdown", h.option);
    assert.equal(h.details.open, true);
    h.dispatch("pointerdown", h.summary);
    assert.equal(h.details.open, true, "native summary activation owns its second-click toggle");
    h.dispatch("pointerdown", h.outside);
    assert.equal(h.details.open, false);
    assert.equal(h.summary.focusCalls, 0);
  } finally { h.scope.stop(); }
});

test("keyboard focus can move between filter options and dismisses when leaving the panel", () => {
  const h = harness();
  try {
    h.dispatch("focusin", h.option);
    assert.equal(h.details.open, true);
    h.dispatch("focusin", h.outside);
    assert.equal(h.details.open, false);
    assert.equal(h.summary.focusCalls, 0);
  } finally { h.scope.stop(); }
});

test("Escape dismisses an open panel and restores its summary without consuming keys when closed", () => {
  const h = harness();
  try {
    const escape = h.dispatch("keydown", h.option, "Escape");
    assert.equal(h.details.open, false);
    assert.equal(h.summary.focusCalls, 1);
    assert.equal(escape.defaultPrevented, true);
    const closedEscape = h.dispatch("keydown", h.outside, "Escape");
    assert.equal(closedEscape.defaultPrevented, false);
    assert.equal(h.summary.focusCalls, 1);
  } finally { h.scope.stop(); }
});

test("disposing a panel removes global listeners so a later panel is unaffected", () => {
  const h = harness();
  h.scope.stop();
  h.details.open = true;
  h.dispatch("pointerdown", h.outside);
  assert.equal(h.details.open, true);
  h.dispatch("focusin", h.outside);
  assert.equal(h.details.open, true);
  h.dispatch("keydown", h.option, "Escape");
  assert.equal(h.details.open, true);
  assert.equal(h.summary.focusCalls, 0);
});
