import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [statusBarSource, viewModelSource, screenSource, appUiSource] = await Promise.all([
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/components/SyncStatusBar.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/components/AppUi.kt"), "utf8"),
]);

assert.match(statusBarSource, /sealed interface SyncStatusMessage/, "Android sync status must use stable message types");
assert.match(statusBarSource, /data class BatchCompleted/, "Android sync status must model batch counts structurally");
assert.match(statusBarSource, /fun syncStatusMessageText/, "Android sync status must localize from message type, not source text");
assert.match(statusBarSource, /fun SyncStatusBar\(message: SyncStatusMessage/, "SyncStatusBar must receive typed status messages");
assert.doesNotMatch(statusBarSource, /localizeSyncText\(text: String/, "SyncStatusBar must not localize by matching text");

assert.match(viewModelSource, /syncMessage: SyncStatusMessage = SyncStatusMessage\.LocalCacheReady/, "TaskListUiState must store typed sync status");
assert.match(viewModelSource, /private fun requestSync\(message: SyncStatusMessage\)/, "TaskListViewModel must request sync with typed status");
assert.doesNotMatch(viewModelSource, /requestSync\("/, "TaskListViewModel must not pass natural-language sync status strings");
assert.match(screenSource, /SyncStatusBar\(uiState\.syncMessage/, "TaskListScreen must pass typed sync status to SyncStatusBar");
assert.ok(
  /statusBarsPadding\(\)/.test(screenSource) || /systemBarsPadding\(\)/.test(appUiSource),
  "TaskListScreen sync status bar must avoid the system status bar inset through the screen or shared page shell",
);

console.log("Android sync status message config passed");
