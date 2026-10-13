import assert from "node:assert/strict";
import test from "node:test";

import { createAppHarness, createDeferred } from "./helpers/app-harness.mjs";
import { createSessionHarness } from "./helpers/session-harness.mjs";

test("Web deployment origin overrides an old saved endpoint and its session", () => {
  const oldServer = "https://old.example.test";
  const deployment = "https://new.example.test";
  const harness = createAppHarness({
    origin: `${deployment}/`,
    stored: {
      "taskbridge.web.v1.serverBaseUrl": oldServer,
      "taskbridge.web.v1.apiBaseUrl": `${oldServer}/api/v1`,
    },
    session: {
      "taskbridge.web.v1.accessToken": "old-access-token",
      "taskbridge.web.v1.refreshToken": "old-refresh-token",
      "taskbridge.web.v1.user": JSON.stringify({ id: 4, username: "old-user" }),
    },
  });

  assert.equal(harness.state.apiBaseUrl, `${deployment}/api/v1`);
  assert.equal(harness.state.accessToken, "");
  assert.equal(harness.state.refreshToken, "");
  assert.equal(harness.state.user, null);

  harness.run('persistTokens({ access_token: "new-access", refresh_token: "new-refresh" }, { broadcast: false })');

  assert.equal(harness.state.apiBaseUrl, `${deployment}/api/v1`);
  assert.equal(harness.context.localStorage.getItem("taskbridge.web.v1.apiBaseUrl"), `${deployment}/api/v1`);
  assert.equal(harness.context.sessionStorage.getItem("taskbridge.web.v1.apiBaseUrl"), `${deployment}/api/v1`);
});

test("a delayed registration response cannot overwrite the latest availability", async () => {
  const harness = createAppHarness();
  const older = createDeferred();
  const newer = createDeferred();
  let calls = 0;
  harness.context.registrationRequest = () => ++calls === 1 ? older.promise : newer.promise;
  harness.run("apiRequest = () => registrationRequest(); updateAuthMode = () => {};");
  const first = harness.run("loadRegistrationStatus()");
  const second = harness.run("loadRegistrationStatus()");
  newer.resolve({ registration_enabled: false });
  await second;
  older.resolve({ registration_enabled: true });
  await first;
  assert.equal(harness.state.registrationStatusKnown, true);
  assert.equal(harness.state.registrationEnabled, false);
});

for (const boundApi of [null, "https://previous.test/api/v1", "https://taskbridge.test/api/v1"]) {
  test(`session restoration requires this tab's endpoint binding: ${boundApi}`, () => {
    const session = {
      "taskbridge.web.v1.accessToken": "tab-access",
      "taskbridge.web.v1.refreshToken": "tab-refresh",
      "taskbridge.web.v1.user": JSON.stringify({ id: 7, username: "tab-user" }),
    };
    if (boundApi) session["taskbridge.web.v1.apiBaseUrl"] = boundApi;
    const harness = createAppHarness({
      stored: { "taskbridge.web.v1.apiBaseUrl": "https://taskbridge.test/api/v1" },
      session,
    });
    const matches = boundApi === "https://taskbridge.test/api/v1";
    assert.equal(harness.state.accessToken, matches ? "tab-access" : "");
    assert.equal(harness.state.user?.id ?? null, matches ? 7 : null);
  });
}

test("legacy offline tasks stay with their original server after signing into a configured deployment", async () => {
  const oldApi = "https://previous.test/api/v1";
  const harness = createSessionHarness({
    stored: {
      "taskbridge.web.v1.apiBaseUrl": oldApi,
      "taskbridge.web.v1.offlineProfile": JSON.stringify({ id: 7, username: "Previous account" }),
    },
  });
  const legacy = harness.context.testDatabase("taskbridge.web.v1.offline.user.7").stores;
  legacy.get("tasks").set(-1, { id: -1, title: "Previous server draft", status: "open" });
  legacy.get("offline_mutations").set(1, { offline_queue_id: 1, task_id: -1, action: "create", user_id: 7 });
  assert.equal(harness.state.offlineProfile.api_base_url, oldApi);

  harness.signIn(7);
  const owner = JSON.parse(harness.context.localStorage.getItem("taskbridge.web.v1.legacyOfflineProfile"));
  assert.equal(owner.api_base_url, oldApi, "new login must durably preserve the old database owner");
  await harness.run("prepareOfflineProfileStorage()");
  assert.equal(harness.workspace(7, oldApi).get("tasks").get(-1).title, "Previous server draft");
  assert.equal(harness.workspace(7, oldApi).get("offline_mutations").size, 1);
  assert.equal(harness.workspace(7).get("tasks").size, 0);
  assert.equal(harness.workspace(7).get("offline_mutations").size, 0);
  assert.equal(harness.state.offlineProfile.api_base_url, "https://taskbridge.test/api/v1");
});

test("legacy offline data without a recorded server is not assigned to the deployed service", async () => {
  const harness = createSessionHarness({
    stored: { "taskbridge.web.v1.offlineProfile": JSON.stringify({ id: 7, username: "Unknown source" }) },
  });
  assert.equal(harness.state.offlineProfile, null);
  const legacy = harness.context.testDatabase("taskbridge.web.v1.offline.user.7").stores;
  legacy.get("tasks").set(-1, { id: -1, title: "Unknown origin draft" });
  harness.signIn(7);
  await harness.run("prepareOfflineProfileStorage()");
  assert.equal(legacy.get("tasks").size, 1);
  assert.equal(harness.workspace(7).get("tasks").size, 0);
});
