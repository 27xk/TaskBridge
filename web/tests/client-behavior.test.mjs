import assert from "node:assert/strict";
import test from "node:test";

import * as core from "../offline-core.js";

function requireCoreFunction(name) {
  assert.equal(typeof core[name], "function", `${name} must be exported`);
  return core[name];
}

test("task draft keys isolate users and origins without splitting paths on one server", () => {
  const buildTaskDraftStorageKey = requireCoreFunction("buildTaskDraftStorageKey");
  const first = buildTaskDraftStorageKey(
    "taskbridge.web.v1",
    "https://tasks.example.com/team-a/api/v1",
    42,
  );
  const sameOrigin = buildTaskDraftStorageKey(
    "taskbridge.web.v1",
    "https://tasks.example.com/team-b/api/v1",
    42,
  );
  const otherUser = buildTaskDraftStorageKey(
    "taskbridge.web.v1",
    "https://tasks.example.com/team-a/api/v1",
    43,
  );
  const otherOrigin = buildTaskDraftStorageKey(
    "taskbridge.web.v1",
    "https://other.example.com/api/v1",
    42,
  );

  assert.equal(first, sameOrigin);
  assert.notEqual(first, otherUser);
  assert.notEqual(first, otherOrigin);
  assert.match(first, /taskDraft\.origin\..+\.user\.42$/);
});

test("account-scoped input reset clears credentials and task text", () => {
  const clearAccountScopedInputs = requireCoreFunction("clearAccountScopedInputs");
  const inputs = [
    { value: "alice" },
    { value: "secret-password" },
    { value: "private task draft" },
  ];

  clearAccountScopedInputs(inputs);

  assert.deepEqual(inputs.map((input) => input.value), ["", "", ""]);
});

test("offline create payload gets one stable client request id reused on replay", () => {
  const withClientRequestId = requireCoreFunction("withClientRequestId");
  let generated = 0;
  const first = withClientRequestId(
    { title: "Created offline" },
    () => `request-${++generated}`,
  );
  const replay = withClientRequestId(first, () => `request-${++generated}`);

  assert.equal(first.client_request_id, "request-1");
  assert.equal(replay.client_request_id, "request-1");
  assert.equal(generated, 1);
});

test("a permanent mutation failure skips only later records for the same task", async () => {
  const processIndependentMutationQueue = requireCoreFunction("processIndependentMutationQueue");
  const records = [
    { offline_queue_id: 1, task_id: 10 },
    { offline_queue_id: 2, task_id: 10 },
    { offline_queue_id: 3, task_id: 20 },
  ];
  const attempted = [];
  const failed = [];

  const result = await processIndependentMutationQueue({
    listRecords: async () => records,
    processRecord: async (record) => {
      attempted.push(record.offline_queue_id);
      if (record.offline_queue_id === 1) throw new Error("permanent failure");
    },
    markFailed: async (record) => failed.push(record.offline_queue_id),
  });

  assert.deepEqual(attempted, [1, 3]);
  assert.deepEqual(failed, [1]);
  assert.deepEqual(result.blockedTaskIds, ["10"]);
});

test("queue processing reloads records after create id remapping", async () => {
  const processIndependentMutationQueue = requireCoreFunction("processIndependentMutationQueue");
  let records = [
    { offline_queue_id: 1, task_id: -1, action: "create" },
    { offline_queue_id: 2, task_id: -1, action: "update", expected_version: 0 },
  ];
  const attemptedTaskIds = [];

  await processIndependentMutationQueue({
    listRecords: async () => records.map((record) => ({ ...record })),
    processRecord: async (record) => {
      attemptedTaskIds.push(record.task_id);
      if (record.action === "create") {
        records = records
          .filter((candidate) => candidate.offline_queue_id !== record.offline_queue_id)
          .map((candidate) => ({ ...candidate, task_id: 99, expected_version: 1 }));
      }
    },
    markFailed: async () => {},
  });

  assert.deepEqual(attemptedTaskIds, [-1, 99]);
});

test("a persisted failed mutation blocks only its task until the user retries it", async () => {
  const processIndependentMutationQueue = requireCoreFunction("processIndependentMutationQueue");
  const records = [
    { offline_queue_id: 1, task_id: 10, offline_status: "sync_failed" },
    { offline_queue_id: 2, task_id: 10, offline_status: "pending" },
    { offline_queue_id: 3, task_id: 20, offline_status: "pending" },
  ];
  const attempted = [];

  const result = await processIndependentMutationQueue({
    listRecords: async () => records,
    processRecord: async (record) => attempted.push(record.offline_queue_id),
    markFailed: async () => {},
  });

  assert.deepEqual(attempted, [3]);
  assert.deepEqual(result.blockedTaskIds, ["10"]);
});

test("server task views map high priority and keep local sync views local", () => {
  const mapTaskViewForServer = requireCoreFunction("mapTaskViewForServer");

  assert.equal(mapTaskViewForServer("high"), "high_priority");
  assert.equal(mapTaskViewForServer("pending"), null);
  assert.equal(mapTaskViewForServer("conflict"), null);
  assert.equal(mapTaskViewForServer("today"), "today");
});

test("today view matches open overdue and reminder-only tasks but excludes completed work", () => {
  const now = new Date("2026-06-05T10:00:00.000Z");
  const options = { view: "today", search: "", now, timeZone: "Asia/Shanghai" };

  assert.equal(core.matchesTaskView({
    id: 1,
    title: "Overdue",
    status: "open",
    due_time: "2026-06-04T09:00:00.000Z",
  }, options), true);
  assert.equal(core.matchesTaskView({
    id: 2,
    title: "Reminder only",
    status: "open",
    reminder_at: "2026-06-05T11:00:00.000Z",
  }, options), true);
  assert.equal(core.matchesTaskView({
    id: 3,
    title: "Already done",
    status: "completed",
    list_type: "today",
  }, options), false);
  assert.equal(core.buildLocalMeta([{
    id: 4,
    title: "Reminder only",
    status: "open",
    reminder_at: "2026-06-05T11:00:00.000Z",
  }], now, { timeZone: "Asia/Shanghai" }).counts.today, 1);
});

test("high priority view excludes completed tasks", () => {
  const completed = {
    id: 1,
    title: "Done urgent task",
    status: "completed",
    priority: 5,
  };

  assert.equal(core.matchesTaskView(completed, { view: "high", search: "" }), false);
  assert.equal(core.buildLocalMeta([completed]).counts.high, 0);
});

test("latest request gate rejects stale task responses", () => {
  const createLatestRequestGate = requireCoreFunction("createLatestRequestGate");
  const gate = createLatestRequestGate();
  const first = gate.begin();
  const second = gate.begin();

  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

test("latest request gate ignores a delayed result after an endpoint switch", async () => {
  const createLatestRequestGate = requireCoreFunction("createLatestRequestGate");
  const gate = createLatestRequestGate();
  const state = { endpoint: "A", syncStatus: null };
  let resolveDelayed;
  const delayed = new Promise((resolve) => {
    resolveDelayed = resolve;
  });
  const requestSequence = gate.begin();
  const applyDelayedResult = delayed.then((result) => {
    if (gate.isCurrent(requestSequence)) state.syncStatus = result;
  });

  state.endpoint = "B";
  state.syncStatus = null;
  gate.begin();
  resolveDelayed({ status: "ready", source: "A" });
  await applyDelayedResult;

  assert.equal(state.endpoint, "B");
  assert.equal(state.syncStatus, null);
});

test("mixed content detection distinguishes blocked HTTPS to HTTP requests", () => {
  const isMixedContentApiUrl = requireCoreFunction("isMixedContentApiUrl");

  assert.equal(isMixedContentApiUrl("https:", "http://192.168.1.20:8000/api/v1"), true);
  assert.equal(isMixedContentApiUrl("http:", "http://192.168.1.20:8000/api/v1"), false);
  assert.equal(isMixedContentApiUrl("https:", "https://tasks.example.com/api/v1"), false);
});

test("degraded health remains usable for authentication", () => {
  const isAuthHealthUsable = requireCoreFunction("isAuthHealthUsable");

  assert.equal(isAuthHealthUsable({ status: "ready" }), true);
  assert.equal(isAuthHealthUsable({ status: "degraded" }), true);
  assert.equal(isAuthHealthUsable(null), false);
});

test("only terminal refresh statuses force reauthentication", () => {
  const isTerminalRefreshStatus = requireCoreFunction("isTerminalRefreshStatus");

  assert.equal(isTerminalRefreshStatus(401), true);
  assert.equal(isTerminalRefreshStatus(403), true);
  assert.equal(isTerminalRefreshStatus(429), false);
  assert.equal(isTerminalRefreshStatus(500), false);
});

test("reminder scheduling prefers reminder_at and falls back to due_at", () => {
  const getTaskReminderAt = requireCoreFunction("getTaskReminderAt");

  assert.equal(getTaskReminderAt({
    status: "open",
    reminder_at: "2026-06-05T11:00:00.000Z",
    due_at: "2026-06-05T12:00:00.000Z",
  }), "2026-06-05T11:00:00.000Z");
  assert.equal(getTaskReminderAt({
    status: "open",
    due_at: "2026-06-05T12:00:00.000Z",
  }), "2026-06-05T12:00:00.000Z");
  assert.equal(getTaskReminderAt({
    status: "completed",
    reminder_at: "2026-06-05T11:00:00.000Z",
  }), null);
});

test("notification task URLs preserve the app path and identify the task", () => {
  const buildTaskNotificationUrl = requireCoreFunction("buildTaskNotificationUrl");

  assert.equal(
    buildTaskNotificationUrl(42, "https://tasks.example.com/web/index.html"),
    "https://tasks.example.com/web/?task=42",
  );
});

test("browser time zones are validated before being sent to task endpoints", () => {
  const normalizeBrowserTimeZone = requireCoreFunction("normalizeBrowserTimeZone");

  assert.equal(normalizeBrowserTimeZone("Asia/Shanghai"), "Asia/Shanghai");
  assert.equal(normalizeBrowserTimeZone("America/New_York"), "America/New_York");
  assert.equal(normalizeBrowserTimeZone("Not/AZone"), "UTC");
  assert.equal(normalizeBrowserTimeZone(""), "UTC");
});

test("password change payload requires matching new passwords", () => {
  const buildPasswordChangePayload = requireCoreFunction("buildPasswordChangePayload");

  assert.deepEqual(
    buildPasswordChangePayload("old-password", "new-password", "new-password"),
    { current_password: "old-password", new_password: "new-password" },
  );
  assert.throws(
    () => buildPasswordChangePayload("old-password", "new-password", "different"),
    /password confirmation/i,
  );
  assert.throws(
    () => buildPasswordChangePayload("old-password", "short", "short"),
    /at least 8/i,
  );
});
