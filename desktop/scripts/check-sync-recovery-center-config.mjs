import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { escapeRegExp, extractOpeningTag, workspaceRoot } from "./script-helpers.mjs";

const desktopRoot = workspaceRoot(import.meta.url);

const [syncStoreSource, settingsViewSource, syncRecoveryPanelSource, i18nSource, cssSource, workspaceCssSource, packageSource, localCheckSource] = await Promise.all([
  readFile(resolve(desktopRoot, "src/stores/sync.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/SettingsView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsSyncRecoveryPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/i18n.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/assets/base.css"), "utf8"),
  readFile(resolve(desktopRoot, "src/assets/workspace.css"), "utf8"),
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(desktopRoot, "../scripts/check-local.ps1"), "utf8"),
]);

const settingsSurfaceSource = `${settingsViewSource}\n${syncRecoveryPanelSource}`;
const recoveryPanelTag = extractOpeningTag(settingsViewSource, "<SettingsSyncRecoveryPanel");
assert.ok(recoveryPanelTag.includes('@retry="retryExhaustedQueue"'), "settings recovery panel must wire retry to its parent handler");
assert.match(syncRecoveryPanelSource, /@click="emit\('retry'\)"/, "settings recovery retry control must emit retry");

for (const token of [
  "SyncQueueIssue",
  "exhaustedQueueItems",
  "toSyncQueueIssue",
  "retryExhaustedQueue",
  "syncNow(true)",
]) {
  assert.match(syncStoreSource, new RegExp(escapeRegExp(token)), `sync store must expose recovery center token: ${token}`);
}

for (const token of [
  "retryExhaustedQueue",
  ':diagnostics="syncStore.diagnostics"',
  "diagnostics.exhaustedQueueItems",
  "settings.syncRecoveryCenter",
  "settings.retryExhaustedQueue",
  "settings.noExhaustedQueueItems",
  "sync-issue-list",
]) {
  assert.match(settingsSurfaceSource, new RegExp(escapeRegExp(token)), `settings page must expose recovery center token: ${token}`);
}

for (const key of [
  "settings.syncRecoveryCenter",
  "settings.retryExhaustedQueue",
  "settings.retryExhaustedDone",
  "settings.noExhaustedQueueItems",
  "settings.syncIssueAction",
  "settings.syncIssueAttempts",
  "settings.syncIssueCreatedAt",
]) {
  assert.match(i18nSource, new RegExp(escapeRegExp(`"${key}"`)), `i18n must include ${key}`);
}

assert.match(cssSource, /sync-issue-list/, "CSS must style the sync issue list");
assert.match(workspaceCssSource, /\.focus-workspace \.sync-issue-list/, "workspace CSS must preserve the sync issue list layout");
assert.match(packageSource, /check:sync-recovery-center/, "package scripts must expose sync recovery center check");
assert.match(localCheckSource, /check:sync-recovery-center/, "local check runner must include sync recovery center check");

console.log("sync recovery center check passed");
