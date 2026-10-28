import assert from "node:assert/strict";
import test from "node:test";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";

test("floating submission retains the draft until the parent confirms persistence", async () => {
  const title = { value: "  明天交付设计  " };
  const events = [];
  const { submit } = await loadTsFunctions("renderer/components/QuickAddTask.vue", ["submit"], {
    title, props: { disabled: false }, emit: (...args) => events.push(args),
  });
  submit();
  assert.deepEqual(events, [["submit", "明天交付设计"]]);
  assert.equal(title.value, "  明天交付设计  ", "failed writes must remain retryable");
});

test("floating capture ignores a second submission while a write is pending", async () => {
  const events = [];
  const { submit } = await loadTsFunctions("renderer/components/QuickAddTask.vue", ["submit"], {
    title: { value: "work" }, props: { disabled: true }, emit: (...args) => events.push(args),
  });
  submit();
  assert.equal(events.length, 0);
});

test("workspace quick capture also guards disabled submission", async () => {
  const events = [];
  const { submit } = await loadTsFunctions("renderer/components/WorkspaceQuickAdd.vue", ["submit"], {
    title: { value: "work" }, props: { disabled: true }, emit: (...args) => events.push(args),
  });
  submit();
  assert.equal(events.length, 0);
});

test("a capture snapshot cannot clear newer text or another account's draft", async () => {
  const auth = { workspaceKey: "workspace-a" };
  const draft = { value: { title: "first", content: "detail", checklistItems: [{ id: "a", title: "step", done: true }] } };
  const api = await loadTsFunctions("renderer/stores/capture.ts", ["snapshot", "updateDraft", "clearIfCurrent"], { auth, draft, revision: 0 });
  const first = api.snapshot();
  api.updateDraft({ ...draft.value, title: "second" });
  assert.equal(api.clearIfCurrent(first), false);
  assert.equal(draft.value.title, "second");
  const second = api.snapshot();
  auth.workspaceKey = "workspace-b";
  assert.equal(api.clearIfCurrent(second), false);
  assert.equal(draft.value.title, "second");
});

test("an equivalent editor notification does not leave a successfully saved draft behind", async () => {
  const auth = { workspaceKey: "workspace-a" };
  const draft = { value: { title: "first", content: "detail" } };
  const api = await loadTsFunctions("renderer/stores/capture.ts", ["snapshot", "updateDraft", "clearIfCurrent"], { auth, draft, revision: 0 });
  const submitted = api.snapshot();
  api.updateDraft({ ...draft.value });
  assert.equal(api.clearIfCurrent(submitted), true);
  assert.equal(draft.value.title, "");
});

test("capture snapshots keep their own checklist data while the next draft is edited", async () => {
  const draft = { value: { title: "first", checklistItems: [{ id: "a", title: "step", done: false }] } };
  const api = await loadTsFunctions("renderer/stores/capture.ts", ["snapshot"], { auth: { workspaceKey: "a" }, draft, revision: 0 });
  const submitted = api.snapshot();
  draft.value.checklistItems[0].done = true;
  assert.equal(submitted.draft.checklistItems[0].done, false);
});
