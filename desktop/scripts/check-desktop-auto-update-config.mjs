import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const updaterPath = resolve(desktopRoot, "electron/updater.ts");
assert.ok(existsSync(updaterPath), "desktop/electron/updater.ts must exist");

const [
  packageSource,
  builderSource,
  mainSource,
  ipcSource,
  preloadSource,
  envSource,
  settingsSource,
  updaterSource,
  releaseSource,
  localCheckSource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(desktopRoot, "electron-builder.json"), "utf8"),
  readFile(resolve(desktopRoot, "electron/main.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/preload.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/env.d.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/SettingsView.vue"), "utf8"),
  readFile(updaterPath, "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
assert.equal(
  packageJson.dependencies?.["electron-updater"] || packageJson.devDependencies?.["electron-updater"],
  packageJson.dependencies?.["electron-updater"],
  "electron-updater must be a runtime dependency",
);
assert.equal(
  typeof packageJson.scripts?.["check:desktop-auto-update"],
  "string",
  "desktop/package.json must expose check:desktop-auto-update",
);

const builderConfig = JSON.parse(builderSource);
assert.ok(builderConfig.publish, "electron-builder must configure publish metadata for update manifests");
assert.equal(
  packageJson.repository?.url,
  "https://github.com/27xk/TaskBridge.git",
  "desktop package must declare the GitHub repository for release metadata",
);
assert.match(
  packageJson.scripts?.dist ?? "",
  /electron-builder --config electron-builder\.json --publish never/,
  "desktop dist must disable electron-builder implicit publishing on git tags",
);
assert.equal(builderConfig.publish?.[0]?.provider, "github", "electron-builder publish config must use GitHub");
assert.equal(builderConfig.publish?.[0]?.owner, "27xk", "electron-builder publish config must pin the GitHub owner");
assert.equal(builderConfig.publish?.[0]?.repo, "TaskBridge", "electron-builder publish config must pin the GitHub repo");
assert.equal(builderConfig.publish?.[0]?.channel, "latest", "electron-builder publish config must pin the stable update channel");
assert.equal(builderConfig.nsis?.differentialPackage, true, "NSIS differentialPackage must be enabled");

assert.match(mainSource, /initializeAutoUpdater\(mainWindow\)/, "main process must initialize auto updates");
assert.match(ipcSource, /app:check-for-updates/, "IPC must expose a manual update check");
assert.match(preloadSource, /checkForUpdates/, "preload bridge must expose manual update checks");
assert.match(preloadSource, /onUpdateStatus/, "preload bridge must expose update status events");
assert.match(envSource, /UpdateStatus/, "renderer typings must define update status");
assert.match(settingsSource, /checkForUpdates/, "settings UI must offer a manual update check");

for (const token of [
  "autoUpdater",
  "checkForUpdatesAndNotify",
  "TASKBRIDGE_DISABLE_AUTO_UPDATE",
  "TASKBRIDGE_UPDATE_CHANNEL",
  "autoUpdater.channel",
  "taskbridge:update-status",
]) {
  assert.ok(updaterSource.includes(token), `updater module must include ${token}`);
}

for (const token of [
  ".yml",
  ".blockmap",
  "latest.yml",
  "Validate desktop update artifacts",
  "No desktop auto-update latest.yml was produced.",
  "No desktop installer blockmap was produced.",
  "latest channel",
]) {
  assert.ok(releaseSource.includes(token), `release workflow must preserve auto-update artifact ${token}`);
}
assert.match(localCheckSource, /check:desktop-auto-update/, "local check runner must include the auto-update guard");

console.log("desktop auto-update config check passed");
