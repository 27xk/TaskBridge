import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";
import { validateReleaseEndpoints } from "../scripts/validate-release-endpoints.mjs";

const state = await readFile(new URL("../electron/state.ts", import.meta.url), "utf8");
const ipc = await readFile(new URL("../electron/ipc.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/views/LoginView.vue", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/components/settings/SettingsConnectionPanel.vue", import.meta.url), "utf8");

test("configured desktop releases reject endpoint edits and hide address inputs", () => {
  assert.match(state, /const CONNECTION_LOCKED = app\.isPackaged \|\| Boolean\(DEFAULT_BASE_URL && DEFAULT_WS_URL\)/);
  assert.match(state, /if \(CONNECTION_LOCKED && \(key === "baseUrl" \|\| key === "wsUrl"\)\)/);
  assert.match(ipc, /if \(getSettings\(\)\.connectionLocked\) \{\s*throw new Error\("connection_locked"\)/);
  assert.match(login, /v-if="!settings\.connectionLocked" class="auth-labeled-field"/);
  assert.match(settings, /v-if="connectionLocked" class="settings-grid"/);
  assert.match(settings, /v-else class="settings-grid"/);
});

test("release migration switches endpoints, invalidates old tokens and preserves workspace history", async () => {
  const values = new Map(Object.entries({
    baseUrl: "https://old.test/api/v1",
    wsUrl: "wss://old.test/ws/sync",
    accessToken: "old-token", refreshToken: "old-refresh", currentUserId: 7,
    legacyGlobalDatabaseWorkspaceKey: "https://old.test|7",
    lastSyncTimeByWorkspace: { "https://old.test|7": "2026-10-01T00:00:00Z" },
  }));
  const { migrateNetworkSettings } = await loadTsFunctions("electron/state.ts", ["migrateNetworkSettings"], {
    CONNECTION_LOCKED: true,
    DEFAULT_BASE_URL: "https://new.test/api/v1",
    DEFAULT_WS_URL: "wss://new.test/ws/sync",
    settingsStore: {
      get: (key) => values.get(key),
      setMany: (updates) => Object.entries(updates).forEach(([key, value]) => values.set(key, value)),
      delete: (key) => values.delete(key),
    },
    clearTokens: () => ["accessToken", "refreshToken", "currentUserId"].forEach((key) => values.delete(key)),
  });
  migrateNetworkSettings();
  assert.equal(values.get("baseUrl"), "https://new.test/api/v1");
  assert.equal(values.get("wsUrl"), "wss://new.test/ws/sync");
  assert.equal(values.has("currentUserId"), false);
  assert.equal(values.has("accessToken"), false);
  assert.equal(values.get("legacyGlobalDatabaseWorkspaceKey"), "https://old.test|7");
  assert.equal(values.get("lastSyncTimeByWorkspace")["https://old.test|7"], "2026-10-01T00:00:00Z");
  assert.ok(state.indexOf("initializeLegacyWorkspaceOwnership(previousSettingsSchemaVersion);") < state.indexOf("migrateNetworkSettings();"));
});

test("locked endpoint IPC rejects writes before validating or persisting an override", async () => {
  const { setConnectionSettings } = await loadTsFunctions("electron/ipc.ts", ["setConnectionSettings"], {
    getSettings: () => ({ connectionLocked: true }),
    setSetting: () => assert.fail("a configured release must not persist endpoint overrides"),
  });
  assert.throws(() => setConnectionSettings("https://other.test/api/v1", "wss://other.test/ws/sync"), /connection_locked/);
});

test("desktop packaging requires a usable API and sync endpoint pair", () => {
  const valid = { TASKBRIDGE_BASE_URL: "https://tasks.test/api/v1/", TASKBRIDGE_WS_URL: "wss://tasks.test/ws/sync" };
  assert.doesNotThrow(() => validateReleaseEndpoints(valid));
  for (const value of ["", "ftp://tasks.test/api/v1", "https://taskbridge.example.invalid/api/v1", "https://tasks.test/"]) {
    assert.throws(() => validateReleaseEndpoints({ ...valid, TASKBRIDGE_BASE_URL: value }), /TASKBRIDGE_BASE_URL/);
  }
  assert.throws(() => validateReleaseEndpoints({ ...valid, TASKBRIDGE_WS_URL: "" }), /TASKBRIDGE_WS_URL/);
});

test("a configured client reports registration-check failures beside the sign-in form", async () => {
  const auth = { registrationStatusKnown: false, registrationEnabled: false, error: null, loadRegistrationStatus: async () => {} };
  const { ensureRegistrationModeAvailable } = await loadTsFunctions("src/views/LoginView.vue", ["ensureRegistrationModeAvailable"], {
    auth,
    settings: { connectionLocked: true },
    registrationBlocked: { value: false },
    saveConnection: () => assert.fail("a configured client must not request an endpoint change"),
  });
  assert.equal(await ensureRegistrationModeAvailable(), false);
  assert.equal(auth.error, "registration unknown");
});
