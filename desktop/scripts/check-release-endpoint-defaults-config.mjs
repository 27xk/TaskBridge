import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [desktopViteSource, desktopStateSource, androidBuildSource, releaseWorkflowSource] = await Promise.all([
  readFile(resolve(desktopRoot, "electron.vite.config.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/state.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/build.gradle.kts"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
]);

for (const [name, source] of [
  ["desktop electron-vite config", desktopViteSource],
  ["desktop runtime state", desktopStateSource],
  ["Android build config", androidBuildSource],
]) {
  assert.ok(!source.includes("192.168.10.30"), `${name} must not default to a developer LAN address`);
}

assert.match(desktopViteSource, /FALLBACK_BASE_URL = ""/, "desktop builds must not assume a server address when none is configured");
assert.match(desktopViteSource, /FALLBACK_WS_URL = ""/, "desktop builds must not assume a websocket address when none is configured");
assert.match(desktopStateSource, /FALLBACK_BASE_URL = ""/, "desktop runtime must prompt for an unconfigured server address");
assert.match(desktopStateSource, /FALLBACK_WS_URL = ""/, "desktop runtime must prompt for an unconfigured websocket address");
assert.match(androidBuildSource, /TASKBRIDGE_BASE_URL", "https:\/\/taskbridge\.example\.invalid\/api\/v1\/"/, "Android fallback must be a non-routable HTTPS placeholder");
assert.match(androidBuildSource, /TASKBRIDGE_WS_URL", "wss:\/\/taskbridge\.example\.invalid\/ws\/sync"/, "Android websocket fallback must be a non-routable WSS placeholder");
assert.match(androidBuildSource, /releaseEndpointLooksPlaceholder/, "Android release build must reject placeholder endpoints");
assert.match(
  androidBuildSource,
  /manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*true/,
  "Android builds must allow users to enter HTTP or WS endpoints at runtime",
);
assert.doesNotMatch(
  androidBuildSource,
  /Release endpoints must use HTTPS and WSS|releaseUsesCleartext|taskBridgeUsesCleartext/,
  "Android release build must not reject configured HTTP or WS endpoints",
);
assert.match(releaseWorkflowSource, /validate_endpoint "TASKBRIDGE_BASE_URL"/, "release workflow must validate public API endpoint");
assert.match(releaseWorkflowSource, /validate_endpoint "TASKBRIDGE_WS_URL"/, "release workflow must validate public websocket endpoint");

console.log("Release endpoint defaults config passed");
