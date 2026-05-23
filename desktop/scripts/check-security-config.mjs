import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(desktopRoot, "..");

const [
  androidBuildSource,
  releaseWorkflowSource,
  releaseComposeSource,
  backendComposeSource,
  deployComposeSource,
  mainSource,
  floatingSource,
  preloadSource,
  ipcSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "android/app/build.gradle.kts"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "deploy/docker-compose.release.yml"), "utf8"),
  readFile(resolve(repoRoot, "backend/docker-compose.yml"), "utf8"),
  readFile(resolve(repoRoot, "deploy/docker-compose.yml"), "utf8"),
  readFile(resolve(desktopRoot, "electron/main.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/floating-window.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/preload.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
]);

assert.doesNotMatch(
  androidBuildSource,
  /signingConfigs\.getByName\("debug"\)/,
  "Android release builds must not fall back to the debug signing key",
);
assert.match(
  androidBuildSource,
  /Release signing is required/,
  "Android release assemble/bundle tasks must fail clearly when signing secrets are missing",
);
assert.match(
  releaseWorkflowSource,
  /Validate Android signing secrets/,
  "GitHub release workflow must validate Android signing secrets before publishing an APK",
);

for (const [name, source] of [
  ["deploy/docker-compose.release.yml", releaseComposeSource],
  ["backend/docker-compose.yml", backendComposeSource],
  ["deploy/docker-compose.yml", deployComposeSource],
]) {
  assert.doesNotMatch(source, /["']?3306:3306["']?/, `${name} must not publish MySQL on all interfaces`);
  assert.doesNotMatch(source, /["']?6379:6379["']?/, `${name} must not publish Redis on all interfaces`);
}

assert.match(mainSource, /sandbox:\s*true/, "main Electron window must enable renderer sandbox");
assert.match(floatingSource, /sandbox:\s*true/, "floating Electron window must enable renderer sandbox");
assert.doesNotMatch(preloadSource, /setTokens:/, "renderer preload must not expose direct token write access");
assert.match(ipcSource, /assertTrustedSender/, "IPC handlers must validate the invoking renderer");
assert.doesNotMatch(ipcSource, /ipcMain\.handle\("[^"]+",\s*\(/, "IPC handlers must go through the trusted sender wrapper");

console.log("security config check passed");
