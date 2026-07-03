import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspaceRoot } from "./script-helpers.mjs";

const root = workspaceRoot(import.meta.url);
const stateSource = await readFile(resolve(root, "electron/state.ts"), "utf8");
const httpSource = await readFile(resolve(root, "electron/http.ts"), "utf8");
const settingsViewSource = await readFile(resolve(root, "src/views/SettingsView.vue"), "utf8");
const settingsConnectionPanelSource = await readFile(
  resolve(root, "src/components/settings/SettingsConnectionPanel.vue"),
  "utf8",
);
const i18nSource = await readFile(resolve(root, "src/i18n.ts"), "utf8");
const electronViteSource = await readFile(resolve(root, "electron.vite.config.ts"), "utf8");
const settingsSurfaceSource = `${settingsViewSource}\n${settingsConnectionPanelSource}`;

assert.match(
  electronViteSource,
  /process\.env/,
  "desktop build must read TASKBRIDGE_BASE_URL from the build environment",
);
assert.match(
  electronViteSource,
  /TASKBRIDGE_BASE_URL/,
  "desktop build must reference TASKBRIDGE_BASE_URL",
);
assert.match(
  electronViteSource,
  /TASKBRIDGE_WS_URL/,
  "desktop build must read TASKBRIDGE_WS_URL from the build environment",
);
assert.match(
  electronViteSource,
  /__TASKBRIDGE_BASE_URL__/,
  "desktop build must inject the API URL into the Electron main bundle",
);
assert.match(
  electronViteSource,
  /__TASKBRIDGE_WS_URL__/,
  "desktop build must inject the WebSocket URL into the Electron main bundle",
);
assert.match(
  stateSource,
  /__TASKBRIDGE_BASE_URL__/,
  "desktop settings must use the build-injected API URL as the default",
);
assert.match(
  stateSource,
  /__TASKBRIDGE_WS_URL__/,
  "desktop settings must use the build-injected WebSocket URL as the default",
);
assert.match(
  stateSource,
  /LEGACY_BASE_URLS/,
  "desktop settings must migrate known stale API base URLs from earlier builds",
);
assert.match(
  stateSource,
  /migrateNetworkSettings\(\)/,
  "desktop settings migration must run when the Electron store is initialized",
);
assert.match(
  stateSource,
  /networkSettingsDefaultBaseUrl/,
  "desktop endpoint migration must remember the previous built-in API default so later user edits are preserved",
);
assert.match(
  stateSource,
  /networkSettingsDefaultWsUrl/,
  "desktop endpoint migration must remember the previous built-in WebSocket default so later user edits are preserved",
);
assert.match(
  settingsSurfaceSource,
  /serverUrlDraft/,
  "settings page must expose a single user-facing server address draft",
);
assert.match(
  settingsSurfaceSource,
  /deriveConnectionEndpoints/,
  "settings page must derive API and WebSocket endpoints from one server address",
);
assert.match(
  settingsSurfaceSource,
  /testConnection/,
  "settings page must include a connection test action",
);
assert.match(
  settingsSurfaceSource,
  /saveConnection/,
  "settings page must include a dedicated save connection action",
);
assert.match(
  settingsViewSource,
  /bridge\(\)\.api\.request[\s\S]*\/sync\/status/,
  "settings page connection test must call the backend sync status endpoint",
);
assert.match(
  settingsViewSource,
  /setSetting\("baseUrl"/,
  "settings page must persist API base URL edits",
);
assert.match(
  settingsViewSource,
  /setSetting\("wsUrl"/,
  "settings page must persist sync WebSocket URL edits",
);
assert.match(
  settingsSurfaceSource,
  /(:base-url="settings\.baseUrl"|v-model(?:\.trim)?="settings\.baseUrl")/,
  "settings page must pass the API base URL to the connection field",
);
assert.match(
  settingsSurfaceSource,
  /(:value="baseUrl"|v-model(?:\.trim)?="settings\.baseUrl")/,
  "settings page must expose the API base URL field",
);
assert.match(
  settingsSurfaceSource,
  /(:ws-url="settings\.wsUrl"|v-model(?:\.trim)?="settings\.wsUrl")/,
  "settings page must pass the sync WebSocket URL to the connection field",
);
assert.match(
  settingsSurfaceSource,
  /(:value="wsUrl"|v-model(?:\.trim)?="settings\.wsUrl")/,
  "settings page must expose the sync WebSocket URL field",
);
assert.match(
  i18nSource,
  /"settings\.(connection|serverUrl|serverUrlHint|applyServerUrl|saveConnection|connectionSaved|testConnection|connectionTesting|connectionReady|connectionFailed|baseUrl|wsUrl|baseUrlHint|wsUrlHint)"/,
  "settings page labels must include user-facing server connection copy",
);
assert.match(
  httpSource,
  /API request failed:/,
  "desktop API errors must include the resolved request URL for diagnosis",
);

console.log("desktop endpoint config check passed");
