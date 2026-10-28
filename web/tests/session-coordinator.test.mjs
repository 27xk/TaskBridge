import assert from "node:assert/strict";
import test from "node:test";
import { createDeferred } from "./helpers/app-harness.mjs";

test("session coordinator shares work and an old completion cannot release a new session's work", async () => {
  const module = await import("../session-coordinator.js").catch(() => ({}));
  assert.equal(typeof module.createSessionCoordinator, "function", "session coordinator must expose explicit dependencies");
  let userId = 1;
  const coordinator = module.createSessionCoordinator({ getIdentity: () => ({ apiBaseUrl: "https://tasks.test/api/v1", deviceId: "browser", userId }) });
  const first = createDeferred();
  let starts = 0;
  const a = coordinator.run("activation", coordinator.capture(), () => { starts += 1; return first.promise; });
  const duplicateA = coordinator.run("activation", coordinator.capture(), () => { starts += 1; });
  assert.equal(a, duplicateA);
  await Promise.resolve();
  coordinator.invalidate();
  userId = 2;
  const second = createDeferred();
  const b = coordinator.run("activation", coordinator.capture(), () => { starts += 1; return second.promise; });
  first.resolve(true);
  await a;
  assert.equal(coordinator.run("activation", coordinator.capture(), () => { starts += 1; }), b);
  second.resolve(true);
  await b;
  assert.equal(starts, 2);
});

test("invalidating a queued flight before it starts skips the old session's action", async () => {
  const { createSessionCoordinator } = await import("../session-coordinator.js");
  const coordinator = createSessionCoordinator({ getIdentity: () => ({ apiBaseUrl: "a", deviceId: "b", userId: 1 }) });
  let starts = 0;
  const queued = coordinator.run("activation", coordinator.capture(), () => { starts += 1; });
  coordinator.invalidate();
  await queued;
  assert.equal(starts, 0);
});
