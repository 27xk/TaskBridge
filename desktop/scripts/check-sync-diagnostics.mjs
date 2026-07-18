import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  escapeRegExp,
  extractOpeningTag,
  hasLiteralBooleanAttribute,
  workspaceRoot,
} from "./script-helpers.mjs";

const desktopRoot = workspaceRoot(import.meta.url);

const [syncStoreSource, settingsViewSource, syncRecoveryPanelSource, i18nSource, cssSource, workspaceCssSource, packageSource, preloadSource, ipcSource, envSource] = await Promise.all([
  readFile(resolve(desktopRoot, "src/stores/sync.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/SettingsView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsSyncRecoveryPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/i18n.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/assets/base.css"), "utf8"),
  readFile(resolve(desktopRoot, "src/assets/workspace.css"), "utf8"),
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(desktopRoot, "electron/preload.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/env.d.ts"), "utf8"),
]);

const settingsSurfaceSource = `${settingsViewSource}\n${syncRecoveryPanelSource}`;
const recoveryPanelTag = extractOpeningTag(settingsViewSource, "<SettingsSyncRecoveryPanel");
for (const contract of [
  ':diagnostics="syncStore.diagnostics"',
  'v-model:diagnostics-open="syncDiagnosticsOpen"',
  '@refresh="refreshDiagnostics"',
  '@retry="retryExhaustedQueue"',
  '@export-diagnostics="exportDiagnostics"',
]) {
  assert.ok(recoveryPanelTag.includes(contract), `settings recovery panel must wire ${contract}`);
}
for (const eventName of ["refresh", "retry", "exportDiagnostics"]) {
  assert.match(
    syncRecoveryPanelSource,
    new RegExp(`@click="emit\\('${eventName}'\\)"`),
    `settings recovery control must emit ${eventName}`,
  );
}

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
  assert.match(settingsSurfaceSource, new RegExp(escapeRegExp(token)), `settings page must expose ${token}`);
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
assert.match(syncRecoveryPanelSource, /settings\.diagnosticsSensitiveHint/, "settings page must disclose diagnostic package sensitivity");
const diagnosticsDetailsTag = extractOpeningTag(
  syncRecoveryPanelSource,
  '<details class="settings-advanced-details"',
);
assert.match(diagnosticsDetailsTag, /:open="diagnosticsOpen"/, "sync diagnostics details must bind its controlled open state");
assert.equal(hasLiteralBooleanAttribute(diagnosticsDetailsTag, "open"), false, "sync diagnostics details must not be forced open by a literal attribute");
assert.match(
  syncRecoveryPanelSource,
  /<summary>\{\{\s*settingsStore\.t\("settings\.syncDiagnostics"\)\s*\}\}<\/summary>[\s\S]*?<div class="sync-diagnostics">/,
  "settings sync diagnostics must be grouped in a collapsed details block",
);
assert.match(
  syncRecoveryPanelSource,
  /syncQueueActionText\(issue\.action\)/,
  "settings sync recovery center must render user-facing queue action labels",
);
assert.match(
  syncRecoveryPanelSource,
  /diagnostics\.recoverableSyncIssueCount === 0/,
  "settings sync recovery action must be enabled for any pending, failed, or exhausted sync issue",
);
assert.match(
  syncRecoveryPanelSource,
  /settings\.pendingOrFailedSyncRetryAvailable/,
  "settings sync recovery center must explain pending or failed retries when no exhausted queue rows are listed",
);
assert.doesNotMatch(
  syncRecoveryPanelSource,
  /settingsStore\.t\("settings\.syncIssueAction"\)\s*\}\}:\s*\{\{\s*issue\.action\s*\}\}/,
  "settings sync recovery center must not expose raw queue action values",
);
assert.match(envSource, /exportDiagnostics/, "desktop env types must expose diagnostic package export");
assert.match(cssSource, /sync-diagnostics/, "CSS must style the sync diagnostics block");
assert.match(cssSource, /settings-advanced-details summary/, "CSS must style the sync diagnostics summary");
assert.match(workspaceCssSource, /\.focus-workspace \.sync-issue-list/, "workspace CSS must preserve the recovery issue list override");
assert.match(workspaceCssSource, /\.focus-workspace \.settings-advanced-details/, "workspace CSS must preserve the recovery disclosure override");
assert.match(packageSource, /check:sync-diagnostics/, "package scripts must expose the sync diagnostics check");

console.log("sync diagnostics check passed");
