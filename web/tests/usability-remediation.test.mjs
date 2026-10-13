import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(webRoot, "..");
const [html, app, styles, nginx, readme, quickStart, security] = await Promise.all([
  readFile(resolve(webRoot, "index.html"), "utf8"),
  readFile(resolve(webRoot, "app.js"), "utf8"),
  readFile(resolve(webRoot, "styles.css"), "utf8"),
  readFile(resolve(repoRoot, "deploy/nginx.web.conf"), "utf8"),
  readFile(resolve(repoRoot, "README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/user-quick-start.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/security.md"), "utf8"),
]);

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("task workspace is list-first with compact quick add and a hidden editor drawer", () => {
  assert.match(html, /id="taskListStack"[^>]*class="[^"]*task-list-stack/);
  assert.match(html, /id="quickTaskForm"/);
  assert.match(html, /id="quickTaskTitle"[^>]*maxlength="255"/);
  assert.match(html, /id="taskCreateDetails"[^>]*class="[^"]*task-editor-drawer[^"]*"[^>]*hidden/);
  assert.match(styles, /\.task-editor-drawer\s*\{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(app, /beginTaskEdit\([\s\S]{0,300}scrollIntoView/);
});

test("web tasks expose named controls and quick scheduling actions", () => {
  assert.match(app, /formatMessage\("task\.moreActionsFor",\s*\{\s*title:/);
  for (const action of ["plan-today", "plan-tomorrow", "snooze-later"]) {
    assert.match(app, new RegExp(`["']${action}["']`));
  }
});

test("danger dialogs focus cancel and responsive DOM order follows visual order", () => {
  assert.match(app, /danger\s*\?\s*nodes\.confirmDialogCancelButton\s*:\s*nodes\.confirmDialogConfirmButton/);
  assert.match(app, /workspaceMobileQuery\.matches/);
  assert.match(app, /insertBefore\(nodes\.sidebar,\s*nodes\.mainPanel\)/);
  assert.match(app, /taskListStack.*scrollIntoView/s);
});

test("web session can recover through an HttpOnly refresh cookie", () => {
  assert.match(app, /getApiRequestCredentialsMode\(state\.apiBaseUrl,\s*location\.origin\)/);
  assert.match(app, /getApiRequestCredentialsMode/);
  assert.match(app, /restorePersistentSession/);
  assert.match(app, /body:\s*\{\s*device_id:\s*state\.deviceId\s*\}/s);
  assert.match(app, /apiRequest\("\/auth\/session",\s*\{\s*method:\s*"DELETE"/s);
});

test("explicit local suppression wins over stale session storage and token broadcasts", () => {
  const boot = sourceBetween(app, "function boot()", "function setupSessionCoordination()");
  const sessionMessage = sourceBetween(app, "async function applySharedSessionMessage", "function broadcastSessionTokens");
  const signedOutBroadcast = sourceBetween(app, "function broadcastSessionSignedOut", "function cacheNodes");

  assert.match(boot, /if \(hasSession\(\) && shouldRestorePersistentSession\(\)\)/);
  assert.match(
    sessionMessage,
    /message\.type === "tokens"[\s\S]{0,320}shouldRestorePersistentSession\(incomingUserId\)/,
  );
  const signedOutIndex = sessionMessage.indexOf('message.type === "signed-out"');
  const signedOutSuppressionIndex = sessionMessage.indexOf("suppressPersistentSession(message.userId)");
  assert.ok(
    signedOutIndex >= 0 && signedOutSuppressionIndex > signedOutIndex,
    "signed-out broadcasts must persist local suppression before clearing the session",
  );
  assert.match(
    app,
    /function shouldRestorePersistentSession\(userId = state\.user\?\.id \?\? null\)[\s\S]{0,260}isPersistentSessionSuppressed/,
  );
  assert.match(sessionMessage, /message\.nextDeviceId/);
  assert.match(sessionMessage, /state\.deviceId\s*=\s*nextDeviceId/);
  assert.match(signedOutBroadcast, /nextDeviceId/);
});

test("login recovery guidance and static response compression are present", () => {
  assert.match(html, /id="forgotPasswordHelp"/);
  assert.match(nginx, /gzip\s+on;/);
  assert.match(nginx, /gzip_types[\s\S]*application\/javascript/);
});

test("user documentation matches persistent Web sessions and password recovery", () => {
  assert.match(readme, /关闭浏览器[\s\S]{0,100}自动恢复登录/);
  assert.match(quickStart, /HttpOnly Cookie[\s\S]{0,180}自动恢复登录/);
  assert.match(quickStart, /Cookie 失效[\s\S]{0,500}继续离线使用[\s\S]{0,500}登录并同步/);
  assert.match(quickStart, /Web、Windows 和 Android[\s\S]{0,180}忘记密码/);
  assert.match(security, /HttpOnly Cookie/);
  assert.match(security, /主动退出[\s\S]{0,180}撤销当前服务端会话/);
  assert.match(security, /短期刷新租约[\s\S]{0,180}不包含 Token/);
  assert.match(quickStart, /本机已退出[\s\S]{0,180}服务器未确认撤销/);
  assert.match(quickStart, /其他 TaskBridge 标签页[\s\S]{0,180}自动继续/);
});

test("advanced editor reset and focus remain predictable", () => {
  const resetAccountForm = sourceBetween(app, "function resetAccountScopedTaskForm()", "function resetCurrentTaskForm()");

  assert.doesNotMatch(resetAccountForm, /state\.editorOpen\s*=\s*false/);
  assert.match(app, /function resetAndCloseTaskEditor\(\)[\s\S]{0,140}closeTaskEditor\(\{\s*persistDraft:\s*false\s*\}\)/);
  assert.match(app, /function trapTaskEditorFocus\(/);
  assert.match(app, /taskEditorReturnFocus/);
  assert.match(app, /draft\.editingTaskId\s*!==\s*null\s*&&\s*Number\.isFinite/);
});

test("detailed editing saves the literal title instead of reparsing quick-add syntax", () => {
  const payload = sourceBetween(app, "function readTaskPayload()", "function readQuickTaskPayload()");
  assert.match(payload, /const editing = state\.editingTaskId !== null/);
  assert.match(payload, /title: editing \? nodes\.taskTitle\.value\.trim\(\)/);
  assert.match(payload, /project: editing \? explicitProject/);
  assert.match(payload, /planned_date: editing \? explicitPlannedDate/);
});

test("web exposes week, template, project, and tag navigation filters", () => {
  assert.match(app, /value: "week"/);
  assert.match(app, /value: "templates"/);
  assert.match(html, /id="projectFilter"/);
  assert.match(html, /id="tagFilter"/);
  assert.match(app, /params\.set\("project", viewContext\.project\)/);
  assert.match(app, /params\.set\("tag", viewContext\.tag\)/);
});

test("explicit logout may refresh an expired access token before revoking the session", () => {
  const logout = sourceBetween(app, "async function logoutWithConfirmation()", "async function resumeOfflineSession()");

  const revokeIndex = logout.indexOf('apiRequest("/auth/session", { method: "DELETE" })');
  const suppressionIndex = logout.indexOf("suppressPersistentSession()");
  assert.ok(revokeIndex >= 0, "logout must revoke the server session");
  assert.ok(suppressionIndex > revokeIndex, "logout must keep its own refresh path usable before suppression");
  assert.match(logout, /attemptSessionRevocation/);
  assert.match(logout, /revocationConfirmed[\s\S]{0,180}auth\.loggedOutRevocationUnconfirmed/);
  assert.doesNotMatch(logout, /retryAuth:\s*false/);
  assert.equal(logout.match(/suppressPersistentSession\(\)/g)?.length, 1);
});

test("clearing device data revokes or suppresses the persistent session", () => {
  const clearLocalData = sourceBetween(app, "async function clearLocalDeviceData()", "function hasLocalDataClearRisk()");

  const revokeIndex = clearLocalData.indexOf('apiRequest("/auth/session", { method: "DELETE" })');
  const closeIndex = clearLocalData.indexOf("await closeOfflineDb()");
  const deleteIndex = clearLocalData.indexOf("await deleteDatabase(dbName)");
  const rotateDeviceIndex = clearLocalData.indexOf('state.deviceId = `web-${crypto.randomUUID()}`');
  const persistDeviceIndex = clearLocalData.indexOf('writeStoredString("deviceId", state.deviceId)');
  const suppressionIndex = clearLocalData.indexOf("suppressPersistentSession()");
  const broadcastIndex = clearLocalData.indexOf("broadcastSessionSignedOut(");
  assert.ok(revokeIndex >= 0, "clearing local data should revoke the online session when possible");
  assert.ok(closeIndex >= 0 && closeIndex < deleteIndex, "clearing local data must close its database before deleting it");
  assert.ok(deleteIndex < revokeIndex, "clearing local data must succeed locally before revoking the online session");
  assert.ok(suppressionIndex > revokeIndex, "clearing local data must keep its own refresh path usable before suppression");
  assert.ok(
    [rotateDeviceIndex, persistDeviceIndex, suppressionIndex, broadcastIndex].every((index) => index >= 0),
    "clearing local data must include device rotation, persistence, suppression, and sign-out broadcast",
  );
  assert.ok(
    rotateDeviceIndex < persistDeviceIndex && persistDeviceIndex < suppressionIndex && suppressionIndex < broadcastIndex,
    "clearing local data must persist the new device and suppression marker before broadcasting sign-out",
  );
  assert.match(clearLocalData, /previousDeviceId/);
  assert.match(clearLocalData, /nextDeviceId:\s*state\.deviceId/);
  assert.match(clearLocalData, /localDataClearInProgress\s*=\s*true/);
  assert.match(clearLocalData, /localDataClearInProgress\s*=\s*false/);
  assert.match(clearLocalData, /app\.localDataClearedRevocationUnconfirmed/);
  assert.match(app, /function openOfflineDb\(\)[\s\S]{0,180}localDataClearInProgress/);
  assert.match(app, /onBlocked:\s*\(\)\s*=>\s*setLocalDataStatus\(t\("app\.localDataClearWaiting"\)\)/);
});

test("web refresh coordination shares rotated sessions across tabs", () => {
  const refresh = sourceBetween(app, "async function refreshSession(", "async function reportClientError");
  const clearSession = sourceBetween(app, "function clearSession(", "function enterReauthenticationState()");

  assert.match(app, /new BroadcastChannel\(/);
  assert.match(app, /navigator\.locks\.request\(/);
  assert.match(refresh, /withRefreshLease/);
  assert.match(refresh, /getApiRequestCredentialsMode\(state\.apiBaseUrl,\s*location\.origin\)/);
  assert.match(refresh, /buildRefreshRequestBody/);
  assert.match(refresh, /canApplySessionRefreshResult/);
  assert.match(clearSession, /invalidateSessionRefreshes\(\)/);
});
