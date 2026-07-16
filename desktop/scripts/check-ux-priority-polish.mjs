import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  webHtmlSource,
  webAppSource,
  webStylesSource,
  desktopAppSource,
  desktopWorkspaceStatusBannerSource,
  desktopTodayViewSource,
  desktopLoginSource,
  desktopI18nSource,
  androidLoginSource,
  androidTaskListSource,
  androidEditorSource,
  androidSettingsSource,
  readmeSource,
  userQuickStartSource,
  desktopReadmeSource,
  androidReadmeSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "web/index.html"), "utf8"),
  readFile(resolve(repoRoot, "web/app.js"), "utf8"),
  readFile(resolve(repoRoot, "web/styles.css"), "utf8"),
  readFile(resolve(desktopRoot, "src/App.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/WorkspaceStatusBanner.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/TodayView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/LoginView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/i18n.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/editor/EditorScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/user-quick-start.md"), "utf8"),
  readFile(resolve(repoRoot, "desktop/README.md"), "utf8"),
  readFile(resolve(repoRoot, "android/README.md"), "utf8"),
]);

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex + start.length, endIndex);
}

function assertOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `missing first marker: ${first}`);
  assert.notEqual(secondIndex, -1, `missing second marker: ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

const readmeTop = readmeSource.split(/\r?\n/).slice(0, 8).join("\n");
assert.doesNotMatch(readmeTop, /Docker|docker/i, "README first screen must not lead ordinary users with Docker badges");

const quickStartTop = userQuickStartSource.split(/\r?\n/).slice(0, 26).join("\n");
assert.doesNotMatch(quickStartTop, /Docker|10\.0\.2\.2|局域网 IP|HTTPS/, "ordinary quick start top path must not front-load deployment/network terms");

const desktopOrdinaryEntry = sourceBetween(desktopReadmeSource, "## 普通用户入口", "## 开发者说明");
assert.doesNotMatch(desktopOrdinaryEntry, /Docker|10\.0\.2\.2|局域网 IP|HTTPS/, "desktop ordinary entry must stay focused on download, server address, and login");

const androidOrdinaryEntry = sourceBetween(androidReadmeSource, "## 普通用户入口", "## 开发者说明");
assert.doesNotMatch(androidOrdinaryEntry, /Docker|10\.0\.2\.2|局域网 IP|HTTPS/, "Android ordinary entry must stay focused on download, server address, and login");

assert.match(webHtmlSource, /class="mobile-quick-actions"/, "Web mobile sidebar must expose a compact quick-actions strip");
assert.match(webHtmlSource, /id="mobileQuickCreateButton"/, "Web mobile quick actions must include a new-task shortcut");
assert.match(webHtmlSource, /id="mobileQuickTaskListButton"/, "Web mobile quick actions must include a task-list shortcut");
assert.match(webAppSource, /mobileQuickCreateButton/, "Web app must bind the mobile new-task shortcut");
assert.match(webAppSource, /mobileQuickTaskListButton/, "Web app must bind the mobile task-list shortcut");
assert.match(webStylesSource, /\.mobile-quick-actions/, "Web mobile quick actions must have a dedicated responsive style");

assertOrder(
  webHtmlSource,
  'id="authSubmitButton"',
  'id="testConnectionButton"',
  "Web login must be the first primary auth action; checking connection is a secondary troubleshooting action",
);
assert.match(webHtmlSource, /id="authSubmitButton"[^>]*class="primary-button"/, "Web login submit button must be primary before a connection check has run");
assert.match(webHtmlSource, /id="testConnectionButton"[^>]*class="secondary-button"/, "Web connection check must be visually secondary on the first screen");
assert.match(webAppSource, /"auth\.loginAutoChecksConnection"/, "Web auth copy must explain that login automatically checks the connection");
assert.doesNotMatch(webAppSource, /setStatus\(nodes\.authMessage,\s*pendingHelp\)/, "Web registration availability help must not duplicate into the login result message");
assert.match(webAppSource, /nodes\.authSubmitButton\.className = "primary-button"/, "Web auth render logic must keep login/register as the primary action");
assert.match(webAppSource, /nodes\.testConnectionButton\.className = "secondary-button"/, "Web auth render logic must keep connection testing secondary");
assert.doesNotMatch(webAppSource, /nodes\.authSubmitButton\.className = isConnectionReadyForAuth/, "Web auth submit priority must not depend on a prior manual connection check");

assert.match(webAppSource, /nodes\.taskSyncHealthBar\.hidden = tone === "ready"/, "Web task-list sync health must stay out of the way when sync is healthy");
assert.doesNotMatch(desktopTodayViewSource, /TaskSyncHealthBar/, "Desktop Today view must not duplicate the app-level sync status banner");
assert.match(desktopAppSource, /v-if="workspaceStatus\.banner !== 'none'"/, "Desktop app must only show sync status when workspace attention is needed");
assert.match(desktopWorkspaceStatusBannerSource, /aria-live="polite"/, "Desktop workspace status banner must announce sync status changes politely");

assert.doesNotMatch(desktopLoginSource, /authPrimaryActionReady/, "Desktop login priority must not depend on a prior manual connection check");
assert.match(desktopLoginSource, /class="secondary-button"[\s\S]{0,360}settingsStore\.t\("settings\.checkAndSaveConnection"\)/, "Desktop connection check must be secondary");
assert.match(desktopLoginSource, /class="primary-button" type="submit"/, "Desktop login submit must stay primary by default");

assert.doesNotMatch(desktopLoginSource, /TaskBridge Docker 本机试用/, "Desktop login fallback copy must not lead with Docker terminology");
assert.doesNotMatch(desktopI18nSource, /同步异常恢复/, "Desktop sync recovery wording should be consolidated through sync-issues settings labels");

assert.match(androidTaskListSource, /listToolsOpen/, "Android task list must let search and filters collapse behind a list tools control");
assert.match(androidTaskListSource, /if \(syncHealth\.needsAttention\) \{[\s\S]{0,180}TaskListSyncHealthBar/, "Android task-list sync health must only appear when action is needed");
assert.doesNotMatch(androidLoginSource, /connectionReadyForAuth/, "Android login priority must not depend on a prior manual connection check");
assert.match(androidTaskListSource, /TaskListSyncHealthBar\([\s\S]{0,140}syncHealth = syncHealth/, "Android task list must render actionable sync health near the list");
assert.match(androidEditorSource, /bottomBar = \{[\s\S]{0,260}EditorBottomActions/, "Android editor must keep save and cancel actions available at the bottom");
assert.doesNotMatch(androidSettingsSource, /"Troubleshooting" else "问题排查"/, "Android settings navigation must use the shared sync-issues wording");
assert.match(androidSettingsSource, /"Sync issues" else "同步问题"/, "Android settings navigation must use consistent sync-issues wording");

assert.match(readmeSource, /登录会自动检查连接/, "README ordinary path must tell users that login automatically checks the connection");
assert.match(userQuickStartSource, /登录会自动检查连接/, "ordinary quick start must tell users that login automatically checks the connection");
assert.match(desktopReadmeSource, /登录会自动检查连接/, "desktop README ordinary entry must tell users that login automatically checks the connection");
assert.match(androidReadmeSource, /登录会自动检查连接/, "Android README ordinary entry must tell users that login automatically checks the connection");

console.log("priority UX polish check passed");
