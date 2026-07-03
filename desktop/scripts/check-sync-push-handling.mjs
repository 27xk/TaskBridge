import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { workspaceRoot } from "./script-helpers.mjs";

const rootDir = workspaceRoot(import.meta.url);
const source = readFileSync(resolve(rootDir, "src/sync/SyncManager.ts"), "utf8");
const taskStoreSource = readFileSync(resolve(rootDir, "src/stores/task.ts"), "utf8");
const dbSource = readFileSync(resolve(rootDir, "electron/db.ts"), "utf8");
const taskItemSource = readFileSync(resolve(rootDir, "src/components/TaskItem.vue"), "utf8");
const i18nSource = readFileSync(resolve(rootDir, "src/i18n.ts"), "utf8");
const failures = [];

function sliceBetween(haystack, startMarker, endMarker) {
  const start = haystack.indexOf(startMarker);
  if (start === -1) return "";
  const end = haystack.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? haystack.slice(start) : haystack.slice(start, end);
}

if (source.includes('result.status === "applied" && result.task')) {
  failures.push("applied sync results must clear the queue even when result.task is null");
}

if (!source.includes("markQueueItemApplied")) {
  failures.push("missing fallback handler for applied sync results without a task payload");
}

if (!source.includes("markQueueItemConflict")) {
  failures.push("missing fallback handler for conflict results without a server_task payload");
}

const conflictHandler = sliceBetween(source, "private async markQueueItemConflict", "private async markQueueItemFailed");
const conflictLocalReadIndex = conflictHandler.indexOf("const task = await getTask(queueItem.localId)");
const conflictServerWriteIndex = conflictHandler.indexOf("serverTaskToLocal(result.server_task");
if (conflictLocalReadIndex === -1) {
  failures.push("conflict sync results must load the local task before applying any server_task fallback");
}
if (conflictServerWriteIndex !== -1 && conflictServerWriteIndex < conflictLocalReadIndex) {
  failures.push("conflict sync results must not overwrite unsynced local edits with the server_task payload");
}
if (!conflictHandler.includes("...task") || !conflictHandler.includes('syncStatus: "conflict"')) {
  failures.push("conflict sync results must preserve local task fields and only mark the task as conflicted");
}
if (!conflictHandler.includes("conflictServerJson") || !conflictHandler.includes("conflictLocalJson")) {
  failures.push("conflict sync results must persist both the server snapshot and local snapshot for later resolution");
}
if (!taskStoreSource.includes("parseConflictServerTask") || !taskStoreSource.includes("serverTaskToLocal(serverTask")) {
  failures.push("conflict resolution must actually restore the captured server snapshot when the user chooses the cloud copy");
}
const resolveConflictHandler = sliceBetween(taskStoreSource, "async function resolveConflictUseServer", "async function forceOverwriteServer");
if (!resolveConflictHandler.includes("if (!serverTask) return;")) {
  failures.push("cloud conflict resolution must keep the conflict intact when the server snapshot is missing or invalid");
}
const missingSnapshotGuardIndex = resolveConflictHandler.indexOf("if (!serverTask) return;");
const removeQueueIndex = resolveConflictHandler.indexOf("removeQueueByLocalId");
if (removeQueueIndex !== -1 && missingSnapshotGuardIndex !== -1 && removeQueueIndex < missingSnapshotGuardIndex) {
  failures.push("cloud conflict resolution must not clear the queue before validating the server snapshot");
}
if (/syncStatus:\s*"synced"[\s\S]{0,160}conflictServerJson:\s*null/.test(resolveConflictHandler)) {
  failures.push("cloud conflict resolution must not mark a missing-snapshot conflict as synced");
}

if (!source.includes("serverId: result.server_id ?? task.serverId")) {
  failures.push("missing server_id/version fallback update for applied sync results");
}

const failedHandler = sliceBetween(source, "private async markQueueItemFailed", "private async pullRemoteChanges");
if (!dbSource.includes('"sync_failed"')) {
  failures.push("desktop task sync status must include sync_failed for non-conflict push failures");
}
if (!failedHandler.includes('syncStatus: "sync_failed"')) {
  failures.push("failed sync results must mark the task as sync_failed instead of conflict");
}
if (failedHandler.includes('syncStatus: "conflict"') || failedHandler.includes("conflictLocalJson: JSON.stringify(task)")) {
  failures.push("failed sync results must not create conflict snapshots or conflict status");
}
if (!taskItemSource.includes('case "sync_failed"') || !i18nSource.includes('"sync.failed"')) {
  failures.push("desktop task cards must show a user-facing failed-sync status");
}

if (!source.includes("SYNC_PUSH_BATCH_SIZE") || !source.includes("processedBatches")) {
  failures.push("sync push should drain pending queue in bounded batches instead of sending only the first 100 records");
}

if (!source.includes("SYNC_PULL_PAGE_SIZE") || !source.includes("response.has_more")) {
  failures.push("sync pull should request and process paginated pages until the server reports has_more=false");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("sync push handling check passed");
