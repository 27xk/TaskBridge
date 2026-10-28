import assert from "node:assert/strict";
import test from "node:test";
import { createSessionHarness, jsonResponse } from "./helpers/session-harness.mjs";

test("sync health reporting is session-scoped, throttled for 60 seconds, and best effort", async () => {
  const module = await import("../session-coordinator.js");
  assert.equal(typeof module.createSyncHealthReporter, "function");
  let milliseconds = 0;
  let signedIn = false;
  let reads = 0;
  const reports = [];
  const reporter = module.createSyncHealthReporter({
    canReport: () => signedIn,
    getKey: (context) => String(context.userId),
    readHealth: async () => { reads += 1; return { pending_count: 2, conflict_count: 1, oldest_pending_seconds: 60 }; },
    send: async (health) => { reports.push(health); if (reports.length === 1) throw new Error("server unavailable"); },
    now: () => milliseconds,
  });
  await reporter.report({ userId: 1 });
  assert.equal(reads, 0, "signed-out clients must not read or report health");
  signedIn = true;
  assert.equal(await reporter.report({ userId: 1 }), false);
  await reporter.report({ userId: 1 });
  assert.equal(reports.length, 1);
  milliseconds = 60000;
  assert.equal(await reporter.report({ userId: 1 }), true);
  assert.equal(reports.length, 2);
  await reporter.report({ userId: 2 });
  assert.equal(reports.length, 3);
});

test("queue refresh reports indexed counts and oldest key without reading task or mutation bodies", async () => {
  const h = createSessionHarness();
  h.signIn(1);
  const store = h.workspace(1);
  store.get("tasks").set(1, { id: 1, offline_status: "conflict", title: "Private title" });
  store.get("offline_mutations").set(1, { offline_queue_id: 1, created_at: new Date(Date.now() - 120000).toISOString(), payload: { title: "Private payload" } });
  h.controls.respond = (request) => request.path === "/observability/sync-health" ? jsonResponse({ accepted: true }, 202) : undefined;
  await h.run("refreshOfflineQueueCount()");
  await h.run("syncHealthReporter.report(captureSessionContext())");
  await new Promise((resolve) => setImmediate(resolve));
  const reports = h.requests.filter((request) => request.path === "/observability/sync-health");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].body.source, "web");
  assert.equal(reports[0].body.pending_count, 1);
  assert.equal(reports[0].body.conflict_count, 1);
  assert.ok(reports[0].body.oldest_pending_seconds >= 120);
  assert.equal(JSON.stringify(reports[0].body).includes("Private"), false);
  assert.ok(!h.effects.reads.some((read) => ["getAll", "cursorValue"].includes(read.method)));
});
