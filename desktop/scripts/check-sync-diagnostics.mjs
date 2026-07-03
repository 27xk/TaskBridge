import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspaceRoot, escapeRegExp } from "./script-helpers.mjs";

const desktopRoot = workspaceRoot(import.meta.url);

const [syncStoreSource, settingsViewSource, i18nSource, cssSource, packageSource, preloadSource, ipcSource, envSource] = await Promise.all([
  readFile(resolve(desktopRoot, "src/stores/sync.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/SettingsView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/i18n.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/assets/base.css"), "utf8"),
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(desktopRoot, "electron/preload.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/env.d.ts"), "utf8"),
]);

for (const token of [
  "SyncDiagnostics",
  "pendingQueueCount",
  "exhaustedQueueCount",
  "getSyncQueueCounts",
  "queueCounts.pending",
  "queueCounts.exhausted",
  "conflictCount",
  "failedCount",
  "recoverableSyncIssueCount",
  "refreshDiagnostics",
  "listSyncQueue(500, true)",
  'task.syncStatus === "conflict"',
  'task.syncStatus === "sync_failed"',
]) {
  assert.match(syncStoreSource, new RegExp(escapeRegExp(token)), `sync store must include ${token}`);
}

for (const token of [
  "useSyncStore",
  "syncStore.diagnostics",
  "refreshDiagnostics",
  "settings.syncDiagnostics",
  "settings.pendingQueueCount",
  "settings.exhaustedQueueCount",
  "settings.conflictCount",
  "settings.failedTaskCount",
  "exportDiagnostics",
  "settings.exportDiagnostics",
  "syncQueueActionText",
]) {
  assert.match(settingsViewSource, new RegExp(escapeRegExp(token)), `settings page must expose ${token}`);
}

for (const key of [
  "settings.syncDiagnostics",
  "settings.pendingQueueCount",
  "settings.exhaustedQueueCount",
  "settings.conflictCount",
  "settings.failedTaskCount",
  "settings.diagnosticsUpdatedAt",
  "settings.refreshDiagnostics",
  "settings.exportDiagnostics",
  "settings.diagnosticsSensitiveHint",
  "settings.diagnosticsExported",
  "settings.diagnosticsExportCanceled",
]) {
  assert.match(i18nSource, new RegExp(escapeRegExp(`"${key}"`)), `i18n must include ${key}`);
}

assert.match(preloadSource, /exportDiagnostics/, "preload must expose diagnostic package export");
assert.match(preloadSource, /getQueueCounts/, "preload must expose sync queue aggregate counts");
assert.match(ipcSource, /db:queue:counts/, "IPC must expose sync queue aggregate counts");
assert.match(envSource, /interface SyncQueueCounts/, "desktop env types must define SyncQueueCounts");
assert.match(
  preloadSource,
  /exportDiagnostics:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("task:export-diagnostics"\)/,
  "preload must invoke the exact diagnostic IPC channel",
);
assert.match(
  ipcSource,
  /handle\("task:export-diagnostics",\s*\(\)\s*=>\s*exportDiagnosticsJson\(\)\)/,
  "IPC must bind the diagnostic channel to exportDiagnosticsJson",
);
assert.match(ipcSource, /exportDiagnosticsJson/, "IPC must implement diagnostic package export");
assert.match(ipcSource, /conflictServerJsonFingerprint/, "diagnostic package must include conflict server fingerprints");
assert.match(ipcSource, /conflictLocalJsonFingerprint/, "diagnostic package must include conflict local fingerprints");
assert.match(ipcSource, /titleFingerprint/, "diagnostic package must fingerprint task titles");
assert.match(ipcSource, /contentFingerprint/, "diagnostic package must fingerprint task content");
assert.match(ipcSource, /checklistJsonFingerprint/, "diagnostic package must fingerprint checklist JSON");
for (const token of [
  "app:",
  "settings:",
  "counts:",
  "conflict_tasks:",
  "sync_queue:",
  "sync_queue_export:",
  "getSyncQueueCounts",
  "syncQueueTruncated",
  "redactUrlSecrets(settings.baseUrl)",
  "redactUrlSecrets(settings.wsUrl)",
  "maskIdentifier(settings.deviceId)",
  "fingerprintDiagnosticText",
]) {
  assert.match(ipcSource, new RegExp(escapeRegExp(token)), `diagnostic export must include ${token}`);
}
for (const rawDiagnosticLeak of [
  /title:\s*task\.title/,
  /content:\s*item\.content/,
  /checklistJson:\s*item\.checklistJson/,
  /conflictServerJson:\s*serverSnapshot\.value/,
  /conflictLocalJson:\s*localSnapshot\.value/,
]) {
  assert.doesNotMatch(ipcSource, rawDiagnosticLeak, "diagnostic export must not include raw task text");
}
assert.doesNotMatch(ipcSource, /baseUrl:\s*settings\.baseUrl/, "diagnostics must redact baseUrl credentials");
assert.doesNotMatch(ipcSource, /wsUrl:\s*settings\.wsUrl/, "diagnostics must redact wsUrl credentials");
assert.doesNotMatch(ipcSource, /deviceId:\s*settings\.deviceId/, "diagnostics must mask the raw device id");
assert.match(settingsViewSource, /settings\.diagnosticsSensitiveHint/, "settings page must disclose diagnostic package sensitivity");
assert.match(
  settingsViewSource,
  /<details\b[^>]*class="settings-advanced-details"[^>]*>\s*<summary>\{\{\s*settingsStore\.t\("settings\.syncDiagnostics"\)\s*\}\}<\/summary>[\s\S]*?<div class="sync-diagnostics">/,
  "settings sync diagnostics must be grouped in a collapsed details block",
);
assert.doesNotMatch(
  settingsViewSource,
  /<details class="settings-advanced-details"\s+open\b/,
  "settings sync diagnostics must be collapsed by default",
);
assert.match(
  settingsViewSource,
  /syncQueueActionText\(issue\.action\)/,
  "settings sync recovery center must render user-facing queue action labels",
);
assert.match(
  settingsViewSource,
  /syncStore\.diagnostics\.recoverableSyncIssueCount === 0/,
  "settings sync recovery action must be enabled for any pending, failed, or exhausted sync issue",
);
assert.match(
  settingsViewSource,
  /settings\.pendingOrFailedSyncRetryAvailable/,
  "settings sync recovery center must explain pending or failed retries when no exhausted queue rows are listed",
);
assert.doesNotMatch(
  settingsViewSource,
  /settingsStore\.t\("settings\.syncIssueAction"\)\s*\}\}:\s*\{\{\s*issue\.action\s*\}\}/,
  "settings sync recovery center must not expose raw queue action values",
);
assert.match(envSource, /exportDiagnostics/, "desktop env types must expose diagnostic package export");
assert.match(cssSource, /sync-diagnostics/, "CSS must style the sync diagnostics block");
assert.match(cssSource, /settings-advanced-details summary/, "CSS must style the sync diagnostics summary");
assert.match(packageSource, /check:sync-diagnostics/, "package scripts must expose the sync diagnostics check");

console.log("sync diagnostics check passed");
