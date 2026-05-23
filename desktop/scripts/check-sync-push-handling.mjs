import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(rootDir, "src/sync/SyncManager.ts"), "utf8");
const failures = [];

if (source.includes('result.status === "applied" && result.task')) {
  failures.push("applied sync results must clear the queue even when result.task is null");
}

if (!source.includes("markQueueItemApplied")) {
  failures.push("missing fallback handler for applied sync results without a task payload");
}

if (!source.includes("markQueueItemConflict")) {
  failures.push("missing fallback handler for conflict results without a server_task payload");
}

if (!source.includes("serverId: result.server_id ?? task.serverId")) {
  failures.push("missing server_id/version fallback update for applied sync results");
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
