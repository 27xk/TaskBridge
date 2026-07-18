import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [taskDaoSource, taskRepositorySource, settingsScreenSource, mainActivitySource, packageSource, localCheckSource] =
  await Promise.all([
    readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/local/TaskDao.kt"), "utf8"),
    readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/TaskRepository.kt"), "utf8"),
    readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt"), "utf8"),
    readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/MainActivity.kt"), "utf8"),
    readFile(resolve(desktopRoot, "package.json"), "utf8"),
    readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
  ]);

for (const token of [
  "data class SyncQueueCounts",
  "fun queueCounts(workspaceId: String)",
  "fun exhaustedChanges(workspaceId: String, limit: Int)",
  "fun resetExhaustedAttempts(workspaceId: String)",
  "suspend fun countFailedSyncTasks(workspaceId: String): Int",
]) {
  assert.match(taskDaoSource, new RegExp(escapeRegExp(token)), `Android DAO must expose ${token}`);
}

for (const token of [
  "suspend fun getSyncQueueCounts()",
  "suspend fun getExhaustedSyncQueuePreview",
  "suspend fun getFailedSyncTaskCount()",
  "suspend fun retryExhaustedSyncQueue()",
  "syncQueueDao.resetExhaustedAttempts(workspaceId())",
]) {
  assert.match(taskRepositorySource, new RegExp(escapeRegExp(token)), `Android repository must expose ${token}`);
}
assert.doesNotMatch(taskDaoSource, /WHERE ownerUserId = :ownerUserId/, "Android sync recovery queries must use server-and-user workspace isolation");

for (const token of [
  "syncManager: SyncManager",
  "syncQueueCounts",
  "failedSyncTaskCount",
  "recoverableSyncIssueCount",
  "exhaustedSyncQueuePreview",
  "retryExhaustedSyncQueue",
  "syncRecoverySummaryText",
  "syncRecoveryRetryButtonText",
  "syncManager.enqueueNetworkSync()",
  "syncManager.syncNow()",
]) {
  assert.match(settingsScreenSource, new RegExp(escapeRegExp(token)), `Android settings must expose ${token}`);
}

assert.match(
  settingsScreenSource,
  /syncRecoverySummaryText\([\s\S]*failedTaskCount = failedSyncTaskCount/,
  "Android settings must include failed sync task count in the recovery summary",
);
assert.match(
  settingsScreenSource,
  /val syncResult = syncManager\.syncNowAndWait\(\)[\s\S]{0,900}SyncRunState\.Success[\s\S]{0,900}SyncRunState\.Offline[\s\S]{0,900}SyncRunState\.Failure/,
  "Android settings must wait for sync and show distinct success, offline, and failure results",
);
assert.match(settingsScreenSource, /AppDynamicStatusText\([\s\S]{0,160}text = syncRecoveryNote[\s\S]{0,160}isError = syncRecoveryNoteIsError/, "Android sync recovery must render terminal retry feedback with an error state");
assert.match(mainActivitySource, /syncManager = container\.syncManager/, "MainActivity must pass SyncManager to SettingsScreen");
assert.match(packageSource, /check:android-sync-recovery/, "desktop package scripts must expose Android sync recovery check");
assert.match(localCheckSource, /check:android-sync-recovery/, "local check runner must include Android sync recovery check");

console.log("Android sync recovery config passed");
