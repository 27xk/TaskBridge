import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

const [
  appSource,
  serviceWorkerSource,
  readmeSource,
  architectureSource,
  localCheckSource,
  ciSource,
  releaseSource,
  scriptsReadmeSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "web/app.js"), "utf8"),
  readFile(resolve(repoRoot, "web/sw.js"), "utf8"),
  readFile(resolve(repoRoot, "README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/architecture.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "scripts/README.md"), "utf8"),
]);

for (const token of [
  "WEB_OFFLINE_DB_VERSION",
  "OFFLINE_QUEUE_STORE",
  "offlineDbName",
  "indexedDB.open",
  "cacheTasksForOffline",
  "hydrateCachedTasks",
  "queueOfflineMutation",
  "flushOfflineQueue",
  "./offline-core.js",
  "offline_status",
  "offline_queue_id",
]) {
  assert.ok(appSource.includes(token), `web/app.js must include ${token}`);
}

assert.match(
  appSource,
  /buildOfflineDatabaseName\(STORAGE_PREFIX, state\.apiBaseUrl, userId\)/,
  "web app must isolate offline databases by server and user",
);
assert.match(appSource, /OFFLINE_CACHE_READY_META_KEY\s*=\s*"cache_ready"/, "web offline resume must require a durable ready marker");
assert.match(appSource, /isOfflineCacheReadyForProfile/, "web offline resume must verify the cache before opening it");
assert.match(
  appSource,
  /isOfflineCacheReadyForProfile[\s\S]{0,220}offlineDatabaseExists\(dbName\)[\s\S]{0,160}openOfflineDatabase\(dbName\)/,
  "web offline resume checks must not create an empty database when the cache does not exist",
);
assert.match(appSource, /migrateLegacyOfflineDatabase/, "web offline storage must migrate the former per-user database");
assert.match(appSource, /reconcileCachedTaskSnapshot/, "web remote refreshes must reconcile stale cached tasks");
assert.match(
  appSource,
  /window\.addEventListener\("online",\s*\(\)\s*=>\s*\{[\s\S]*flushOfflineQueue/,
  "web app must flush the offline queue when the browser comes back online",
);
assert.match(
  appSource,
  /readSessionString\("refreshToken"/,
  "web app must restore refresh tokens from sessionStorage for same-tab reload recovery",
);
assert.match(
  appSource,
  /writeSessionString\("refreshToken"/,
  "web app must persist refresh tokens only in sessionStorage",
);
assert.doesNotMatch(
  appSource,
  /writeStoredString\("refreshToken"/,
  "web app must not persist refresh tokens in long-lived localStorage",
);
assert.doesNotMatch(
  appSource,
  /readStoredString\("refreshToken"/,
  "web app must not restore refresh tokens from long-lived localStorage",
);
assert.match(
  appSource,
  /navigator\.onLine[\s\S]*queueOfflineMutation/,
  "web app must queue task mutations while offline",
);
assert.match(
  appSource,
  /await\s+flushOfflineQueue\(\)/,
  "web app must attempt to flush local mutations during refresh flows",
);

assert.match(
  serviceWorkerSource,
  /CACHE_NAME\s*=\s*`taskbridge-web-shell-v\$\{WEB_VERSION\}`/,
  "web service worker cache version must track the published web client version",
);
assert.match(
  serviceWorkerSource,
  /`\.\/offline-core\.js\?v=\$\{WEB_VERSION\}`/,
  "web service worker must cache the versioned offline core module with the app shell",
);
assert.match(
  serviceWorkerSource,
  /event\.request\.mode === "navigate"/,
  "service worker must keep navigation fallback for the app shell",
);

assert.match(architectureSource, /IndexedDB/, "architecture docs must mention IndexedDB offline storage");
assert.match(architectureSource, /离线队列|offline queue/i, "architecture docs must mention the offline queue");
assert.match(readmeSource, /离线状态下新增、编辑和完成任务/, "README must describe offline task use in user-facing language");
assert.match(readmeSource, /继续离线使用/, "README must describe how Web users reopen cached tasks after the browser session ends");
assert.match(readmeSource, /重新登录后同步|登录并同步/, "README must explain that Web queue upload requires signing in again");

assert.match(localCheckSource, /check-web-offline-first\.mjs/, "check-local.ps1 must run the Web offline-first guard");
assert.match(localCheckSource, /check-web-offline-core\.mjs/, "check-local.ps1 must run the Web offline core behavior guard");
assert.match(ciSource, /check-web-offline-first\.mjs/, "CI workflow must run the Web offline-first guard");
assert.match(ciSource, /check-web-offline-core\.mjs/, "CI workflow must run the Web offline core behavior guard");
assert.match(releaseSource, /check-web-offline-first\.mjs/, "release workflow must run the Web offline-first guard");
assert.match(releaseSource, /check-web-offline-core\.mjs/, "release workflow must run the Web offline core behavior guard");
assert.match(scriptsReadmeSource, /check-web-offline-first\.mjs/, "scripts README must document the Web offline-first guard");
assert.match(scriptsReadmeSource, /check-web-offline-core\.mjs/, "scripts README must document the Web offline core behavior guard");

console.log("web offline-first check passed");
