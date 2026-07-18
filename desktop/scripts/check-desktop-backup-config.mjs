import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  ipcSource,
  settingsViewSource,
  i18nSource,
  envSource,
  packageSource,
  localCheckSource,
  androidSettingsSource,
  androidTaskRepositorySource,
  androidMainActivitySource,
  androidSharedTextReaderSource,
  androidManifestSource,
  androidFilePathsSource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/SettingsView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/i18n.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/env.d.ts"), "utf8"),
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/TaskRepository.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/MainActivity.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/editor/SharedTextReader.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/AndroidManifest.xml"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/res/xml/file_paths.xml"), "utf8"),
]);

for (const token of [
  "EXPORT_TASK_BATCH_SIZE",
  "collectAllBackupTasks",
  "BackupImportErrorCode",
  "BackupImportResult",
  "backupImportFailure",
  "exported_count",
  "task_count",
  "scannedCount",
  "skippedCount",
  "randomUUID()",
]) {
  assert.match(ipcSource, new RegExp(escapeRegExp(token)), `desktop backup IPC must include ${token}`);
}

assert.doesNotMatch(
  ipcSource,
  /listTasks\(true,\s*10_000,\s*0\)/,
  "desktop backup export must not truncate to a single 10,000-task page",
);
assert.doesNotMatch(
  ipcSource,
  /return \{ canceled: false, importedCount: 0 \};/,
  "desktop backup import must not silently treat invalid payloads as a successful zero-task import",
);
assert.match(
  ipcSource,
  /fingerprintDiagnosticText/,
  "desktop diagnostics must fingerprint sensitive task fields instead of exporting raw text",
);
assert.match(ipcSource, /import \{ readFile,\s*stat,\s*writeFile \} from "node:fs\/promises"/, "desktop backup import must be able to check file size before reading it");
assert.match(ipcSource, /const fileStats = await stat\(filePath\)/, "desktop backup import preview must stat the selected file before reading it into memory");
assert.match(ipcSource, /fileStats\.size > MAX_IMPORT_BYTES/, "desktop backup import preview must reject oversized files before reading content");
assert.match(ipcSource, /function pickImportedField/, "desktop backup import must use a shared helper for snake_case and camelCase fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"list_type",\s*"listType"\)/, "desktop backup import must preserve Web list_type fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"due_time",\s*"dueTime"\)/, "desktop backup import must preserve Web due_time fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"remind_time",\s*"remindTime"\)/, "desktop backup import must preserve Web remind_time fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"repeat_rule",\s*"repeatRule"\)/, "desktop backup import must preserve Web repeat_rule fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"planned_date",\s*"plannedDate"\)/, "desktop backup import must preserve Web planned_date fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"completed_at",\s*"completedAt"\)/, "desktop backup import must preserve Web completed_at fields");
assert.match(ipcSource, /pickImportedField\(item,\s*"snoozed_until",\s*"snoozedUntil"\)/, "desktop backup import must preserve Web snoozed_until fields");
assert.match(ipcSource, /isDeleted:\s*Boolean\(pickImportedField\(item,\s*"is_deleted",\s*"isDeleted"\)\)/, "desktop backup import must preserve deleted task state");
const diagnosticExportSource = [
  sourceBetween(ipcSource, "function toDiagnosticConflictTask", "function toDiagnosticQueueItem"),
  sourceBetween(ipcSource, "function toDiagnosticQueueItem", "function fingerprintDiagnosticText"),
].join("\n");
for (const rawDiagnosticLeak of [
  /\.\.\.item/,
  /title:\s*task\.title/,
  /title:\s*item\.title/,
  /title:\s*title\.value/,
  /conflictServerJson:\s*serverSnapshot\.value/,
  /conflictServerJson:\s*task\.conflictServerJson/,
  /conflictLocalJson:\s*localSnapshot\.value/,
  /conflictLocalJson:\s*task\.conflictLocalJson/,
  /content:\s*item\.content/,
  /content:\s*content\.value/,
  /checklistJson:\s*item\.checklistJson/,
  /checklistJson:\s*checklistJson\.value/,
]) {
  assert.doesNotMatch(
    diagnosticExportSource,
    rawDiagnosticLeak,
    "desktop diagnostics must not export raw task text or snapshots",
  );
}

assert.match(androidManifestSource, /androidx\.core\.content\.FileProvider/, "Android backup export must use FileProvider");
assert.match(androidManifestSource, /@xml\/file_paths/, "Android FileProvider must declare shared export paths");
assert.match(androidFilePathsSource, /<cache-path[^>]+path="exports\/"/, "Android backup exports must be restricted to cache exports");
assert.match(androidSettingsSource, /FileProvider\.getUriForFile/, "Android backup export must share a file URI");
assert.match(androidSettingsSource, /Intent\.EXTRA_STREAM/, "Android backup export must use EXTRA_STREAM");
assert.match(androidMainActivitySource, /Intent\.EXTRA_STREAM/, "Android backup import must read shared backup file streams");
assert.match(androidMainActivitySource, /contentResolver\.openInputStream/, "Android backup import must open shared backup URIs");
assert.match(androidMainActivitySource, /sharedPayloadReadLimit\(mimeType\)/, "Android shared payload reads must select a MIME-aware byte limit");
assert.match(
  androidSharedTextReaderSource,
  /MAX_SHARED_TEXT_BYTES\s*=\s*1_048_576/,
  "Android ordinary shared text must keep a bounded 1MB input limit",
);
assert.match(
  androidSharedTextReaderSource,
  /MAX_SHARED_BACKUP_BYTES\s*=\s*20_000_000/,
  "Android share-target backup import must use the same 20MB cap as other backup import paths",
);
assert.match(androidMainActivitySource, /requireSharedPayloadWithinLimit\(text, isTaskBridgeBackupText\(text\)\)/, "Android must reapply the 1MB limit when shared JSON is not a TaskBridge backup");
assert.match(androidSettingsSource, /MAX_SELECTED_BACKUP_BYTES/, "Android settings backup picker must define a selected-file import size cap");
assert.match(
  androidSettingsSource,
  /MAX_SELECTED_BACKUP_BYTES\s*=\s*20_000_000/,
  "Android settings backup picker must keep the documented 20MB selected-file cap",
);
assert.match(
  androidTaskRepositorySource,
  /MAX_IMPORT_BYTES\s*=\s*20_000_000/,
  "Android backup parser must use the same 20MB cap as the settings picker and share target",
);
assert.match(androidSettingsSource, /readBackupTextWithLimit\(/, "Android settings backup picker must stream selected backup text with a byte limit");
assert.match(
  androidSettingsSource,
  /BackupTextReadResult\.TooLarge/,
  "Android settings backup picker must distinguish oversized files from empty files",
);
assert.match(
  androidSettingsSource,
  /formatBackupImportFailureMessage\(BackupImportErrorCode\.FileTooLarge/,
  "Android oversized backup selection must show the file-too-large import message",
);
assert.doesNotMatch(androidSettingsSource, /\.use \{ it\.readText\(\) \}/, "Android settings backup picker must not read the full selected file before checking size");
assert.doesNotMatch(
  androidSettingsSource,
  /putExtra\(Intent\.EXTRA_TEXT,\s*backupJson\)/,
  "Android backup export must not broadcast full backup JSON via EXTRA_TEXT",
);

for (const token of [
  "result.error",
  "settings.importFailed",
  "settings.importSkippedPrefix",
  "settings.importSkippedSuffix",
]) {
  assert.match(settingsViewSource, new RegExp(escapeRegExp(token)), `settings backup UI must include ${token}`);
}

for (const key of [
  "settings.importFailed",
  "settings.importSkippedPrefix",
  "settings.importSkippedSuffix",
]) {
  assert.match(i18nSource, new RegExp(escapeRegExp(`"${key}"`)), `i18n must include ${key}`);
}

assert.match(envSource, /BackupImportError/, "desktop env types must expose backup import error details");
assert.match(packageSource, /check:desktop-backup/, "package scripts must expose the desktop backup check");
assert.match(localCheckSource, /check:desktop-backup/, "local verification must run the desktop backup check");

console.log("desktop backup config check passed");

function sourceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(start, -1, `missing ${startToken}`);
  assert.notEqual(end, -1, `missing ${endToken}`);
  return source.slice(start, end);
}
