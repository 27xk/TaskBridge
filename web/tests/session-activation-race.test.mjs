import assert from "node:assert/strict";
import test from "node:test";
import { createDeferred, nextTurn } from "./helpers/app-harness.mjs";
import { createSessionHarness, jsonResponse, sessionTokens } from "./helpers/session-harness.mjs";

const profileRequests = (harness, userId) => harness.requests.filter((request) => request.path === "/auth/me" && request.userId === userId);
const taskUploads = (harness) => harness.requests.filter((request) => request.path === "/tasks" && request.method === "POST");

test("concurrent activation in one session shares its profile and workspace refresh", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const profile = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && profileRequests(harness, 1).length === 1) return profile.promise;
  };
  const first = harness.run("activateSessionSingleflight()");
  const second = harness.run("activateSessionSingleflight()");
  await nextTurn();
  assert.equal(profileRequests(harness, 1).length, 1);
  profile.resolve(jsonResponse(sessionTokens(1).user));
  await Promise.all([first, second]);
  assert.equal(profileRequests(harness, 1).length, 2, "one activation and its profile refresh should run");
  assert.deepEqual(harness.effects.drafts, [1]);
  assert.equal(harness.state.loading, false);
});

test("cookie activation for account A cannot upload or clear A's queue with account B's tokens", async () => {
  const harness = createSessionHarness();
  harness.addQueuedTask(1, "Account A private draft");
  const profileA = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && request.userId === 1) return profileA.promise;
  };
  const restoreA = harness.run("restorePersistentSession()");
  await nextTurn();
  assert.equal(profileRequests(harness, 1).length, 1);
  harness.signIn(2);
  const activateB = harness.run("activateSessionSingleflight()");
  await nextTurn();
  profileA.resolve(jsonResponse(sessionTokens(1).user));
  await Promise.all([restoreA, activateB]);
  assert.deepEqual(taskUploads(harness), [], "an old activation must never send A's data with B's authorization");
  assert.equal(harness.workspace(1).get("offline_mutations").size, 1);
  assert.equal(harness.state.user.id, 2);
  assert.equal(harness.state.offlineProfile.id, 2);
  assert.deepEqual(harness.effects.drafts, [2]);
});

test("a profile that completes after logout cannot restore the previous workspace", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const profile = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && request.userId === 1) return profile.promise;
  };
  const activation = harness.run("activateSessionSingleflight()");
  harness.run("clearSession()");
  const requestCount = harness.requests.length;
  profile.resolve(jsonResponse(sessionTokens(1).user));
  await activation;
  assert.equal(harness.state.user, null);
  assert.equal(harness.state.accessToken, "");
  assert.equal(harness.requests.length, requestCount, "logout must stop subsequent refresh requests");
  assert.deepEqual(harness.effects.drafts, []);
});

test("a legacy endpoint preference change cannot redirect an activation in progress", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const profile = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && request.url.hostname === "taskbridge.test") return profile.promise;
  };
  const activation = harness.run("activateSessionSingleflight()");
  harness.run(`
    localStorage.setItem("taskbridge.web.v1.apiBaseUrl", "https://replacement.test/api/v1");
  `);
  profile.resolve(jsonResponse(sessionTokens(1).user));
  await activation;
  assert.equal(harness.state.user.username, "User 1");
  assert.ok(!harness.requests.some((request) => request.url.hostname === "replacement.test"));
  assert.equal(harness.state.apiBaseUrl, "https://taskbridge.test/api/v1");
});

test("an old activation failure cannot clear the new session or the new activation singleflight", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const profileA = createDeferred();
  const profileB = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && request.userId === 1) return profileA.promise;
    if (request.path === "/auth/me" && request.userId === 2 && profileRequests(harness, 2).length <= 1) return profileB.promise;
  };
  const first = harness.run("activateSessionSingleflight()");
  harness.signIn(2);
  const second = harness.run("activateSessionSingleflight()");
  profileA.resolve(jsonResponse({ detail: "Old account forbidden" }, 403));
  await first;
  const userAfterOldFailure = harness.state.user?.id;
  const third = harness.run("activateSessionSingleflight()");
  await nextTurn();
  const newProfileRequestCount = profileRequests(harness, 2).length;
  profileB.resolve(jsonResponse(sessionTokens(2).user));
  await Promise.all([second, third]);
  assert.equal(userAfterOldFailure, 2);
  assert.equal(newProfileRequestCount, 1, "old completion must not clear the new activation promise");
  assert.equal(harness.state.user.id, 2);
  assert.deepEqual(harness.effects.drafts, [2]);
});

test("an expired request from the old session cannot refresh or expire the new session", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const profileA = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && request.userId === 1) return profileA.promise;
  };
  const activation = harness.run("activateSessionSingleflight()");
  harness.signIn(2);
  profileA.resolve(jsonResponse({ detail: "Expired access token" }, 401));
  await activation;
  assert.ok(!harness.requests.some((request) => request.path === "/auth/refresh"), "a stale 401 must not rotate B's session");
  assert.equal(harness.state.user.id, 2);
  assert.equal(harness.state.accessToken, "access-2");
  assert.deepEqual(harness.effects.drafts, []);
});

test("late profile and metadata results cannot overwrite a new refresh or release its busy state", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const profileA = createDeferred();
  const metaA = createDeferred();
  const metaB = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && request.userId === 1 && profileRequests(harness, 1).length === 2) return profileA.promise;
    if (request.path === "/tasks/meta" && request.userId === 1) return metaA.promise;
    if (request.path === "/tasks/meta" && request.userId === 2) return metaB.promise;
  };
  const first = harness.run("activateSessionSingleflight()");
  await nextTurn();
  harness.signIn(2);
  const second = harness.run("activateSessionSingleflight()");
  await nextTurn();
  profileA.resolve(jsonResponse({ ...sessionTokens(1).user, username: "Late profile" }));
  metaA.resolve(jsonResponse({ projects: ["Old project"], tags: [], counts: {}, owner: 1 }));
  await first;
  const afterOldRefresh = { userId: harness.state.user?.id, metaOwner: harness.state.meta?.owner, busy: harness.state.loading };
  metaB.resolve(jsonResponse({ projects: ["New project"], tags: [], counts: {}, owner: 2 }));
  await second;
  assert.equal(afterOldRefresh.userId, 2);
  assert.notEqual(afterOldRefresh.metaOwner, 1);
  assert.equal(afterOldRefresh.busy, true, "the old finally must not unlock controls owned by B's refresh");
  assert.equal(harness.state.meta.owner, 2);
  assert.deepEqual(harness.effects.drafts, [2]);
});

test("a queue read that finishes after an account switch cannot replay its records with new credentials", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  harness.addQueuedTask(1, "Only A may upload this");
  harness.addQueuedTask(2, "Only B may upload this");
  const queueRead = createDeferred();
  let queueReads = 0;
  let capturedQueue;
  harness.controls.read = ({ name, storeName, method, result }) => {
    if (name === harness.workspaceName(1) && storeName === "offline_mutations" && method === "getAll" && ++queueReads === 3) {
      capturedQueue = result;
      return queueRead.promise;
    }
  };
  const first = harness.run("flushOfflineQueue()");
  await nextTurn();
  assert.ok(capturedQueue);
  harness.signIn(2);
  const second = harness.run("flushOfflineQueue()");
  await nextTurn();
  queueRead.resolve(capturedQueue);
  await Promise.all([first, second]);
  assert.deepEqual(taskUploads(harness).map((request) => [request.userId, request.body.title]), [[2, "Only B may upload this"]]);
  assert.equal(harness.workspace(1).get("offline_mutations").size, 1);
  assert.equal(harness.workspace(2).get("offline_mutations").size, 0);
});

test("an upload response from A cannot remove B's queue or release B's in-flight flush", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  harness.addQueuedTask(1, "A draft");
  harness.addQueuedTask(2, "B draft");
  const uploadA = createDeferred();
  const uploadB = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/tasks" && request.method === "POST") return request.userId === 1 ? uploadA.promise : uploadB.promise;
  };
  const first = harness.run("flushOfflineQueue()");
  await nextTurn();
  harness.signIn(2);
  const second = harness.run("flushOfflineQueue()");
  await nextTurn();
  uploadA.resolve(jsonResponse({ id: 101, title: "A draft", version: 1, status: "open" }));
  await first;
  const queueSizeWhileBPending = harness.workspace(2).get("offline_mutations").size;
  const third = harness.run("flushOfflineQueue()");
  await nextTurn();
  const bUploadCount = taskUploads(harness).filter((request) => request.userId === 2).length;
  uploadB.resolve(jsonResponse({ id: 201, title: "B draft", version: 1, status: "open" }));
  await Promise.all([second, third]);
  assert.equal(queueSizeWhileBPending, 1);
  assert.equal(bUploadCount, 1, "old finally must not start a duplicate B upload");
  assert.ok(!harness.effects.writes.some((write) => write.name === harness.workspaceName(2) && write.record?.title === "A draft"));
  assert.equal(harness.workspace(1).get("offline_mutations").size, 1);
  assert.equal(harness.workspace(2).get("offline_mutations").size, 0);
});

for (const status of [200, 403]) {
  test(`a superseded login completing with HTTP ${status} cannot change the newer account or its feedback`, async () => {
    const harness = createSessionHarness();
    const loginA = createDeferred();
    const toasts = [];
    harness.context.testToasts = toasts;
    harness.run(`
      readAuthPayload = () => ({ username_or_email: "fixture", password: "test-password" });
      toast = (message) => testToasts.push(message);
      bindEvents();
    `);
    let logins = 0;
    harness.controls.respond = (request) => {
      if (request.path === "/auth/login" && ++logins === 1) return loginA.promise;
    };
    const first = harness.dispatch(harness.nodes.authForm, "submit");
    await nextTurn();
    await harness.dispatch(harness.nodes.authForm, "submit");
    const feedback = harness.nodes.authMessage.textContent;
    loginA.resolve(jsonResponse(status === 200 ? sessionTokens(1) : { detail: "Old login forbidden" }, status));
    await first;
    assert.equal(harness.state.user.id, 2);
    assert.equal(harness.nodes.authMessage.textContent, feedback);
    assert.equal(toasts.length, 1);
  });
}

test("a terminal cookie restoration failure cannot suppress a newer successful login", async () => {
  const harness = createSessionHarness();
  const refresh = createDeferred();
  harness.controls.respond = (request) => {
    if (request.path === "/auth/refresh") return refresh.promise;
  };
  const restoration = harness.run("restorePersistentSession()");
  await nextTurn();
  harness.signIn(2);
  refresh.resolve(jsonResponse({ detail: "Old refresh expired" }, 403));
  await restoration;
  assert.equal(harness.run("shouldRestorePersistentSession()"), true);
  assert.equal(harness.context.localStorage.getItem("taskbridge.web.v1.persistentSessionSuppressed"), null);
  assert.equal(harness.state.user.id, 2);
});


test("an access-token refresh for the same account still completes activation", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  harness.controls.respond = (request) => {
    if (request.path === "/auth/me" && profileRequests(harness, 1).length === 1) {
      return jsonResponse({ detail: "Expired access token" }, 401);
    }
  };
  assert.equal(await harness.run("activateSessionSingleflight()"), true);
  assert.equal(harness.requests.filter((request) => request.path === "/auth/refresh").length, 1);
  assert.equal(harness.state.user.id, 1);
  assert.deepEqual(harness.effects.drafts, [1]);
});

test("activation can discover the account when only session tokens were restored", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  harness.state.user = null;
  assert.equal(await harness.run("activateSessionSingleflight()"), true);
  assert.equal(harness.state.user.id, 1);
  assert.equal(harness.state.offlineProfile.id, 1);
  assert.deepEqual(harness.effects.drafts, [1]);
});

test("an offline profile migration that completes late cannot overwrite the newly signed-in profile", async () => {
  const harness = createSessionHarness();
  harness.signIn(1);
  const migration = createDeferred();
  harness.context.pendingMigration = migration.promise;
  harness.run("offlineProfileLegacyMigrationPending = true; migrateLegacyOfflineDatabase = () => pendingMigration;");
  const preparation = harness.run("prepareOfflineProfileStorage()");
  harness.signIn(2);
  migration.resolve();
  await preparation;
  assert.equal(harness.state.offlineProfile.id, 2);
});
