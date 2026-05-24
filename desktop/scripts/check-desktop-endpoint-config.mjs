import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateSource = await readFile(resolve(root, "electron/state.ts"), "utf8");
const httpSource = await readFile(resolve(root, "electron/http.ts"), "utf8");
const settingsViewSource = await readFile(resolve(root, "src/views/SettingsView.vue"), "utf8");
const i18nSource = await readFile(resolve(root, "src/i18n.ts"), "utf8");
const electronViteSource = await readFile(resolve(root, "electron.vite.config.ts"), "utf8");

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
assert.doesNotMatch(
  settingsViewSource,
  /setSetting\("baseUrl"/,
  "settings page must not expose API base URL edits",
);
assert.doesNotMatch(
  settingsViewSource,
  /setSetting\("wsUrl"/,
  "settings page must not expose sync WebSocket URL edits",
);
assert.doesNotMatch(
  settingsViewSource,
  /v-model(?:\.trim)?="settings\.baseUrl"/,
  "settings page must hide the API base URL field",
);
assert.doesNotMatch(
  settingsViewSource,
  /v-model(?:\.trim)?="settings\.wsUrl"/,
  "settings page must hide the sync WebSocket URL field",
);
assert.doesNotMatch(
  i18nSource,
  /"settings\.(connection|baseUrl|wsUrl|baseUrlHint|wsUrlHint)"/,
  "settings page labels must not include backend connection copy",
);
assert.match(
  httpSource,
  /API request failed:/,
  "desktop API errors must include the resolved request URL for diagnosis",
);

console.log("desktop endpoint config check passed");
