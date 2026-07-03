import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const contentStart = startIndex + start.length;
  const endIndex = source.indexOf(end, contentStart);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(contentStart, endIndex);
}

const requiredFiles = [
  "web/index.html",
  "web/local-trial.html",
  "web/self-hosting.html",
  "web/styles.css",
  "web/app.js",
  "web/offline-core.js",
  "web/manifest.webmanifest",
  "web/sw.js",
  "web/icon.svg",
  "web/icon-192.png",
  "web/icon-512.png",
  "web/icon-maskable-512.png",
  "web/_headers.example",
];

for (const file of requiredFiles) {
  assert.ok(existsSync(resolve(repoRoot, file)), `${file} must exist`);
}

const [
  htmlSource,
  appSource,
  offlineCoreSource,
  cssSource,
  manifestSource,
  serviceWorkerSource,
  webHeadersSource,
  backendMainSource,
  backendConfigSource,
  backendEnvSource,
  architectureSource,
  readmeSource,
  localCheckSource,
  ciSource,
  releaseSource,
  localTrialSource,
  selfHostingSource,
  smokeSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "web/index.html"), "utf8"),
  readFile(resolve(repoRoot, "web/app.js"), "utf8"),
  readFile(resolve(repoRoot, "web/offline-core.js"), "utf8"),
  readFile(resolve(repoRoot, "web/styles.css"), "utf8"),
  readFile(resolve(repoRoot, "web/manifest.webmanifest"), "utf8"),
  readFile(resolve(repoRoot, "web/sw.js"), "utf8"),
  readFile(resolve(repoRoot, "web/_headers.example"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/main.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/core/config.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/.env.example"), "utf8"),
  readFile(resolve(repoRoot, "docs/architecture.md"), "utf8"),
  readFile(resolve(repoRoot, "README.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "web/local-trial.html"), "utf8"),
  readFile(resolve(repoRoot, "web/self-hosting.html"), "utf8"),
  readFile(resolve(repoRoot, "scripts/smoke-web-client.mjs"), "utf8"),
]);

const webVersionMatch = htmlSource.match(/<meta name="taskbridge-version" content="([^"]+)" \/>/);
assert.ok(webVersionMatch, "web/index.html must expose the web client version for cache and error reporting");
const webVersion = webVersionMatch[1];

for (const token of [
  'rel="manifest"',
  'href="./styles.css"',
  `src="./app.js?v=${webVersion}"`,
  'id="serverBaseUrl"',
  'id="apiBaseUrl"',
  'id="testConnectionButton"',
  'id="authForm"',
  'id="taskList"',
  'id="appScreen" class="workspace" hidden',
  'id="cancelEditButton"',
]) {
  assert.ok(htmlSource.includes(token), `web/index.html must include ${token}`);
}

assert.match(htmlSource, /id="startupFallback"/, "web must show a startup recovery panel when modules fail to load");
assert.match(htmlSource, /id="clearStartupCacheButton"/, "web startup recovery must let users clear stale offline cache");
assert.match(htmlSource, /window\.taskBridgeWebReady/, "web startup recovery must be driven by an app-ready marker");
assert.match(htmlSource, /id="confirmDialog"/, "web must provide an in-app confirmation dialog");
assert.match(htmlSource, /id="confirmDialogConfirmButton"/, "web confirmation dialog must expose an explicit confirm button");
assert.match(htmlSource, /id="confirmDialogCancelButton"/, "web confirmation dialog must expose an explicit cancel button");
assert.match(htmlSource, /href="\.\/self-hosting\.html"/, "web first-run self-hosting help must link to a same-origin guide page");
assert.match(htmlSource, /id="exportLocalBackupButton"/, "web account panel must let users export a local backup");
assert.match(htmlSource, /id="importLocalBackupInput"/, "web account panel must let users import a local backup");
assert.match(htmlSource, /id="undoLocalBackupImportButton"/, "web account panel must let users undo a safe local backup import");
assert.match(htmlSource, /id="clearLocalDataButton"/, "web account panel must let users clear local device data");
assert.match(htmlSource, /id="localDataMessage"/, "web local data tools must expose an accessible result message");
assert.match(htmlSource, /id="syncSummary"/, "web sync status must show a plain-language summary by default");
assert.match(htmlSource, /id="syncAdvancedDiagnostics"/, "web sync internals must be hidden behind advanced diagnostics");

assert.doesNotMatch(
  htmlSource,
  /http-equiv="Content-Security-Policy"/,
  "web/index.html must not embed a development CSP; production CSP belongs in deployment headers",
);
assert.doesNotMatch(
  htmlSource,
  /connect-src http: https: ws: wss:/,
  "web CSP must not allow every HTTP/WebSocket destination",
);
assert.doesNotMatch(
  webHeadersSource,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/,
  "web production security headers must not include local development origins",
);
assert.match(
  webHeadersSource,
  /connect-src 'self' https:\/\/taskbridge\.example\.com wss:\/\/taskbridge\.example\.com/,
  "web production CSP must pin connect-src to the documented public API and WebSocket origins",
);
assert.match(
  htmlSource,
  /\u670d\u52a1\u5668\u5730\u5740[\s\S]*?id="serverBaseUrl"/,
  "web auth form must expose a user-facing server address before advanced endpoint fields",
);
assert.match(htmlSource, />\u8de8\u8bbe\u5907\u5f85\u529e</, "web brand subtitle must describe the product value");
assert.match(htmlSource, /id="syncStatusButton"[\s\S]*?>\u540c\u6b65\u72b6\u6001</, "web top connection action must open saved-server sync status");
assert.doesNotMatch(htmlSource, /id="syncStatusButton"[^>]*>\u68c0\u67e5\u8fde\u63a5/, "web top connection action must not duplicate the auth connection-test action");
assert.match(htmlSource, /id="authSubmitButton"[\s\S]*?>\u767b\u5f55</, "web auth submit must keep login as the primary user action");
assert.match(htmlSource, /id="testConnectionButton"[\s\S]*?>\u68c0\u67e5\u8fde\u63a5</, "web auth connection test must be a secondary troubleshooting action");
assert.match(htmlSource, /\u767b\u5f55\u4f1a\u81ea\u52a8\u68c0\u67e5\u8fde\u63a5/, "web auth copy must explain that login automatically checks the connection");
assert.doesNotMatch(htmlSource, /id="savePreferencesButton"/, "web auth must not show a separate remember-server action");
assert.doesNotMatch(htmlSource, /Browser client|\u4fdd\u5b58\u914d\u7f6e/, "web auth chrome must avoid technical copy on the first screen");
assert.match(
  htmlSource,
  /id="showAdvancedConnectionButton"[\s\S]*?\u81ea\u5b9a\u4e49\u4ee3\u7406\u6216\u9ad8\u7ea7\u90e8\u7f72\u8bbe\u7f6e/,
  "web auth API and device fields must be revealed through an intentional advanced connection action",
);
assert.match(
  htmlSource,
  /<details id="advancedConnectionSettings" class="advanced-connection-settings" hidden>[\s\S]*?<summary[^>]*>\u9ad8\u7ea7\u8fde\u63a5\u8bbe\u7f6e<\/summary>[\s\S]*?id="apiBaseUrl"[\s\S]*?id="deviceId"[\s\S]*?<\/details>/,
  "web auth API and device fields must stay hidden until the advanced connection action is used",
);
assert.match(
  htmlSource,
  /<details id="localTrialGuide"[\s\S]*?<summary[^>]*>Docker 本机试用<\/summary>/,
  "web first-use guide must clearly label the local trial as a Docker-backed path",
);
assert.match(
  htmlSource,
  /<details id="selfHostGuide"[\s\S]*?<summary[^>]*>自托管部署<\/summary>/,
  "web first-use guide must collapse self-hosting details behind a separate choice",
);
assert.doesNotMatch(
  htmlSource,
  /<span>只想本机试用：/,
  "web first-use guide must not put local-network instructions in the always-visible first screen",
);
assert.match(
  htmlSource,
  /id="usernameOrEmail"[\s\S]*?\brequired\b/,
  "web login account input must be required before submitting",
);
assert.match(
  htmlSource,
  /id="password"[\s\S]*?\brequired\b/,
  "web password input must be required before submitting",
);

for (const token of [
  "DEFAULT_API_BASE_URL",
  "DEFAULT_SERVER_BASE_URL",
  "deriveApiBaseUrlFromServer",
  "deriveServerBaseUrlFromApi",
  "applyServerBaseUrlToApi",
  "testConnection",
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/me",
  "/tasks",
  "class ApiError extends Error",
  "async function updateTask",
  'method: "PUT"',
  "expected_version",
  "editingTaskVersion",
  "beginTaskEdit",
  "renderTaskEditorState",
  "withExpectedVersion",
  "restoreTaskDraft",
  "persistTaskDraft",
  "clearTaskDraft",
  "taskDraftSessionKey",
  "persistTaskListPreferences",
  "restoreTaskListPreferences",
  "/sync/status",
  "/observability/client-error",
  "Authorization",
  '"X-Request-ID"',
  "makeClientRequestId",
  "APP_VERSION_META_SELECTOR",
  "sessionStorage",
  "navigator.serviceWorker.register",
  'dataset.taskAction = "edit"',
  "refreshSessionPromise",
  "fetchTaskListPages",
  "cursor_id",
  "cursor_updated_at",
  "MAX_TASK_PAGES",
  "getMetaCountLabel",
  "confirmTaskAction",
  "normalizeAuthError",
  "validateAuthPayload",
  "getConnectionBadgeState",
  "showSyncStatusFeedback",
  "getSyncHealthLabel",
  "getSyncHealthDetailLabel",
  "getSyncHealthValueLabel",
  "getSyncHealthActionText",
  "formatSyncLimitKey",
  "function formatDisplayDateTime",
  "markAppReady",
  "confirmUserAction",
]) {
  assert.ok(appSource.includes(token), `web/app.js must include ${token}`);
}

for (const token of [
  "getTaskViewLabel",
  "getTaskStatusLabel",
  "buildTaskMetaLabels",
]) {
  assert.ok(offlineCoreSource.includes(token), `web/offline-core.js must include ${token}`);
}

assert.match(
  appSource,
  new RegExp(`from "\\./offline-core\\.js\\?v=${webVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  "web app must import offline-core with the same version query as the shell",
);
assert.doesNotMatch(appSource, /window\.confirm\(/, "web app must use the in-app confirmation dialog instead of native window.confirm");
assert.doesNotMatch(appSource, /return online \? "\u7f51\u7edc\u5728\u7ebf" : "\u79bb\u7ebf\u53ef\u7528"/, "web connection badge must not equate browser connectivity with server connectivity");
assert.match(appSource, /\u670d\u52a1\u5668\u672a\u8fde\u63a5|\u670d\u52a1\u5668\u5df2\u8fde\u63a5/, "web connection badge must describe server connectivity");
assert.match(appSource, /\u670d\u52a1\u5668\u5730\u5740/, "web connection errors must guide users to check the server address");
assert.doesNotMatch(appSource, /\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001API \u5730\u5740|\u8bf7\u68c0\u67e5 API \u5730\u5740/, "web connection errors must not lead with API address jargon");

assert.doesNotMatch(
  appSource,
  /label:\s*"草稿箱"/,
  "web trash view must be labeled as recycle bin instead of draft box",
);
assert.doesNotMatch(
  appSource,
  /makeChip\(`queue \$\{task\.offline_queue_id\}`\)|makeChip\(`v\$\{task\.version\}`\)/,
  "web task cards must not expose internal queue ids or task versions as user-facing chips",
);
assert.match(
  appSource,
  /async function applyTaskAction\(task, action, options = \{\}\)[\s\S]*?const \{ confirm = true[\s\S]*?confirmTaskAction\(task, action\)/,
  "web destructive task actions must be confirmed by the shared mutation helper before mutation",
);
assert.match(appSource, /await applyTaskAction\(task, action\)/, "web task action clicks must route through the confirmed mutation helper");
assert.match(htmlSource, /<option value="0"[^>]*>\u65e0\u4f18\u5148\u7ea7<\/option>/, "web priority 0 must be labeled for users");
assert.match(htmlSource, /<option value="1"[^>]*>\u4f4e<\/option>/, "web priority 1 must be labeled for users");
assert.match(htmlSource, /<option value="2"[^>]*>\u4e2d<\/option>/, "web priority 2 must be labeled for users");
assert.match(htmlSource, /<option value="3"[^>]*>\u9ad8<\/option>/, "web priority 3 must be labeled for users");
assert.match(htmlSource, /<option value="4"[^>]*>\u7d27\u6025<\/option>/, "web priority 4 must be labeled for users");
assert.match(htmlSource, /<option value="5"[^>]*>\u6700\u9ad8<\/option>/, "web priority 5 must be labeled for users");
assert.doesNotMatch(
  htmlSource,
  /<option value="[0-5]">[0-5]<\/option>/,
  "web priority choices must not expose raw numbers as labels",
);
assert.match(
  offlineCoreSource,
  /export function getTaskPriorityLabel\(/,
  "web task metadata must use a user-facing priority label helper",
);
assert.match(
  offlineCoreSource,
  /getTaskPriorityLabel\(task\.priority\)/,
  "web task metadata must render priority through the user-facing label helper",
);
assert.match(
  offlineCoreSource,
  /Intl\.DateTimeFormat/,
  "web offline today and overdue views must calculate dates in the user's display time zone",
);
assert.match(
  offlineCoreSource,
  /timeZone/,
  "web offline date helpers must accept a display time zone",
);
assert.doesNotMatch(
  offlineCoreSource,
  /`P\$\{task\.priority\}`|`P\$\{priority\}`/,
  "web task metadata must not expose raw priority codes like P3",
);
assert.match(htmlSource, /<option value="inbox"[^>]*>\u6536\u4ef6\u7bb1<\/option>/, "web inbox list type must be localized");
assert.match(htmlSource, /<option value="today"[^>]*>\u4eca\u65e5<\/option>/, "web today list type must be localized");
assert.match(appSource, /"task\.list": "归类"/, "web task list-type field must be labeled as task location/category instead of checklist copy");
assert.match(appSource, /"task\.list": "Location"/, "web English task list-type field must avoid checklist copy");
assert.match(htmlSource, /data-i18n="task\.list">归类<\/span>/, "web list-type label fallback must match the current Location wording");
assert.doesNotMatch(htmlSource, /data-i18n="task\.list">清单<\/span>/, "web list-type label fallback must not show the old checklist wording before i18n hydrates");
assert.match(appSource, /"confirm\.clearDraft": "清空当前任务草稿吗？标题、内容、时间和步骤都会被清除。"/, "web clear-draft confirmation must avoid old list/checklist wording");
assert.doesNotMatch(appSource, /"confirm\.clearDraft": "[^"]*清单/, "web clear-draft confirmation must not use the old 清单 wording");
assert.doesNotMatch(
  htmlSource,
  /<option value="(?:inbox|today)">(?:inbox|today)<\/option>/,
  "web list type choices must not expose backend enum values as labels",
);
assert.match(appSource, /function renderEmptyTaskState\(/, "web task list must render an actionable empty state");
assert.match(appSource, /task-empty-action/, "web empty task state must include a direct action");
assert.match(appSource, /\u65b0\u5efa\u4efb\u52a1/, "web empty task state must guide users to create a task");
assert.match(appSource, /EMPTY_STATE_CREATE_VIEWS = new Set\(\["", "inbox", "today"\]\)/, "web Today empty state must offer direct Today task creation");
assert.match(
  appSource,
  /chip\.textContent = `\$\{getMetaCountLabel\(label\)\}: \$\{Number\(value \|\| 0\)\}`/,
  "web meta count chips must render user-facing labels",
);
assert.doesNotMatch(
  appSource,
  /chip\.textContent = `\$\{label\}: \$\{Number\(value \|\| 0\)\}`/,
  "web meta count chips must not expose internal count keys",
);
const authErrorMatches = appSource.match(/setStatus\(nodes\.authMessage,\s*normalizeAuthError\(error\)\)/g) ?? [];
assert.ok(authErrorMatches.length >= 2, "web auth and session errors must use actionable connection guidance");
assert.doesNotMatch(
  appSource,
  /nodes\.syncBadge\.textContent = status === "ready" \? "ready" : "degraded"/,
  "web sync badge must not expose backend health enum values",
);
assert.doesNotMatch(
  appSource,
  /\["database", database\]|\["redis", redis\]|\["websocket", websocket\]|\["server_time", serverTime\]|\["limits",/,
  "web sync details must not expose backend field names directly",
);
assert.match(
  appSource,
  /\[getSyncHealthDetailLabel\("action"\),\s*getSyncHealthActionText\(status\)\]/,
  "web sync details must include an actionable user-facing recommendation",
);
assert.doesNotMatch(
  appSource,
  /Object\.values\(limits\)[\s\S]*values\.join\(" \/ "\)/,
  "web sync limits must label limit names instead of rendering bare numbers",
);

assert.doesNotMatch(appSource, /\beval\s*\(/, "web app must not use eval");
assert.doesNotMatch(appSource, /innerHTML\s*=/, "web app must not assign innerHTML");
assert.doesNotMatch(
  appSource,
  /readStoredString\("refreshToken"/,
  "web app must not restore refresh tokens from localStorage",
);
assert.doesNotMatch(
  appSource,
  /writeStoredString\("refreshToken"/,
  "web app must not persist refresh tokens in localStorage",
);
assert.doesNotMatch(
  appSource,
  /localStorage\.setItem\(`\$\{STORAGE_PREFIX\}\.\$\{key\}`, value\)/,
  "web app must use scoped storage helpers instead of unguarded string persistence",
);
assert.doesNotMatch(
  appSource,
  /localStorage\.setItem\(key,\s*JSON\.stringify\(draft\)\)/,
  "web task drafts must not be persisted in long-lived localStorage",
);
assert.doesNotMatch(
  appSource,
  /const raw = localStorage\.getItem\(key\)/,
  "web task drafts must not be restored from long-lived localStorage",
);
assert.match(
  appSource,
  /sessionStorage\.setItem\(key,\s*JSON\.stringify\(draft\)\)/,
  "web task drafts must be limited to the current browser session",
);
assert.match(
  appSource,
  /async function fetchTaskListPages\([\s\S]*cursor_id[\s\S]*cursor_updated_at[\s\S]*pageTasks\.length < TASK_LIMIT/,
  "web app must follow backend task cursor pagination instead of silently stopping at the first page",
);
assert.match(cssSource, /@media \(max-width: 760px\)/, "web styles must include a mobile layout");
assert.match(cssSource, /\.startup-fallback/, "web styles must include visible startup recovery UI");
assert.match(cssSource, /\.confirm-backdrop/, "web styles must include an in-app confirmation overlay");
assert.match(cssSource, /\.sidebar-actions/, "web styles must lay out sidebar local-data actions");
assert.match(cssSource, /\.file-button/, "web styles must make backup import look like an action button");
assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*\.topbar-actions button/, "web mobile styles must keep topbar actions compact");
assert.match(cssSource, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, "web styles must protect the hidden attribute");
assert.match(cssSource, /data-task-action="edit"/, "web styles must style the edit action");

const manifest = JSON.parse(manifestSource);
assert.equal(manifest.name, "TaskBridge Web");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./index.html");
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest must define icons");
assert.ok(
  manifest.icons.some((icon) => String(icon.purpose || "").includes("maskable")),
  "manifest must include a maskable icon purpose for install surfaces",
);
assert.ok(
  manifest.icons.some((icon) => icon.src === "./icon-192.png" && String(icon.sizes).includes("192x192")),
  "manifest must include a 192px PNG icon for install surfaces",
);
assert.ok(
  manifest.icons.some((icon) => icon.src === "./icon-512.png" && String(icon.sizes).includes("512x512")),
  "manifest must include a 512px PNG icon for install surfaces",
);
assert.ok(
  manifest.icons.some((icon) => icon.src === "./icon-maskable-512.png" && String(icon.purpose || "").includes("maskable")),
  "manifest must include a dedicated 512px maskable PNG icon",
);

for (const token of [
  "CACHE_NAME",
  `WEB_VERSION = "${webVersion}"`,
  "./index.html",
  "./local-trial.html",
  "./self-hosting.html",
  "`./app.js?v=${WEB_VERSION}`",
  "`./offline-core.js?v=${WEB_VERSION}`",
  "./styles.css",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
]) {
  assert.ok(serviceWorkerSource.includes(token), `web/sw.js must cache ${token}`);
}
assert.match(
  serviceWorkerSource,
  /CACHE_NAME\s*=\s*`taskbridge-web-shell-v\$\{WEB_VERSION\}`/,
  "web/sw.js must derive the shell cache version from the web client version",
);
assert.match(serviceWorkerSource, /isVersionedShellAssetRequest/, "web service worker must detect versioned shell assets");
assert.match(serviceWorkerSource, /fetchFreshAndCache/, "web service worker must network-refresh versioned shell assets");
assert.match(
  serviceWorkerSource,
  /fetchFreshAndCache\(request\)\.catch\(\(\) => caches\.match\(cacheKeyForRequest\(request\)\)\)/,
  "web service worker must use network-first with a cache fallback for versioned shell assets",
);
assert.match(smokeSource, /\/self-hosting\.html/, "web HTTP smoke test must serve the self-hosting guide");

for (const token of [
  "source or deployment package",
  "cd TaskBridge/deploy",
  "cp .env.local.example .env",
  "Copy-Item .env.local.example .env",
  "/ready",
  "10.0.2.2",
]) {
  assert.ok(localTrialSource.includes(token), `web/local-trial.html must include ${token}`);
}
assert.doesNotMatch(localTrialSource, /git clone/, "web/local-trial.html must not require Git before users understand the local-trial path");
const localTrialEnglishSource = sourceBetween(localTrialSource, '<section lang="en">', "</section>");
for (const token of [
  "source or deployment package",
  "cd TaskBridge\\deploy",
  "Copy-Item .env.local.example .env",
  "docker compose -f docker-compose.release.yml up -d",
  "curl http://127.0.0.1:8000/ready",
]) {
  assert.ok(localTrialEnglishSource.includes(token), `web/local-trial.html English section must include ${token}`);
}

for (const token of [
  "docker compose -f docker-compose.release.yml up -d",
  "WEB_CORS_ORIGINS",
  "DATABASE_URL=mysql+pymysql://taskbridge:replace-with-a-strong-password@mysql:3306/taskbridge",
  "python -m tools.create_user",
  "https://taskbridge.example.com",
  "/ready",
]) {
  assert.ok(selfHostingSource.includes(token), `web/self-hosting.html must include ${token}`);
}
const selfHostingEnglishSource = sourceBetween(selfHostingSource, '<section lang="en">', "</section>");
for (const token of [
  "Copy-Item .env.example .env",
  "DATABASE_URL=mysql+pymysql://taskbridge:replace-with-a-strong-password@mysql:3306/taskbridge",
  "WEB_CORS_ORIGINS=https://taskbridge.example.com",
  "docker compose -f docker-compose.release.yml exec api python -m tools.create_user --username owner --email owner@example.com",
]) {
  assert.ok(selfHostingEnglishSource.includes(token), `web/self-hosting.html English section must include ${token}`);
}
assert.doesNotMatch(
  selfHostingSource,
  /FIRST_SUPERUSER_USERNAME/,
  "web/self-hosting.html must not imply an ignored env var creates the first account",
);

assert.doesNotMatch(appSource, /deploy\/README\.md/, "web first-run copy must not point users to an inaccessible repo path only");
assert.match(appSource, /WEB_BACKUP_FORMAT\s*=\s*"taskbridge\.local\.backup\.v1"/, "web local backup must use the shared backup format");
assert.match(appSource, /async function exportLocalBackup/, "web must implement local backup export");
assert.match(appSource, /async function importLocalBackupFromFile/, "web must implement local backup import");
assert.match(appSource, /is_deleted:\s*Boolean\(task\.is_deleted\)/, "web local backup export must preserve deleted task state");
assert.match(appSource, /is_deleted:\s*Boolean\(pickBackupField\(item,\s*"is_deleted",\s*"isDeleted"\)\)/, "web local backup import must accept deleted task state from snake_case and camelCase backups");
assert.match(appSource, /lastImportedBackupTaskIds/, "web local backup import must retain imported local task ids for undo");
assert.match(appSource, /LAST_IMPORTED_BACKUP_TASK_IDS_STORAGE_KEY/, "web backup import undo ids must survive a page refresh");
assert.match(appSource, /loadLastImportedBackupTaskIds\(\)/, "web must load persisted import undo ids when rendering local data tools");
assert.match(appSource, /saveLastImportedBackupTaskIds\(/, "web must persist import undo ids after a safe local backup import");
assert.match(appSource, /clearLastImportedBackupTaskIds\(\)/, "web must clear persisted import undo ids after undo or local data clearing");
assert.match(appSource, /async function undoLastLocalBackupImport/, "web must implement undo for the last safe local backup import");
assert.match(appSource, /async function deleteImportedLocalBackupTasks/, "web import undo must delete imported local queued tasks through a dedicated helper");
assert.match(
  appSource,
  /async function cacheImportedDeletedBackupTaskOffline/,
  "web backup import must cache deleted backup tasks locally without creating sync mutations",
);
const webBackupImportOfflineSource = sourceBetween(
  appSource,
  "async function importBackupTasksOffline",
  "async function deleteImportedLocalBackupTasks",
);
assert.match(
  webBackupImportOfflineSource,
  /if \(task\.is_deleted\) \{[\s\S]{0,180}cacheImportedDeletedBackupTaskOffline\(task\)/,
  "web backup import must use the local-only deleted-task path before normal create queuing",
);
assert.doesNotMatch(
  webBackupImportOfflineSource,
  /if \(task\.is_deleted\) \{[\s\S]{0,220}mutateTaskOffline/,
  "web backup import must not queue create-then-delete mutations for already deleted backup tasks",
);
assert.match(appSource, /localBackupImportUndoUnavailable/, "web must explain when backup import undo is unavailable after an online server import");
assert.match(appSource, /async function clearLocalDeviceData/, "web must implement clear-this-device data flow");
assert.match(appSource, /function isConflictSyncError\(/, "web offline queue must distinguish real conflicts from generic sync failures");
assert.match(appSource, /offline_status:\s*isConflict\s*\?\s*"conflict"\s*:\s*"sync_failed"/, "web offline queue must not mark every failed mutation as a conflict");
assert.match(appSource, /isConflictSyncError\(error\)/, "web offline queue failure handling must use conflict detection");
assert.match(appSource, /indexedDB\.deleteDatabase/, "web local data clearing must delete the offline database");
assert.match(appSource, /async function purgeTask/, "web trash must implement permanent delete");
assert.match(appSource, /\/tasks\/\$\{taskId\}\/purge/, "web permanent delete must call the backend purge endpoint for synced tasks");
assert.match(appSource, /dataset\.taskAction\s*=\s*"purge"/, "web trash task cards must expose a permanent delete action");
assert.match(
  webHeadersSource,
  /Content-Security-Policy:/,
  "web/_headers.example must document production CSP headers",
);
assert.match(
  webHeadersSource,
  /X-Content-Type-Options:\s*nosniff/,
  "web/_headers.example must document browser security headers",
);

assert.match(backendMainSource, /CORSMiddleware/, "backend must install CORS middleware for the web client");
assert.match(backendConfigSource, /web_cors_origins/, "backend settings must expose WEB_CORS_ORIGINS");
assert.match(backendConfigSource, /web_cors_origin_list/, "backend settings must normalize WEB_CORS_ORIGINS");
assert.match(backendEnvSource, /WEB_CORS_ORIGINS=/, "backend env example must document WEB_CORS_ORIGINS");
assert.match(architectureSource, /Web\/PWA/, "architecture docs must include the Web/PWA client");
assert.match(architectureSource, /cursor_id[\s\S]*cursor_updated_at/, "architecture docs must mention Web task cursor pagination");
assert.match(architectureSource, /任务查看、新建、编辑、搜索/, "architecture docs must include Web task editing");
assert.match(readmeSource, /### Web\/PWA/, "README must document how to start the Web/PWA client");
assert.match(readmeSource, /断网时可以继续查看和修改本机任务/, "README must document Web offline use in user-facing language");
assert.match(readmeSource, /任务新建、编辑、完成/, "README must document Web task editing");
assert.match(localCheckSource, /check-web-client\.mjs/, "check-local.ps1 must run the Web client guard");
assert.match(localCheckSource, /smoke-web-client\.mjs/, "check-local.ps1 must run the Web HTTP smoke test");
assert.match(ciSource, /check-web-client\.mjs/, "CI workflow must run the Web client guard");
assert.match(ciSource, /smoke-web-client\.mjs/, "CI workflow must run the Web HTTP smoke test");
assert.match(releaseSource, /check-web-client\.mjs/, "release workflow must run the Web client guard");
assert.match(releaseSource, /smoke-web-client\.mjs/, "release workflow must run the Web HTTP smoke test");

console.log("web client config check passed");
