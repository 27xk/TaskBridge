import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";

const require = createRequire(import.meta.url);

function harness() {
  let hasTokens = true;
  let now = 100_000;
  const sent = [];
  const statuses = [];
  let summaries = 0;
  const api = { request: async payload => { sent.push(payload); throw new Error("monitoring unavailable"); } };
  class Clock extends Date { static now() { return now; } }
  const auth = { workspaceKey: "workspace-a" };
  const { SyncManager } = loadElectronModule("renderer/sync/SyncManager.ts", {
    "../api/sync": { pullSync: async () => ({ changed_tasks: [], deleted_tasks: [], has_more: false, server_time: "2026-10-26T00:00:00Z" }) },
    "../api/auth": {}, "../api/device": { registerDevice: async () => {} },
    "../stores/auth": { useAuthStore: () => auth },
    "../db/sqlite": { bridge: () => ({ auth: { hasTokens: async () => hasTokens }, api,
      app: { getSettings: async () => ({ deviceId: "device", lastSyncTime: "" }), setSetting: async () => {}, setSyncStatus: async () => {} },
      db: { getSyncHealthSummary: async () => { summaries++; return { pendingCount: 3, conflictCount: 1, oldestPendingAt: new Date(now - 30_000).toISOString() }; } } }) },
    "../db/sync-queue.dao": { listSyncQueue: async () => [] }, "../db/task.dao": { getTasksByServerIds: async () => [] },
    "./task-mapper": {}, "./WebSocketClient": {},
  }, { navigator: { onLine: true }, window: {}, Date: Clock });
  const manager = new SyncManager(status => statuses.push(status), async () => {});
  manager.started = true;
  return { manager, sent, statuses, api, auth, get summaries() { return summaries; }, setTokens: value => { hasTokens = value; }, advance: duration => { now += duration; } };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test("health reports cross the main-process HTTP allowlist and reach the authenticated API", async () => {
  const requests = [];
  const http = loadElectronModule("main/http.ts", {
    "./state": { getActiveWorkspaceKey: () => "workspace-a", getSettings: () => ({ baseUrl: "https://taskbridge.test/api/v1/" }),
      getTokens: () => ({ accessToken: "test-token" }) }, "./tray": {},
  }, { fetch: async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 202, json: async () => ({ code: 0, message: "success", data: { accepted: true } }) };
  } });
  const report = { source: "desktop", device_id: "device", pending_count: 0, conflict_count: 0, oldest_pending_seconds: 0 };
  const response = await http.performApiRequest({ method: "POST", url: "/observability/sync-health", data: report, expectedWorkspaceKey: "workspace-a" });
  assert.equal(response.data.accepted, true);
  assert.equal(requests[0].url, "https://taskbridge.test/api/v1/observability/sync-health");
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(requests[0].options.body), report);
});

test("health delivery failure preserves sync success and reporting is throttled for 60 seconds", async () => {
  const h = harness();
  await h.manager.syncNow();
  await flush();
  assert.equal(h.statuses.at(-1), "synced");
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].url, "/observability/sync-health");
  assert.deepEqual(h.sent[0].data, { source: "desktop", device_id: "device", pending_count: 3, conflict_count: 1,
    oldest_pending_seconds: 30, last_success_age_seconds: 0 });
  await h.manager.syncNow();
  await flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.summaries, 1, "throttled telemetry must not rescan the queue");
  h.advance(60_000);
  await h.manager.syncNow();
  await flush();
  assert.equal(h.sent.length, 2);
  assert.equal(h.statuses.at(-1), "synced");
});

test("signed-out sync never reads or sends telemetry", async () => {
  const h = harness();
  h.setTokens(false);
  await h.manager.syncNow();
  await flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.summaries, 0);
  assert.equal(h.statuses.length, 0);
});
