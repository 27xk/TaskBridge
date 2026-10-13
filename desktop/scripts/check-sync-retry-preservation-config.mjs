import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractBalancedBlock, workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [desktopSyncSource, androidSyncSource] = await Promise.all([
  readFile(resolve(desktopRoot, "src/sync/SyncManager.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/SyncRepository.kt"), "utf8"),
]);

const failedResult = extractBalancedBlock(desktopSyncSource, 'if (result.status === "failed")');
const failedHandler = extractBalancedBlock(desktopSyncSource, "private async markQueueItemFailed(");
assert.doesNotMatch(
  `${failedResult}\n${failedHandler}`,
  /(?:removeQueueItem|removeQueueByLocalId|enqueueChange)\(|(?:removeQueueId|queueAction)\s*:/,
  "desktop failed-result handling must keep the existing queue row intact for retry, including atomic commit options",
);
assert.match(
  failedResult,
  /await this\.markQueueItemFailed\(queueItem, generation\)/,
  "desktop failed results must persist their task failure state before recording another attempt",
);
assert.match(
  failedResult,
  /incrementQueueAttempt\(queueItem\.id\)/,
  "desktop sync must increment the failed queue row's attempts instead of dropping or replacing it",
);
for (const contract of [
  "readTaskMutationState(queueItem.localId, workspaceKey)",
  "state.queueId !== queueItem.id",
  "taskMatchesQueuedMutation(task, queueItem)",
  "commitTaskChange(",
  "expectedWorkspaceKey: workspaceKey",
  "expected: task",
  "expectedQueueId: state.queueId",
  'syncStatus: "sync_failed"',
  "TASK_COMMIT_RETRIES",
  "committed.applied",
]) {
  assert.ok(failedHandler.includes(contract), `desktop failed sync writes must protect newer local mutations with ${contract}`);
}
assert.doesNotMatch(
  androidSyncSource,
  /"failed" -> \{[\s\S]*?syncQueueDao\.deleteById\(queued\.id\)/,
  "Android sync must not delete a failed queue item before it can be retried",
);
assert.match(
  androidSyncSource,
  /"failed" -> \{[\s\S]*?syncQueueDao\.incrementAttempt\([\s\S]*?queued\.id/,
  "Android sync must increment failed queue attempts instead of dropping them",
);

console.log("Sync retry preservation config passed");
