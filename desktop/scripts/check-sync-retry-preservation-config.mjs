import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [desktopSyncSource, androidSyncSource] = await Promise.all([
  readFile(resolve(desktopRoot, "src/sync/SyncManager.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/SyncRepository.kt"), "utf8"),
]);

assert.doesNotMatch(
  desktopSyncSource,
  /if \(result\.status === "failed"\) \{[\s\S]*?removeQueueItem\(queueItem\.id\)/,
  "desktop sync must not delete a failed queue item before it can be retried",
);
assert.match(
  desktopSyncSource,
  /if \(result\.status === "failed"\) \{[\s\S]*?incrementQueueAttempt\(queueItem\.id\)/,
  "desktop sync must increment failed queue attempts instead of dropping them",
);
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
