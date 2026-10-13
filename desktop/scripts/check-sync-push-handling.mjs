import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractBalancedBlock, workspaceRoot } from "./script-helpers.mjs";

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

const appliedHandler = extractBalancedBlock(source, "private async markQueueItemApplied(");
const conflictHandler = extractBalancedBlock(source, "private async markQueueItemConflict(");
for (const [name, handler] of [["applied", appliedHandler], ["conflict", conflictHandler]]) {
  const localReadIndex = handler.indexOf("await readTaskMutationState(queueItem.localId, workspaceKey)");
  const conditionalWriteIndex = handler.indexOf("await commitTaskChange(");
  if (localReadIndex === -1 || !/const task\s*=\s*state\.task/.test(handler)) {
    failures.push(`${name} sync results must read the task and queue state from their originating workspace`);
  }
  if (conditionalWriteIndex === -1 || conditionalWriteIndex < localReadIndex) {
    failures.push(`${name} sync results must conditionally commit only after reading the current local state`);
  }
  for (const contract of ["expectedWorkspaceKey: workspaceKey", "expected: task", "expectedQueueId: state.queueId", "removeQueueId: queueItem.id"]) {
    if (!handler.includes(contract)) failures.push(`${name} sync commits must include ${contract}`);
  }
  if (!handler.includes("TASK_COMMIT_RETRIES") || !handler.includes("committed.applied")) {
    failures.push(`${name} sync results must re-read and retry when their conditional commit loses a race`);
  }
  if (!handler.includes("if (!this.isRunActive(generation) || !task) return;")) {
    failures.push(`${name} sync results must stop when the local task was purged or its workspace run ended`);
  }
  if (/await\s+(?:saveTask|removeQueueItem|removeQueueByLocalId)\(/.test(handler)) {
    failures.push(`${name} sync results must not bypass the atomic task-and-queue commit`);
  }
}
if (conflictHandler.includes("serverTaskToLocal(result.server_task")) {
  failures.push("conflict sync results must keep the server payload as a snapshot instead of replacing local task fields");
}
if (!conflictHandler.includes("version: Math.max(task.version,")) {
  failures.push("conflict sync results must not roll back an already newer local server version");
}
const conditionalCommit = extractBalancedBlock(dbSource, "export function commitTaskChange(");
for (const contract of [
  "target.transaction(",
  "current.task![field] === request.expected![field]",
  "current.queueId !== request.expectedQueueId",
  "applied: false",
  "DELETE FROM sync_queue WHERE id = ? AND local_id = ?",
]) {
  if (!conditionalCommit.includes(contract)) failures.push(`atomic sync commits must preserve ${contract}`);
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
const resolveConflictHandler = extractBalancedBlock(taskStoreSource, "async function resolveTaskConflict(");
const missingSnapshotGuard = "if (useServer && (!serverTask || serverTask.id !== current.serverId))";
if (!resolveConflictHandler.includes(missingSnapshotGuard)) {
  failures.push("cloud conflict resolution must keep the conflict intact when the server snapshot is missing or invalid");
}
const missingSnapshotGuardIndex = resolveConflictHandler.indexOf(missingSnapshotGuard);
const conflictCommitIndex = resolveConflictHandler.indexOf("await commitTaskChange(");
if (conflictCommitIndex === -1 || missingSnapshotGuardIndex > conflictCommitIndex) {
  failures.push("cloud conflict resolution must validate its snapshot before committing the task and queue atomically");
}
for (const contract of ["assertCurrentScope(scope)", "sameTaskRecord(current, task)", "expectedWorkspaceKey: scope.workspaceKey", "expectedQueueId: state.queueId", "queueAction: useServer ? null : taskMutationAction(current, next)"]) {
  if (!resolveConflictHandler.includes(contract)) failures.push(`conflict resolution must preserve ${contract}`);
}
if (resolveConflictHandler.includes("await saveTask(") || resolveConflictHandler.includes("removeQueueByLocalId(")) {
  failures.push("conflict resolution must not split task persistence from queue persistence");
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
