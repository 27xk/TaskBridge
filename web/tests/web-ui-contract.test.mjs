import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, html, styles] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
]);

test("account security UI exposes password and session controls", () => {
  for (const id of [
    "accountSecurityTools",
    "passwordChangeForm",
    "currentPassword",
    "newPassword",
    "confirmNewPassword",
    "sessionList",
    "refreshSessionsButton",
    "revokeOtherSessionsButton",
    "accountSecurityMessage",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must exist`);
  }
  assert.match(appSource, /\/auth\/password/);
  assert.match(appSource, /\/auth\/sessions/);
  assert.match(appSource, /revoke-other-devices/);
  assert.match(
    appSource,
    /function setBusy\(isBusy\) \{[^}]*renderAccountSecurity\(\);[^}]*\}/,
    "leaving a busy account action must re-enable security controls",
  );
});

test("task requests carry the browser IANA time zone and map server views", () => {
  assert.match(appSource, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(appSource, /params\.set\(["']timezone["']/);
  assert.match(appSource, /\/tasks\/meta\?/);
  assert.match(appSource, /mapTaskViewForServer\(/);
});

test("same-origin defaults, degraded auth, mixed-content errors, and terminal refresh are integrated", () => {
  assert.match(appSource, /location\.origin/);
  assert.match(appSource, /isAuthHealthUsable\(/);
  assert.match(appSource, /isMixedContentApiUrl\(/);
  assert.match(appSource, /validation\.mixedContentApi/);
  assert.match(appSource, /isTerminalRefreshStatus\(/);
  assert.match(appSource, /enterReauthenticationState\(/);
});

test("signed-out header hides the non-actionable connection badge until a check has a result", () => {
  assert.match(html, /id="connectionBadge"[^>]*hidden/);
  assert.match(
    appSource,
    /nodes\.connectionBadge\.hidden\s*=\s*!shouldShowConnectionBadge\(hasLocalWorkspace\(\), state\.syncStatus\)/,
  );
});

test("changing a server endpoint invalidates its previous connection result", () => {
  assert.match(appSource, /resetEndpointScopedConnectionState\(/);
  assert.match(appSource, /const connectionRequestGate = createLatestRequestGate\(\)/);
  assert.match(appSource, /const registrationRequestGate = createLatestRequestGate\(\)/);
  assert.match(
    appSource,
    /function resetConnectionStateForEndpointChange\([\s\S]{0,500}updateConnectionBadge\(\)/,
  );
  assert.match(
    appSource,
    /function resetConnectionStateForEndpointChange\([\s\S]{0,500}setStatus\(nodes\.authMessage, ""\)/,
  );
  assert.match(
    appSource,
    /const syncStatus = await apiRequest\("\/sync\/status", \{ auth: false[^}]*\}\);[\s\S]{0,240}!connectionRequestGate\.isCurrent\(requestSequence\)[\s\S]{0,160}state\.syncStatus = syncStatus/,
  );
  assert.match(
    appSource,
    /async function loadRegistrationStatus\(\)[\s\S]{0,240}registrationRequestGate\.begin\(\)[\s\S]{0,360}registrationRequestGate\.isCurrent\(requestSequence\)/,
  );
  assert.match(
    appSource,
    /async function refreshSyncStatus\([\s\S]{0,420}connectionRequestGate\.begin\(\)[\s\S]{0,900}connectionRequestGate\.isCurrent\(requestSequence\)/,
  );
  assert.match(appSource, /let activeConnectionRequestSequence = null/);
  assert.match(appSource, /requestSequence === activeConnectionRequestSequence/);
});

test("mobile workspace keeps quick actions and tasks before secondary sidebar tools", () => {
  assert.match(
    html,
    /<section id="appScreen" class="workspace" hidden>\s*<nav id="mobileQuickActions"[\s\S]*?<\/nav>\s*<aside id="sidebar"/,
    "mobile quick actions must be a direct workspace grid item",
  );
  assert.match(
    styles,
    /@media \(max-width: 960px\)[\s\S]{0,180}grid-template-areas:\s*"mobile-actions"\s*"main"\s*"sidebar"/,
    "mobile grid must place quick actions and primary tasks before sidebar diagnostics",
  );
});

test("degraded realtime status does not falsely claim regular sync is unavailable", () => {
  assert.match(appSource, /"sync\.degradedAction": "实时更新暂不可用，任务仍会通过常规同步更新到其他设备。"/);
  assert.match(appSource, /"sync\.degradedAction": "Real-time updates are temporarily unavailable\. Tasks still sync to other devices through regular sync\."/);
  assert.match(appSource, /"connection\.needsCheck": "实时更新受限"/);
  assert.match(appSource, /"connection\.needsCheck": "Real-time updates limited"/);
  assert.doesNotMatch(appSource, /任务会先保存在当前设备，服务恢复后会自动同步。/);
  assert.doesNotMatch(appSource, /Tasks are saved on this device and will sync when services recover\./);
});

test("logout and account changes clear credential and task DOM state while preserving scoped drafts", () => {
  assert.match(appSource, /buildTaskDraftStorageKey\(/);
  assert.match(appSource, /clearAuthenticationInputs\(/);
  assert.match(appSource, /resetAccountScopedTaskForm\(/);
  assert.match(appSource, /persistTaskDraft\(\)[\s\S]{0,240}resetAccountScopedTaskForm\(/);
});

test("offline queue uses stable create ids, independent processing, and failed-item recovery actions", () => {
  assert.match(appSource, /withClientRequestId\(/);
  assert.match(appSource, /processIndependentMutationQueue\(/);
  assert.match(appSource, /dataset\.taskAction\s*=\s*["']retry-sync["']/);
  assert.match(appSource, /dataset\.taskAction\s*=\s*["']discard-sync["']/);
  assert.match(appSource, /deleteOfflineMutationsForTask\(/);
});

test("task refreshes reject stale responses and keep pending and conflict views local", () => {
  assert.match(appSource, /createLatestRequestGate\(/);
  assert.match(appSource, /taskRequestGate\.isCurrent\(/);
  assert.match(appSource, /mapTaskViewForServer\([^)]+\)/);
  assert.match(appSource, /serverView\s*===\s*null[\s\S]{0,240}hydrateCachedTasks/);
});

test("notification UI describes support honestly and schedules task-linked notifications", () => {
  assert.match(html, /id=["']notificationPermissionButton["']/);
  assert.match(html, /id=["']notificationStatus["'][^>]*aria-live=["']polite["']/);
  assert.match(appSource, /Notification\.requestPermission\(/);
  assert.match(appSource, /getTaskReminderAt\(/);
  assert.match(appSource, /showNotification\(/);
  assert.match(appSource, /buildTaskNotificationUrl\(/);
  assert.match(appSource, /notification\.unsupported/);
});

test("task errors and checklist fields expose programmatic accessibility semantics", () => {
  assert.match(html, /id=["']taskMessage["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /<label[^>]*for=["']taskChecklist["'][^>]*>[\s\S]*?清单[\s\S]*?<\/label>/);
  assert.match(html, /id=["']taskChecklistHint["']/);
  assert.match(html, /id=["']taskChecklist["'][^>]*aria-describedby=["']taskChecklistHint["']/);
});

test("mobile workspace uses matching runtime DOM, visual, and focus order", () => {
  assert.match(appSource, /function alignWorkspaceDomOrder\(/);
  assert.match(appSource, /insertBefore\(nodes\.mainPanel,\s*nodes\.sidebar\)/);
  assert.match(styles, /grid-template-areas:\s*["']sidebar main["']/);
  assert.match(styles, /grid-template-areas:\s*["']mobile-actions["']\s*["']main["']\s*["']sidebar["']/);
  assert.doesNotMatch(styles, /\.main-panel\s*\{[^}]*order:/);
  assert.doesNotMatch(styles, /\.sidebar\s*\{[^}]*order:/);
  assert.match(styles, /\.auth-panel\s*\{[^}]*width:\s*min\(100%,\s*760px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.password-field\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("offline recovery precedes credentials and registration-only help stays out of login", () => {
  const offlineResumeIndex = html.indexOf('id="offlineResumePanel"');
  const accountInputIndex = html.indexOf('id="usernameOrEmail"');
  assert.ok(offlineResumeIndex > 0, "offline resume panel must exist");
  assert.ok(
    offlineResumeIndex < accountInputIndex,
    "offline recovery must be visible before users re-enter account credentials",
  );
  assert.match(
    html,
    /id="registrationGateHint"[^>]*class="[^"]*auth-register-only[^"]*"/,
    "registration availability help must only be visible in registration mode",
  );
});

test("secondary account tools stay collapsed while task status announcements stay focused", () => {
  for (const id of ["notificationTools", "statisticsTools", "localDataTools"]) {
    const openingTag = html.match(new RegExp(`<details[^>]*id=["']${id}["'][^>]*>`))?.[0] ?? "";
    assert.ok(openingTag, `${id} must use progressive disclosure`);
    assert.doesNotMatch(openingTag, /\sopen(?:\s|=|>)/, `${id} must be collapsed by default`);
  }
  assert.match(html, /id="syncOverview"[^>]*hidden/);
  assert.match(appSource, /syncOverview\.hidden\s*=\s*!shouldShowSyncSupportAction\(\)\s*&&\s*!state\.offlineMode/);
  assert.match(appSource, /taskSyncHealthBar\.hidden\s*=\s*tone\s*===\s*"ready"\s*\|\|\s*tone\s*===\s*"unknown"/);
  assert.doesNotMatch(html, /id="taskList"[^>]*aria-live=/, "the whole task list must not be a live region");
});

test("mobile controls meet touch sizing and insecure HTTP install help is honest", () => {
  assert.match(
    styles,
    /@media\s*\(max-width:\s*760px\)[\s\S]*?(?:button|input)[\s\S]*?min-height:\s*44px/,
  );
  const installHelp = appSource.match(/function getInstallHelpMessage\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(installHelp, /window\.isSecureContext\s*!==\s*true[\s\S]*install\.insecureContext/);
  assert.match(appSource, /"install\.insecureContext": "[^"]*(?:HTTP|http)[^"]*(?:PWA|离线)[^"]*"/);
});
