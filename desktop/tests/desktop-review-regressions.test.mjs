import assert from "node:assert/strict";
import test from "node:test";

import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";
import { loadTsModule } from "./helpers/load-ts-module.mjs";

const clock = await loadTsModule("shared/quick-add-parser.ts");
const endpoints = await loadTsModule("shared/connection-endpoints.ts");
const errors = await loadTsModule("shared/user-facing-errors.ts");
const fixedNow = "2026-05-20T08:00:00.000Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return Date.parse(fixedNow); }
}

test("postponing tomorrow keeps 09:00, shifts reminder offsets and clears snooze", async () => {
  const mutationPolicy = await loadTsFunctions("shared/task-mutation-policy.ts", ["rescheduleTask", "shiftedTaskReminder", "validateTaskScheduleDate"], {
    ...clock, Date: FixedDate,
  });
  const cases = [
    [null, null],
    ["2026-05-19T07:00:00.000Z", "2026-05-21T09:00:00.000Z"],
    ["2026-05-20T12:00:00.000Z", "2026-05-21T06:00:00.000Z"],
    ["2026-05-20T14:30:00.000Z", "2026-05-21T08:30:00.000Z"],
  ];
  for (const [remindTime, expectedReminder] of cases) {
    let saved;
    const { postponeTomorrow } = await loadTsFunctions("src/stores/task.ts", ["postponeTomorrow"], {
      ...clock, ...mutationPolicy, Date: FixedDate,
      settingsStore: { displayTimeZone: "UTC" },
      mutateOne: async (kind, task, patch) => {
        assert.equal(kind, "schedule");
        saved = { ...task, ...patch(task) };
        return saved;
      },
    });
    await postponeTomorrow({
      localId: "reminder-task", serverId: 1, title: "Postpone me", status: "todo",
      listType: "today", plannedDate: "2026-05-20", dueTime: "2026-05-20T15:00:00.000Z",
      remindTime, snoozedUntil: "2026-05-20T14:00:00.000Z", syncStatus: "synced",
    });
    assert.equal(saved.listType, "inbox");
    assert.equal(saved.plannedDate, "2026-05-21");
    assert.equal(saved.dueTime, "2026-05-21T09:00:00.000Z");
    assert.equal(saved.remindTime, expectedReminder);
    assert.equal(saved.snoozedUntil, null);
  }
});

async function loginHarness(serverUrl, { saveError, authError } = {}) {
  const state = {
    submitting: { value: false }, mode: { value: "login" }, email: { value: "user@example.com" },
    username: { value: "" }, password: { value: "password" }, serverUrlDraft: { value: serverUrl },
    settings: { baseUrl: "", wsUrl: "" }, advancedEndpointsEdited: { value: false },
    advancedConnectionOpen: { value: false }, connectionNote: { value: "" }, connectionNoteTone: { value: null },
  };
  const calls = [];
  state.auth = {
    error: null,
    login: async () => {
      calls.push("login");
      if (authError) { state.auth.error = authError; throw new Error(authError); }
    },
    register: async () => { calls.push("register"); },
  };
  const functions = await loadTsFunctions("src/views/LoginView.vue", ["submit", "saveConnection"], {
    ...endpoints, ...errors, ...state,
    settingsStore: { t: (key) => key, language: "en-US" },
    bridge: () => ({ app: { setConnection: async (baseUrl, wsUrl) => {
      calls.push("saveConnection");
      if (saveError) throw new Error(saveError);
      return { baseUrl, wsUrl };
    } } }),
    emit: (event) => calls.push(event),
  });
  return { ...functions, state, calls };
}

test("invalid server addresses report a visible error without submitting credentials", async () => {
  for (const url of ["", "https://", "ftp://server.example.com"]) {
    const { submit, state, calls } = await loginHarness(url);
    await submit();
    assert.ok(state.connectionNote.value, url || "empty address");
    assert.equal(state.connectionNoteTone.value, "error");
    assert.equal(state.advancedConnectionOpen.value, true);
    assert.equal(state.submitting.value, false);
    assert.equal(calls.includes("login"), false);
    assert.equal(calls.includes("authenticated"), false);
  }
});

test("connection persistence failures are surfaced before authentication", async () => {
  const { submit, state, calls } = await loginHarness("http://127.0.0.1:18080", { saveError: "write failed" });
  await submit();
  assert.ok(state.connectionNote.value);
  assert.equal(state.connectionNoteTone.value, "error");
  assert.equal(state.advancedConnectionOpen.value, true);
  assert.deepEqual(calls, ["saveConnection"]);
});

test("normal login stays direct and account errors remain account errors", async () => {
  const success = await loginHarness("http://127.0.0.1:18080");
  await success.submit();
  assert.deepEqual(success.calls, ["saveConnection", "login", "authenticated"]);
  assert.equal(success.state.advancedConnectionOpen.value, false);
  const failure = await loginHarness("http://127.0.0.1:18080", { authError: "invalid credentials" });
  await failure.submit();
  assert.equal(failure.state.auth.error, "invalid credentials");
  assert.equal(failure.state.connectionNote.value, "");
  assert.equal(failure.state.advancedConnectionOpen.value, false);
  assert.equal(failure.calls.includes("authenticated"), false);
  assert.equal(failure.state.submitting.value, false);
});


test("late successful API replies and queued requests cannot cross workspaces", async () => {
  let workspace = "workspace-a";
  let release;
  let sent = 0;
  class ApiHttpError extends Error {}
  const { performApiRequest, sendApiRequest } = await loadTsFunctions("electron/http.ts", ["performApiRequest", "sendApiRequest"], {
    getActiveWorkspaceKey: () => workspace,
    getTokens: () => ({ accessToken: "token-a" }),
    getSettings: () => ({ baseUrl: "http://localhost/api/v1", deviceId: "device" }),
    normalizeApiPath: (path) => path,
    persistAuthTokensFromResponse: () => {},
    ApiHttpError,
    requestJson: async () => { sent += 1; return new Promise((resolve) => { release = resolve; }); },
  });
  assert.equal(typeof sendApiRequest, "function");
  const payload = { method: "POST", url: "/tasks/1/next-occurrence", expectedWorkspaceKey: "workspace-a" };
  const pending = performApiRequest(payload);
  workspace = "workspace-b";
  release({ code: 0, message: "ok", data: { id: 42, title: "Account A child" } });
  await assert.rejects(pending, /workspace/i);
  await assert.rejects(performApiRequest(payload), /workspace/i);
  assert.equal(sent, 1);
});

test("next occurrence sends its originating workspace to both HTTP and SQLite", async () => {
  const authStore = { workspaceKey: "workspace-a" };
  const requests = [];
  const writes = [];
  const { saveRemoteTask } = await loadTsFunctions("src/db/task.dao.ts", ["saveRemoteTask"], {
    bridge: () => ({ db: { upsertTask: async (...args) => { writes.push(args); return args[0]; } } }),
  });
  const { createNextOccurrence } = await loadTsFunctions("src/stores/task.ts", ["createNextOccurrence"], {
    authStore,
    createRemoteNextOccurrence: async (...args) => { requests.push(args); return { id: 42, title: "Child" }; },
    serverTaskToLocal: (remote) => ({ serverId: remote.id, title: remote.title }),
    saveRemoteTask, load: async () => {},
  });
  await createNextOccurrence({ serverId: 1, repeatRule: "daily" }, { reload: false });
  assert.deepEqual(requests, [[1, "workspace-a"]]);
  assert.equal(writes[0][1], true);
  assert.equal(writes[0][2], "workspace-a");
});

test("a next occurrence response is ignored when its renderer workspace changes", async () => {
  const authStore = { workspaceKey: "workspace-a" };
  let release;
  let writes = 0;
  const { createNextOccurrence } = await loadTsFunctions("src/stores/task.ts", ["createNextOccurrence"], {
    authStore,
    createRemoteNextOccurrence: async () => new Promise((resolve) => { release = resolve; }),
    serverTaskToLocal: (remote) => remote,
    saveRemoteTask: async (task) => { writes += 1; return task; }, load: async () => {},
  });
  const pending = createNextOccurrence({ serverId: 1, repeatRule: "daily" }, { reload: false });
  authStore.workspaceKey = "workspace-b";
  release({ id: 42, title: "Account A child" });
  assert.equal(await pending, null);
  assert.equal(writes, 0);
});
