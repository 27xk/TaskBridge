import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const contentStart = startIndex + start.length;
  const endIndex = source.indexOf(end, contentStart);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(contentStart, endIndex);
}

function assertOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `missing first marker: ${first}`);
  assert.notEqual(secondIndex, -1, `missing second marker: ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

const [
  webAppSource,
  webHtmlSource,
  webStylesSource,
  webLocalTrialGuideSource,
  webSelfHostingGuideSource,
  webGuideLanguageSource,
  webStartupSource,
  webSwSource,
  desktopDbSource,
  desktopLoginSource,
  desktopSettingsSource,
  desktopSettingsAccountPanelSource,
  desktopSettingsConnectionPanelSource,
  desktopSettingsDataPanelSource,
  desktopSettingsMetadataPanelSource,
  desktopSettingsWindowPanelSource,
  desktopUserFacingErrorsSource,
  desktopConnectionEndpointsSource,
  desktopAppSource,
  desktopAppSidebarSource,
  desktopTaskViewSource,
  desktopTodayViewSource,
  desktopTaskStoreSource,
  desktopTaskEditorSource,
  desktopTaskItemSource,
  desktopTaskListSectionSource,
  desktopWorkspaceStatusBannerSource,
  desktopConfirmDialogSource,
  desktopFloatingHeaderSource,
  desktopMainSource,
  desktopIpcSource,
  desktopInstallerSource,
  desktopCssSource,
  desktopI18nSource,
  desktopAuthStoreSource,
  desktopFloatingStoreSource,
  webOfflineCoreSource,
  androidManifestSource,
  androidMainActivitySource,
  androidAppUiSource,
  androidReminderManagerSource,
  androidTaskEntitySource,
  androidQueueEntitySource,
  androidDatabaseSource,
  androidDaoSource,
  androidTaskRepositorySource,
  androidSyncRepositorySource,
  androidAppContainerSource,
  androidTokenDataStoreSource,
  androidLoginSource,
  androidLoginViewModelSource,
  androidRegisterSource,
  androidRegistrationAvailabilitySource,
  androidRegisterViewModelSource,
  androidSettingsSource,
  androidSettingsUiPolicySource,
  androidUserFacingErrorsSource,
  androidEditorSource,
  androidEditorViewModelSource,
  androidSharedTextDraftSource,
  androidQuickAddParserSource,
  androidI18nSource,
  androidTaskListSource,
  androidTaskListViewModelSource,
  androidTaskDetailSource,
  androidSyncStatusBarSource,
  deployEnvExampleSource,
  deployLocalEnvExampleSource,
  readmeSource,
  deployReadmeSource,
  desktopReadmeSource,
  androidReadmeSource,
  userQuickStartDocSource,
  developmentDocSource,
  troubleshootingDocSource,
  securityDocSource,
  syncDesignDocSource,
  versionSource,
  rootPackageSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "web/app.js"), "utf8"),
  readFile(resolve(repoRoot, "web/index.html"), "utf8"),
  readFile(resolve(repoRoot, "web/styles.css"), "utf8"),
  readFile(resolve(repoRoot, "web/local-trial.html"), "utf8"),
  readFile(resolve(repoRoot, "web/self-hosting.html"), "utf8"),
  readFile(resolve(repoRoot, "web/guide-language.js"), "utf8"),
  readFile(resolve(repoRoot, "web/startup.js"), "utf8"),
  readFile(resolve(repoRoot, "web/sw.js"), "utf8"),
  readFile(resolve(desktopRoot, "electron/db.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/LoginView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/SettingsView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsAccountDisplayPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsConnectionPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsDataSessionPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsMetadataPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/settings/SettingsWindowPanel.vue"), "utf8"),
  readFile(resolve(desktopRoot, "shared/user-facing-errors.ts"), "utf8"),
  readFile(resolve(desktopRoot, "shared/connection-endpoints.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/App.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/AppSidebar.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/TaskView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/views/TodayView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/stores/task.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/TaskEditor.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/TaskItem.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/TaskListSection.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/WorkspaceStatusBanner.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/ConfirmDialog.vue"), "utf8"),
  readFile(resolve(desktopRoot, "src/components/FloatingHeader.vue"), "utf8"),
  readFile(resolve(desktopRoot, "electron/main.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
  readFile(resolve(desktopRoot, "build/installer.nsh"), "utf8"),
  readFile(resolve(desktopRoot, "src/assets/base.css"), "utf8"),
  readFile(resolve(desktopRoot, "src/i18n.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/stores/auth.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/stores/floating.ts"), "utf8"),
  readFile(resolve(repoRoot, "web/offline-core.js"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/AndroidManifest.xml"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/MainActivity.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/components/AppUi.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/notification/ReminderManager.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/local/TaskEntity.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/local/SyncQueueEntity.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/local/AppDatabase.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/local/TaskDao.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/TaskRepository.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/SyncRepository.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/AppContainer.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/datastore/TokenDataStore.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/LoginViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/RegisterScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/RegistrationAvailability.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/RegisterViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsUiPolicy.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/components/UserFacingErrors.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/editor/EditorScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/editor/EditorViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/editor/SharedTextDraft.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/domain/usecase/QuickAddParser.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/i18n/TaskBridgeI18n.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskDetailScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/components/SyncStatusBar.kt"), "utf8"),
  readFile(resolve(repoRoot, "deploy/.env.example"), "utf8"),
  readFile(resolve(repoRoot, "deploy/.env.local.example"), "utf8"),
  readFile(resolve(repoRoot, "README.md"), "utf8"),
  readFile(resolve(repoRoot, "deploy/README.md"), "utf8"),
  readFile(resolve(repoRoot, "desktop/README.md"), "utf8"),
  readFile(resolve(repoRoot, "android/README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/user-quick-start.md"), "utf8").catch(() => ""),
  readFile(resolve(repoRoot, "docs/development.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/troubleshooting.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/security.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/sync-design.md"), "utf8"),
  readFile(resolve(repoRoot, "VERSION"), "utf8"),
  readFile(resolve(repoRoot, "package.json"), "utf8"),
]);

const desktopSettingsSurfaceSource = [
  desktopSettingsSource,
  desktopSettingsAccountPanelSource,
  desktopSettingsConnectionPanelSource,
  desktopSettingsDataPanelSource,
  desktopSettingsMetadataPanelSource,
  desktopSettingsWindowPanelSource,
].join("\n");

assert.match(webAppSource, /function getCurrentUserId\(/, "Web offline cache must resolve the current user before opening storage");
assert.match(webAppSource, /function offlineDbName\(/, "Web offline cache must use a scoped IndexedDB name");
assert.match(webAppSource, /buildOfflineDatabaseName\(STORAGE_PREFIX, state\.apiBaseUrl, userId\)/, "Web IndexedDB names must isolate both server and user");
assert.match(webAppSource, /indexedDB\.open\(dbName, WEB_OFFLINE_DB_VERSION\)/, "Web IndexedDB must open the scoped database name");
assert.match(webAppSource, /user_id:\s*getCurrentUserId\(\)/, "Web offline mutations must store the owning user id");
assert.match(webAppSource, /closeOfflineDb\(\)/, "Web logout/account switch must close the previous offline database handle");
assert.doesNotMatch(webAppSource, /indexedDB\.open\(WEB_OFFLINE_DB_NAME,/, "Web must not open one global offline database for every account");
assert.match(webOfflineCoreSource, /function isTodayTask[\s\S]*list_type[\s\S]*today/, "Web today view must include tasks explicitly placed in the today list");
const desktopTodayTaskQuery = sourceBetween(
  desktopDbSource,
  "export function listTodayTasks",
  "export function listTodayFloatingTasks",
);
assert.match(
  desktopTodayTaskQuery,
  /OR list_type = 'today'/,
  "Desktop Today page query must include tasks explicitly placed in the today list",
);
const desktopFloatingTodayTaskQuery = sourceBetween(
  desktopDbSource,
  "export function listTodayFloatingTasks",
  "export function getTask(",
);
assert.match(
  desktopFloatingTodayTaskQuery,
  /OR list_type = 'today'/,
  "Desktop floating Today query must include tasks explicitly placed in the today list",
);
assert.doesNotMatch(
  desktopFloatingTodayTaskQuery,
  /priority\s*>=\s*@highPriority|highPriority/,
  "Desktop floating Today query must not silently mix unscheduled high-priority tasks into Today",
);
const desktopQuickAddCreateTask = sourceBetween(
  desktopDbSource,
  "export function createLocalTask",
  "export function completeLocalTaskWithQueue",
);
assert.match(
  desktopQuickAddCreateTask,
  /listType:\s*isTodayTask\s*\?\s*"today"\s*:\s*"inbox"/,
  "Desktop floating quick-add must respect parsed future dates instead of always saving into Today",
);
assert.doesNotMatch(
  desktopQuickAddCreateTask,
  /listType:\s*"today"/,
  "Desktop floating quick-add must not hard-code every quick-add task into Today",
);
assert.doesNotMatch(
  androidDaoSource,
  /priority\s*>=\s*:highPriority|highPriority:\s*Int/,
  "Android Today widget query must not silently mix unscheduled high-priority tasks into Today",
);
assert.match(webOfflineCoreSource, /export function makeTaskFromTemplate\(/, "Web offline core must create regular tasks from templates without a server round trip");
assert.match(webAppSource, /function instantiateTemplateTaskOffline\(/, "Web must support offline template instantiation");
assert.match(webAppSource, /function instantiateTemplateTask\([\s\S]{0,900}instantiateTemplateTaskOffline/, "Web template instantiation must fall back to the offline queue when the server is unavailable");
const webVersionMatch = webHtmlSource.match(/<meta name="taskbridge-version" content="([^"]+)" \/>/);
assert.ok(webVersionMatch, "Web must expose a client version for cache busting and diagnostics");
const webVersion = webVersionMatch[1];
assert.equal(
  webVersion,
  versionSource.trim(),
  "Web reported app version must match VERSION so cache busting and diagnostics use the release version",
);
assert.match(
  webHtmlSource,
  new RegExp(`src="\\./app\\.js\\?v=${webVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  "Web app script query must match the published client version",
);
assert.match(
  webAppSource,
  new RegExp(`from "\\./offline-core\\.js\\?v=${webVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  "Web offline-core import must be versioned so old PWA caches cannot break module loading",
);
assert.match(
  webSwSource,
  new RegExp(`WEB_VERSION = "${webVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  "Web service worker must use the published web client version",
);
assert.match(
  webSwSource,
  /CACHE_NAME\s*=\s*`taskbridge-web-shell-v\$\{WEB_VERSION\}`/,
  "Web service worker cache name must track the web client version",
);
assert.match(webSwSource, /fetchFreshAndCache/, "Web service worker must network-refresh versioned shell assets");
assert.match(
  webSwSource,
  /fetchFreshAndCache\(request\)\.catch\(\(\) => caches\.match\(cacheKeyForRequest\(request\)\)\)/,
  "Web service worker must fall back to cache only after a network refresh fails",
);
assert.match(webHtmlSource, /id="startupFallback"/, "Web must show a recovery panel when JavaScript modules fail to boot");
assert.match(webHtmlSource, /id="clearStartupCacheButton"/, "Web startup recovery must let users clear stale offline cache");
assert.match(webStartupSource, /window\.taskBridgeWebReady/, "Web startup recovery must depend on an explicit ready marker");
assert.doesNotMatch(
  webStartupSource,
  /window\.taskBridgeWebReady\s*=\s*false;/,
  "Web startup recovery must not overwrite the app-ready marker after the module has already booted",
);
assert.match(webAppSource, /function markAppReady\(/, "Web app must mark successful startup for the fallback guard");
assert.match(webHtmlSource, /id="languageSelect"/, "Web must expose a visible language selector");
assert.match(webAppSource, /function setLanguage\(/, "Web must centralize language switching");
assert.match(webAppSource, /function getInitialLanguage\(/, "Web must choose the initial language through a focused helper");
assert.match(webAppSource, /navigator\.language/, "Web first screen should default to the browser language when no preference is saved");
assert.match(webAppSource, /data-i18n/, "Web user-facing shell text must be refreshable when language changes");
assertOrder(
  webHtmlSource,
  '<section class="stack task-create-stack">',
  '<section class="stack task-list-stack">',
  "Web workspace must keep task creation above the list so the new-task path does not jump below long lists",
);
assertOrder(
  webHtmlSource,
  '<form id="taskForm"',
  '<ul id="taskList"',
  "Web workspace must place the create form before the task list",
);
assert.match(webStylesSource, /\.task-create-stack[\s\S]{0,160}border-bottom/, "Web create form should read as a compact top workspace section");
assert.doesNotMatch(
  webHtmlSource,
  /<details id="taskCreateDetails"/,
  "Web task creation must not hide the primary create path inside a collapsed disclosure",
);
assert.match(
  webHtmlSource,
  /<section id="taskCreateDetails" class="task-create-details task-create-panel"/,
  "Web task creation must be a visible panel with the title input available by default",
);
assert.match(webHtmlSource, /id="taskCreateHeading"/, "Web visible task creation panel must have a stable heading for screen readers");
assert.match(webAppSource, /"taskCreateDetails"/, "Web app must bind the task creation panel");
assert.match(webAppSource, /function openTaskCreatePanel\(/, "Web app must centralize opening the task creation panel");
assert.doesNotMatch(webAppSource, /nodes\.taskCreateDetails\.open = true/, "Web task creation is already visible and must not rely on opening a disclosure");
assert.match(
  webAppSource,
  /function beginTaskEdit\(task\)[\s\S]{0,260}openTaskCreatePanel\(/,
  "Web edit action must open the task creation panel before focusing the editor",
);
assert.match(
  webAppSource,
  /emptyAction\.kind === "create"[\s\S]{0,260}openTaskCreatePanel\(/,
  "Web empty-state create action must open the collapsed task creation panel",
);
const webFirstScreenI18nKeys = [
  "install.title",
  "install.close",
  "startup.title",
  "startup.message",
  "startup.reload",
  "startup.clearAndReload",
  "auth.eyebrow",
  "auth.title",
  "auth.login",
  "auth.register",
  "auth.firstUseTitle",
  "auth.firstUseExistingServer",
  "auth.serverSetupHelp",
  "auth.serverSetupHelpHint",
  "auth.openLocalTrialGuide",
  "auth.openSelfHostGuide",
  "auth.resumeOffline",
  "auth.resumeOfflineHint",
  "auth.serverUrl",
  "auth.serverUrlHint",
  "auth.advancedConnection",
  "auth.apiUrlGenerated",
  "auth.deviceIdGenerated",
  "auth.deviceIdHint",
  "auth.regenerateDeviceId",
  "auth.username",
  "auth.email",
  "auth.account",
  "auth.password",
  "auth.checkConnection",
  "auth.loginAutoChecksConnection",
];
for (const key of webFirstScreenI18nKeys) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(webHtmlSource, new RegExp(`data-i18n="${escapedKey}"`), `Web first screen must bind ${key} to language switching`);
  assert.match(webAppSource, new RegExp(`"${escapedKey}"`), `Web i18n must define ${key}`);
}
assert.match(webAppSource, /"auth\.title": "登录 TaskBridge"/, "Web first screen title should lead with the product, not server setup");
assert.doesNotMatch(webHtmlSource, /<h1 data-i18n="auth\.title">连接服务器并登录<\/h1>/, "Web first screen heading must not make server setup the main user goal");
assert.match(webHtmlSource, /id="togglePasswordVisibilityButton"/, "Web auth password field must expose a visible show/hide control");
assert.match(webAppSource, /function togglePasswordVisibility\(/, "Web auth password visibility must be toggled through a focused helper");
assert.match(webAppSource, /nodes\.password\.type = state\.passwordVisible \? "text" : "password"/, "Web auth password toggle must switch the input type");
assert.match(webAppSource, /"auth\.showPassword"/, "Web i18n must define show-password copy");
assert.match(webAppSource, /"auth\.hidePassword"/, "Web i18n must define hide-password copy");
const webFirstRunGuideSource = sourceBetween(webHtmlSource, '<details id="serverSetupHelp"', '</details>');
assert.doesNotMatch(webFirstRunGuideSource, /API|WebSocket/, "Web first-use guidance must avoid developer endpoint terms");
assert.doesNotMatch(webAppSource, /"auth\.selfHostHint":[^\n]*(API|WebSocket)/, "Web self-host hint must avoid developer endpoint terms in ordinary copy");
assert.match(webHtmlSource, /<details id="serverSetupHelp"/, "Web first-use screen must keep no-server help behind one optional disclosure");
assert.match(
  webFirstRunGuideSource,
  /联系管理员或部署者|ask your administrator or deployer/i,
  "Web first-use guidance must give non-technical users a clear path to get a server address",
);
assert.doesNotMatch(
  webFirstRunGuideSource,
  /<details id="localTrialGuide"|<details id="selfHostGuide"/,
  "Web first-use screen must not nest local-trial and self-hosting as a second decision tree",
);
assert.doesNotMatch(
  webFirstRunGuideSource,
  /Docker|生产环境|公开注册|首个账号/,
  "Web first-use guidance must avoid deployment-specific wording on the login screen",
);
assert.match(webAppSource, /async function ensureRegistrationModeAvailable\(/, "Web registration tab should test the connection automatically when registration status is unknown");
assert.match(webAppSource, /await ensureRegistrationModeAvailable\(\)/, "Web registration tab click should run the automatic registration availability check");
const webWorkspaceI18nKeys = [
  "app.account",
  "app.refresh",
  "app.diagnostics",
  "app.apiAddress",
  "app.deviceId",
  "app.clientErrorReporting",
  "app.clientErrorReportingHint",
  "app.syncStatus",
  "app.syncDetails",
  "app.views",
  "app.stats",
  "task.newTask",
  "task.title",
  "task.moreSettings",
  "task.content",
  "task.project",
  "task.tag",
  "task.priority",
  "task.priorityNone",
  "task.priorityLow",
  "task.priorityMedium",
  "task.priorityHigh",
  "task.priorityUrgent",
  "task.priorityHighest",
  "task.list",
  "task.listInbox",
  "task.listToday",
  "task.plannedDate",
  "task.dueTime",
  "task.remindTime",
  "task.repeat",
  "task.repeatNone",
  "task.repeatDaily",
  "task.repeatWeekly",
  "task.repeatMonthly",
  "task.steps",
  "task.stepsHint",
  "task.saveAsTemplate",
  "task.templateName",
  "task.create",
  "task.reset",
  "task.cancelEdit",
  "task.tasks",
  "task.search",
  "task.clearSearch",
  "confirm.title",
  "confirm.cancel",
  "confirm.confirm",
];
for (const key of webWorkspaceI18nKeys) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(webHtmlSource, new RegExp(`data-i18n="${escapedKey}"`), `Web workspace must bind ${key} to language switching`);
  assert.match(webAppSource, new RegExp(`"${escapedKey}"`), `Web i18n must define ${key}`);
}
assert.match(webHtmlSource, /data-i18n-placeholder="task\.stepsPlaceholder"/, "Web checklist placeholder must follow language switching");
assert.match(webHtmlSource, /data-i18n-placeholder="task\.searchPlaceholder"/, "Web search placeholder must follow language switching");
assert.match(webAppSource, /clientErrorReportingEnabled/, "Web client error reporting must have a user-controlled setting");
assert.match(
  webAppSource,
  /clientErrorReportingEnabled:\s*readStoredString\("clientErrorReportingEnabled", "false"\) === "true"/,
  "Web client error reporting should be opt-in by default",
);
assert.match(webAppSource, /if \(!state\.clientErrorReportingEnabled\) return/, "Web client error reports must stop when the user disables reporting");
assert.match(webHtmlSource, /id="clientErrorReportingToggle"/, "Web diagnostics must expose a visible client error reporting toggle");
const webRuntimeI18nKeys = [
  "task.createdFromTemplate",
  "connection.testing",
  "connection.availableExistingLogin",
  "validation.accountRequired",
  "validation.usernameRequired",
  "validation.emailRequired",
  "validation.passwordRequired",
  "validation.passwordMinLength",
  "validation.taskTitleRequired",
  "validation.serverUrlInvalid",
  "validation.serverUrlProtocol",
  "error.authInvalidCredentials",
  "error.authForbidden",
  "error.loginServiceNotFound",
  "error.serverUnavailableWithLocalData",
  "error.connectionServiceUnavailable",
  "error.authFallback",
  "error.generic",
  "error.versionConflict",
  "error.unsupportedRepeatRule",
  "error.sessionExpired",
  "error.taskNotFound",
  "error.serverUnavailable",
  "error.connectionServerUnavailable",
  "error.requestFailed",
];
for (const key of webRuntimeI18nKeys) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(webAppSource, new RegExp(`"${escapedKey}"`), `Web runtime i18n must define ${key}`);
}
assert.doesNotMatch(webAppSource, /toast\("[^"]*"\)/, "Web template-created toast must follow the selected language");
assert.doesNotMatch(
  webAppSource,
  /new ValidationError\("(?![a-z]+(?:\.[A-Za-z0-9]+)+")[^"]*"\)/,
  "Web validation messages must use translatable keys",
);
assert.doesNotMatch(webAppSource, /setStatus\(nodes\.authMessage, "[^"]+"/, "Web connection testing status must follow the selected language");
assert.doesNotMatch(webAppSource, /return "Invalid username or password|return "Account or password/, "Web auth errors must follow the selected language");
assert.doesNotMatch(webAppSource, /return "Operation failed|return "Request failed/, "Web generic errors must follow the selected language");
assert.match(webAppSource, /"sync\.useServer"/, "Web i18n must include conflict action copy for using the server version");
assert.match(webAppSource, /"sync\.overwriteServer"/, "Web i18n must include conflict action copy for overwriting the server");
assert.match(webAppSource, /useCloud\.textContent = t\("sync\.useServer"\)/, "Web conflict use-server action must follow the selected language");
assert.match(webAppSource, /overwriteCloud\.textContent = t\("sync\.overwriteServer"\)/, "Web conflict overwrite action must follow the selected language");
assert.doesNotMatch(webAppSource, /useCloud\.textContent = "[^"]+"/, "Web conflict actions must not be hard-coded in Chinese");
assert.doesNotMatch(webAppSource, /overwriteCloud\.textContent = "[^"]+"/, "Web conflict actions must not be hard-coded in Chinese");
assert.match(webHtmlSource, /id="registrationGateHint"/, "Web registration gating must be visible without relying on hover-only title text");
assert.match(webAppSource, /registrationGateHint/, "Web registration gating hint must be updated with auth mode state");
assert.match(
  webHtmlSource,
  /<details id="advancedConnectionSettings" class="advanced-connection-settings" hidden>/,
  "Web advanced connection settings must remain available after intentional reveal",
);
assert.match(webHtmlSource, /id="showAdvancedConnectionButton"/, "Web login must provide a deliberate action to reveal advanced connection settings");
assert.match(webAppSource, /advancedConnectionManuallyRequested/, "Web login must track intentional advanced connection reveal state");
assert.match(webAppSource, /function showAdvancedConnectionSettings\(/, "Web advanced connection reveal must use a focused helper");
assert.match(webAppSource, /showAdvancedConnectionButton[\s\S]{0,180}showAdvancedConnectionSettings\(\)/, "Web reveal button must open advanced connection settings");
assert.match(webAppSource, /advancedConnectionSettings\.hidden = !showAdvancedConnectionEntry/, "Web advanced connection settings must be hidden until intentionally requested or needed for errors");
assert.match(webAppSource, /revealAdvancedConnectionSettings\(\)[\s\S]{0,220}advancedConnectionManuallyRequested = true[\s\S]{0,220}advancedConnectionSettings\.open = true/, "Web connection failures must reveal and open advanced connection settings");
assert.match(webHtmlSource, /id="confirmDialog"/, "Web must use an in-app confirmation dialog for risky actions");
assert.match(webAppSource, /function confirmUserAction\(/, "Web risky-action confirmations must be centralized");
assert.match(webAppSource, /function getConfirmFocusableElements\(/, "Web confirmation dialog must centralize focusable element discovery");
assert.match(webAppSource, /previousActiveElement/, "Web confirmation dialog must remember the trigger focus before opening");
assert.match(webAppSource, /event\.key === "Tab"/, "Web confirmation dialog must trap Tab focus while open");
assert.match(webAppSource, /previousActiveElement\?\.focus\(\)/, "Web confirmation dialog must restore focus when it closes");
assert.doesNotMatch(webAppSource, /window\.confirm\(/, "Web must not rely on native confirm dialogs for core task flows");
const webAuthGuide = sourceBetween(webHtmlSource, '<details id="serverSetupHelp"', '</details>');
assert.doesNotMatch(
  webAuthGuide,
  /git clone|docker compose|command-snippet|Windows PowerShell|macOS \/ Linux/,
  "Web login first-use guide must not put deployment commands in the auth screen",
);
assert.match(webHtmlSource, /data-i18n="startup\.clearAndReload"/, "Web startup recovery must name page resource cache, not task data cache");
assert.doesNotMatch(webHtmlSource, /offline cache|task data cache/i, "Web startup recovery must not imply that local task data will be cleared");
assert.match(webAppSource, /"startup\.clearAndReload"[\s\S]{0,380}Clear page resource cache and refresh/, "Web Chinese startup recovery copy must use page resource cache wording");
assert.match(webAppSource, /"startup\.clearAndReload": "Clear page resource cache and refresh"/, "Web English startup recovery copy must use page resource cache wording");
assert.doesNotMatch(
  webHtmlSource,
  /<span>[^<]*(127\.0\.0\.1|LAN IP)/i,
  "Web login first screen must not front-load local-network instructions",
);

assert.match(desktopDbSource, /currentUserDatabaseKey/, "Desktop SQLite must derive an active workspace database key");
assert.match(desktopDbSource, /workspaceDatabaseFileName\(settings\.baseUrl, userId\)/, "Desktop SQLite must isolate database files by server origin and user");
assert.match(desktopDbSource, /migrateLegacyWorkspaceDatabase/, "Desktop SQLite must migrate legacy per-user and global databases into one claimed workspace");
assert.match(desktopDbSource, /claimLegacyGlobalDatabaseWorkspace/, "Desktop global database migration must be claimed by only one workspace");
assert.match(desktopDbSource, /dbUserKey !== nextUserKey/, "Desktop SQLite must reopen when the active server or user changes");
assert.doesNotMatch(desktopDbSource, /join\(app\.getPath\("userData"\), "taskbridge\.sqlite"\)/, "Desktop must not keep using one global task database");

assert.match(desktopLoginSource, /serverUrlDraft/, "Desktop login must allow changing the server address before sign-in");
assert.match(desktopLoginSource, /testConnection/, "Desktop login must allow testing the server address before sign-in");
assert.match(desktopLoginSource, /saveConnection/, "Desktop login must allow saving the server address before sign-in");
assert.match(desktopLoginSource, /settingsStore\.t\("settings\.serverUrl"\)/, "Desktop login server URL label must reuse user-facing settings copy");
assert.match(desktopLoginSource, /settingsStore\.t\("settings\.checkAndSaveConnection"\)/, "Desktop login must expose one primary check-and-save connection action");
const desktopLoginSubmit = sourceBetween(
  desktopLoginSource,
  "async function submit(): Promise<void> {",
  "function updateLanguage",
);
assert.match(
  desktopLoginSubmit,
  /const connectionReady = await testConnection\(\);[\s\S]{0,120}if \(!connectionReady\) return;[\s\S]{0,360}auth\.(login|register)\(/,
  "Desktop login/register submit must verify the visible server connection before authenticating",
);
assert.match(desktopLoginSource, /async function testConnection\(\): Promise<boolean>/, "Desktop connection test must return whether auth may continue");
assert.match(
  desktopLoginSource,
  /<input v-model="email"[\s\S]{0,140}:type="mode === &quot;register&quot; \? &quot;email&quot; : &quot;text&quot;"|<input v-model="email"[\s\S]{0,140}:type="mode === 'register' \? 'email' : 'text'"/,
  "Desktop registration email field must use the email input type without breaking username login",
);
assert.doesNotMatch(desktopLoginSource, /class="first-use-cards"|auth\.firstUseNoServerTitle/, "Desktop first-use guide must not front-load multiple path cards before the server URL");
assert.match(desktopI18nSource, /"auth\.firstUseNoServerTitle"/, "Desktop i18n must define the no-server first-use title");
assert.match(desktopI18nSource, /"auth\.noServerHelpSummary"/, "Desktop i18n must define the no-server help summary");
assert.doesNotMatch(
  desktopI18nSource,
  /"auth\.(firstUseLocalTrial|firstUseLocalTrialTitle|firstUseSelfHost|firstUseSelfHostTitle|setupChecklistTitle|setupStepServer|setupStepCheck|setupStepAccount)"/,
  "Desktop i18n must not keep unused first-use path cards or setup checklist copy",
);
assert.doesNotMatch(
  desktopCssSource,
  /\.first-use-cards|\.first-use-card|\.setup-checklist/,
  "Desktop CSS must not keep unused first-use card or setup checklist styles",
);
const desktopFirstUseGuideSource = sourceBetween(
  desktopLoginSource,
  '<details class="first-use-guide first-use-guide-collapsed">',
  '</details>',
);
assert.doesNotMatch(
  desktopFirstUseGuideSource,
  /settingsStore\.language === "zh-CN"/,
  "Desktop first-use guide copy must come from i18n instead of inline language branches",
);
assert.doesNotMatch(
  desktopFirstUseGuideSource,
  /class="first-use-cards"|class="setup-checklist"/,
  "Desktop first-use guide should keep the default path compact and put setup detail behind optional help",
);
assert.match(desktopLoginSource, /first-use-guide|首次使用怎么选|auth\.firstUseTitle/, "Desktop login must keep optional first-use guidance available after the primary sign-in flow");
assert.match(desktopLoginSource, /serverLocalhostHint|localhostServerHint|localhostHint/, "Desktop login must warn when localhost is only valid for this computer");
assert.match(desktopLoginSource, /serverLocalhostHint[\s\S]{0,260}form-message-info/, "Desktop login localhost guidance must be informational, not an error state");
assert.doesNotMatch(desktopLoginSource, /serverLocalhostHint[\s\S]{0,260}form-message-error/, "Desktop login localhost guidance must not look like a failed connection");
assert.match(
  desktopLoginSource,
  /class="secondary-button"[\s\S]{0,420}checkAndSaveConnection/,
  "Desktop login should keep connection testing as a secondary troubleshooting action",
);
assert.match(
  desktopLoginSource,
  /class="primary-button" type="submit"[\s\S]{0,180}auth\.loading/,
  "Desktop login should stay primary because submit automatically verifies the connection",
);
assert.doesNotMatch(desktopLoginSource, /<button v-if="auth\.registrationEnabled"/, "Desktop registration tab must stay visible with a disabled explanation");
assert.match(desktopLoginSource, /async function ensureRegistrationModeAvailable\(/, "Desktop registration tab should test the connection automatically when registration status is unknown");
assert.match(desktopLoginSource, /await ensureRegistrationModeAvailable\(\)/, "Desktop registration tab click should run the automatic registration availability check");
assert.match(desktopLoginSource, /const registrationBlocked = computed\(\(\) => auth\.registrationStatusKnown && !auth\.registrationEnabled\)/, "Desktop registration tab should only be disabled after the server confirms registration is closed");
assert.match(desktopLoginSource, /:disabled="registrationBlocked"/, "Desktop registration tab must remain clickable while registration status is unknown");
assert.doesNotMatch(desktopLoginSource, /:disabled="!auth\.registrationStatusKnown \|\| !auth\.registrationEnabled"/, "Desktop registration tab must not force users to manually test before opening registration");
assert.match(desktopLoginSource, /const passwordVisible = ref\(false\)/, "Desktop auth password field must track local visibility state");
assert.match(desktopLoginSource, /const passwordToggleLabel = computed/, "Desktop auth password toggle must use localized label state");
assert.match(desktopLoginSource, /:type="passwordInputType"/, "Desktop auth password toggle must switch the input type");
assert.match(desktopLoginSource, /:aria-label="passwordToggleLabel"/, "Desktop auth password toggle must be accessible to screen readers");
assert.match(desktopI18nSource, /"auth\.showPassword"/, "Desktop i18n must define show-password copy");
assert.match(desktopI18nSource, /"auth\.hidePassword"/, "Desktop i18n must define hide-password copy");
assert.match(desktopLoginSource, /:autocomplete="mode === 'login' \? 'current-password' : 'new-password'"/, "Desktop registration must use new-password autocomplete instead of current-password");
assert.match(desktopLoginSource, /:minlength="mode === 'register' \? 8 : 1"/, "Desktop login must only enforce 8-character passwords while registering");
assert.match(desktopI18nSource, /"auth\.subtitle": \{ "zh-CN": "跨设备待办"/, "Desktop login subtitle must describe the product value, not the client module");
assert.match(desktopI18nSource, /"auth\.firstUseTitle"/, "Desktop i18n must include first-use guide copy");
assert.match(desktopI18nSource, /Phones or other computers|127\.0\.0\.1/, "Desktop localhost warning must explain the cross-device address issue");
assert.match(desktopI18nSource, /联系服务器管理员创建账号/, "Desktop registration-disabled copy must tell users what to do next");
assert.match(desktopI18nSource, /"auth\.networkError"/, "Desktop i18n must include a user-facing network error");
assert.match(desktopI18nSource, /"auth\.serverError"/, "Desktop i18n must include a user-facing server error");
assert.match(desktopAuthStoreSource, /function normalizeAuthErrorMessage\(/, "Desktop auth store must normalize raw backend and network errors");
assert.doesNotMatch(desktopAuthStoreSource, /error\.value = err instanceof Error \? err\.message/, "Desktop auth store must not expose raw error.message directly");
assert.match(desktopAuthStoreSource, /const registrationEnabled = ref\(false\)/, "Desktop registration must not be optimistically enabled before the server confirms it");
assert.match(desktopAuthStoreSource, /const registrationStatusKnown = ref\(false\)/, "Desktop registration availability must track the unknown state separately");
assert.match(desktopAuthStoreSource, /registrationStatusKnown\.value = true/, "Desktop registration status check must mark known results");
assert.match(desktopAuthStoreSource, /catch\s*\{[\s\S]{0,160}registrationEnabled\.value = false[\s\S]{0,160}registrationStatusKnown\.value = false/, "Desktop failed registration checks must leave registration unavailable until connection is checked again");
assert.doesNotMatch(desktopLoginSource, /:disabled="!auth\.registrationStatusKnown \|\| !auth\.registrationEnabled"/, "Desktop registration tab must stay clickable while registration status is unknown");
assert.doesNotMatch(desktopSettingsSurfaceSource, /settingsStore\.t\("settings\.applyServerUrl"\)/, "Desktop settings must not expose a separate apply-address action");
assert.match(desktopSettingsSurfaceSource, /checkAndSaveConnection/, "Desktop settings must provide a combined save-and-check connection action");
assert.match(desktopSettingsSurfaceSource, /resetGeneratedConnectionEndpoints/, "Desktop settings must let users restore generated advanced endpoints");
assert.match(desktopI18nSource, /"settings\.resetGeneratedEndpoints"/, "Desktop i18n must include generated-endpoint reset copy");
assert.match(desktopSettingsSurfaceSource, /<button class="primary-button" type="button"[\s\S]{0,180}checkAndSaveConnection/, "Desktop settings should make save-and-test connection the primary action in the connection section");
assert.match(desktopI18nSource, /"settings\.checkAndSaveConnection"/, "Desktop i18n must include combined connection copy");
assert.match(desktopI18nSource, /"settings\.advancedEndpoints": \{ "zh-CN": "排障：自定义连接地址"/, "Desktop i18n must frame custom connection settings as troubleshooting");
assert.match(desktopSettingsSource, /settingsNavGroups/, "Desktop settings must group navigation into user-oriented sections instead of one flat row");
assert.match(desktopI18nSource, /"settings\.navCommon": \{ "zh-CN": "常用设置", "en-US": "Common settings" \}/, "Desktop settings must label common settings as a top-level group");
assert.match(desktopI18nSource, /"settings\.navDataSafety": \{ "zh-CN": "数据安全", "en-US": "Data safety" \}/, "Desktop settings must label data safety as a top-level group");
assert.match(desktopI18nSource, /"settings\.navSyncRecovery": \{ "zh-CN": "同步问题", "en-US": "Sync issues" \}/, "Desktop settings must label sync issues as a top-level group");
assert.match(desktopI18nSource, /"settings\.navAdvancedMaintenance": \{ "zh-CN": "高级维护", "en-US": "Advanced maintenance" \}/, "Desktop settings must label advanced maintenance as a top-level group");
assert.match(
  desktopI18nSource,
  /"settings\.subtitle": \{ "zh-CN": "常用设置与数据安全", "en-US": "Settings and data safety" \}/,
  "Desktop settings title must describe the ordinary user outcome instead of the client module",
);
assert.match(desktopI18nSource, /"settings\.baseUrl": \{ "zh-CN": "自定义请求地址", "en-US": "Request address for custom proxy" \}/, "Desktop advanced request endpoint label must avoid API jargon");
assert.match(desktopI18nSource, /"settings\.wsUrl": \{ "zh-CN": "自定义同步地址", "en-US": "Sync address for custom proxy" \}/, "Desktop advanced sync endpoint label must avoid WebSocket jargon");
assert.doesNotMatch(desktopI18nSource, /"settings\.baseUrl": \{[^\n]*(API 地址|API URL)/, "Desktop advanced request endpoint label must not be API-first copy");
assert.doesNotMatch(desktopI18nSource, /"settings\.wsUrl": \{[^\n]*(WebSocket 地址|WebSocket URL)/, "Desktop advanced sync endpoint label must not be WebSocket-first copy");
assert.match(desktopSettingsSurfaceSource, /settingsStore\.t\("settings\.advancedEndpoints"\)/, "Desktop settings must use the developer endpoint copy from i18n");
assert.match(desktopSettingsSurfaceSource, /saveAdvancedConnection/, "Desktop settings must provide an explicit save-and-test action for developer endpoints");
assert.match(
  desktopSettingsSurfaceSource,
  /@click="\$emit\('saveAdvancedConnection'\)"|@save-advanced-connection="saveAdvancedConnection"/,
  "Desktop advanced endpoint inputs must not rely on the root-address save action",
);
assert.match(desktopSettingsSurfaceSource, /confirmRenameTaskMeta/, "Desktop project and tag bulk edits must require an impact confirmation");
assert.match(desktopSettingsSurfaceSource, /metadataRenameAffectedCount/, "Desktop project and tag rename confirmation must preview the number of affected tasks");
assert.match(desktopI18nSource, /"settings\.confirmMetadataRename"/, "Desktop i18n must include metadata rename confirmation copy");
const desktopSaveAndTestConnection = sourceBetween(
  desktopSettingsSurfaceSource,
  "async function checkAndSaveConnection(): Promise<void> {",
  "function markConnectionSaved",
);
assert.doesNotMatch(
  desktopSaveAndTestConnection,
  /settings\.baseUrl\s*=|settings\.wsUrl\s*=/,
  "Desktop root connection save must not overwrite manually edited developer endpoints before testing",
);
const desktopAutoSaveHelpers = sourceBetween(
  desktopSettingsSurfaceSource,
  "function showAutoSaveFeedback(): void {",
  "function applyServerUrl",
);
assert.match(desktopI18nSource, /"settings\.autoSaved"/, "Desktop settings must name non-dangerous settings as auto-saved");
assert.match(desktopI18nSource, /"settings\.autoSaveHint"/, "Desktop settings must explain that display and window preferences are saved immediately");
assert.match(desktopSettingsSource, /settingsStore\.t\("settings\.autoSaved"\)/, "Desktop settings header must show the auto-save state instead of a manual global save");
assert.match(desktopSettingsSource, /settingsStore\.t\("settings\.autoSaveHint"\)/, "Desktop settings header must explain the immediate-save model");
assert.doesNotMatch(desktopSettingsSource, /settingsStore\.t\("settings\.saveDisplayPreferences"\)/, "Desktop settings must not keep a mixed manual-save model for display and window settings");
for (const key of ["setLanguage", "setDesktopTheme", "setDisplayTimeZone", "setAutoStart", "floatingVisibleOnStart", "floatingOpacity"]) {
  assert.match(desktopAutoSaveHelpers, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Desktop settings auto-save helper must persist ${key}`);
}
assert.doesNotMatch(
  desktopAutoSaveHelpers,
  /setSetting\("baseUrl"|setSetting\("wsUrl"/,
  "Desktop display/window auto-save must not persist connection endpoints; connection has its own save-and-test action",
);
assert.match(desktopTaskEditorSource, /dirty-change/, "Desktop task editor must tell parents when the draft has unsaved changes");
assert.match(desktopTaskEditorSource, /checklist-draft-items/, "Desktop task editor must expose checklist items as direct controls");
assert.match(desktopTaskEditorSource, /toggleChecklistDraftItem/, "Desktop task editor must let users toggle checklist items directly");
assert.match(desktopTaskEditorSource, /deleteChecklistDraftItem/, "Desktop task editor must let users delete checklist items directly");
assert.match(
  desktopTaskStoreSource,
  /checklistTextToJson\(draft\.checklistText,\s*task\.checklistJson,\s*draft\.checklistItems\)/,
  "Desktop task edits must preserve checklist completion state when users only edit checklist text titles",
);
assert.match(desktopTaskStoreSource, /preserveChecklistItemState/, "Desktop checklist text parsing must reuse matching existing item state");
assert.match(desktopI18nSource, /"task\.discardChangesConfirm"/, "Desktop i18n must include discard confirmation copy");
assert.match(desktopConfirmDialogSource, /role="dialog"/, "Desktop confirmation dialog must expose dialog semantics");
assert.match(desktopConfirmDialogSource, /aria-modal="true"/, "Desktop confirmation dialog must be modal for assistive technology");
assert.match(desktopConfirmDialogSource, /aria-labelledby/, "Desktop confirmation dialog must label itself from the visible title");
assert.match(desktopConfirmDialogSource, /previousActiveElement/, "Desktop confirmation dialog must restore focus to the opener after close");
assert.match(desktopConfirmDialogSource, /focusableDialogElements/, "Desktop confirmation dialog must compute focusable controls for keyboard users");
assert.match(desktopConfirmDialogSource, /event\.key === "Tab"/, "Desktop confirmation dialog must trap Tab navigation inside the modal");
assert.match(desktopConfirmDialogSource, /confirm-dialog-danger/, "Desktop confirmation dialog must support dangerous action styling");
for (const [name, source] of [
  ["Desktop app shell", desktopAppSource],
  ["Desktop all-tasks view", desktopTaskViewSource],
  ["Desktop today view", desktopTodayViewSource],
  ["Desktop settings view", desktopSettingsSurfaceSource],
]) {
  assert.doesNotMatch(source, /window\.confirm\(/, `${name} must use the in-app confirmation dialog instead of native window.confirm`);
}
for (const [name, source] of [
  ["Desktop all-tasks view", desktopTaskViewSource],
  ["Desktop today view", desktopTodayViewSource],
]) {
  assert.match(source, /ConfirmDialog/, `${name} must render the shared confirmation dialog`);
  assert.match(source, /useConfirmDialog\(/, `${name} must centralize risky-action confirmation requests`);
  assert.match(source, /function closeEditor\(/, `${name} must centralize drawer closing through a dirty-check helper`);
  assert.match(source, /requestConfirmation\([\s\S]{0,320}task\.discardChangesConfirm/, `${name} must confirm before discarding unsaved task edits`);
  assert.doesNotMatch(source, /@click="editorOpen = false"/, `${name} drawer scrim must not discard edits directly`);
  assert.doesNotMatch(source, /@cancel="editorOpen = false"/, `${name} editor cancel must not discard edits directly`);
}
assert.match(desktopTaskViewSource, /TaskFilter = "all"[\s\S]*"trash"/, "Desktop task list must expose a trash/recycle-bin filter");
assert.match(desktopTaskViewSource, /taskStore\.trashTasks/, "Desktop trash view must read deleted local tasks");
assert.match(desktopTaskItemSource, /trash\?: boolean/, "Desktop task item must support a trash restore-only mode");
assert.match(desktopTaskItemSource, /<button\s+v-if="!trash"[\s\S]{0,180}class="check-button"/, "Desktop trash rows must hide the completion checkbox-style button");
assert.doesNotMatch(desktopTaskItemSource, /if \(props\.trash\)[\s\S]{0,120}emit\("restore"/, "Desktop trash rows must not use the completion button as restore");
assert.match(desktopI18nSource, /"task\.trash"/, "Desktop i18n must name the trash view");
assert.match(desktopTaskItemSource, /purge:\s*\[task: TaskRecord\]/, "Desktop trash rows must expose a permanent-delete event");
assert.match(desktopTaskItemSource, /settingsStore\.t\("task\.purge"\)/, "Desktop trash rows must show a user-facing permanent-delete action");
assert.match(desktopTaskViewSource, /async function purgeTask\(/, "Desktop trash view must confirm and execute permanent delete");
assert.match(desktopTaskStoreSource, /async function purgeTask\(/, "Desktop task store must implement permanent delete");
assert.match(desktopTaskStoreSource, /purgeRemoteTask/, "Desktop permanent delete must call the backend purge endpoint for synced tasks");
assert.match(desktopDbSource, /export function purgeLocalTask/, "Desktop permanent delete must remove local-only trash tasks from SQLite");
assert.match(desktopAppSource, /logoutPendingWarning/, "Desktop logout must warn before leaving with unsynced work");
assert.match(desktopAppSource, /ConfirmDialog/, "Desktop logout warning must use the shared confirmation dialog");
assert.match(desktopTaskViewSource, /useCloudConfirm/, "Desktop conflict resolution must confirm using the server version");
assert.match(desktopTaskViewSource, /overwriteCloudConfirm/, "Desktop conflict resolution must confirm overwriting the server version");
assert.match(desktopTaskItemSource, /useServer: \[task: TaskRecord\]/, "Desktop task cards must emit a server-version conflict action");
assert.match(desktopTaskItemSource, /overwriteServer: \[task: TaskRecord\]/, "Desktop task cards must emit a local-overwrite conflict action");
assert.match(desktopTaskItemSource, /conflict-detail|conflictSnapshotDetail|sync\.conflictFields/, "Desktop task cards must show conflict details near the task");
assert.match(desktopTaskItemSource, /type ConflictSnapshotDiff/, "Desktop conflict details must keep local and synced values as structured rows");
assert.match(desktopTaskItemSource, /conflict-snapshot-grid/, "Desktop conflict details must render local and synced versions side by side");
assert.doesNotMatch(
  desktopTaskItemSource,
  /\$\{field\.label\}: \$\{field\.local \|\| "-"\} \/ \$\{field\.cloud \|\| "-"\}/,
  "Desktop conflict details must not expose local/server differences as slash-joined engineering text",
);
assert.match(desktopTaskItemSource, /snapshotText\(local,\s*\["due_time", "dueTime"\]/, "Desktop conflict details must compare due dates from snake_case and camelCase snapshots");
assert.match(desktopTaskItemSource, /snapshotText\(local,\s*\["planned_date", "plannedDate"\]/, "Desktop conflict details must compare planned dates from snake_case and camelCase snapshots");
assert.match(desktopTaskItemSource, /snapshotText\(local,\s*\["remind_time", "remindTime"\]/, "Desktop conflict details must compare reminders from snake_case and camelCase snapshots");
assert.match(desktopTaskItemSource, /snapshotRepeatRuleLabel\(local,\s*\["repeat_rule", "repeatRule"\]/, "Desktop conflict details must compare repeat rules from snake_case and camelCase snapshots");
assert.match(desktopTaskItemSource, /snapshotChecklistSummary\(local,\s*\["checklist", "checklistJson"\]/, "Desktop conflict details must compare checklist snapshots from object and JSON-string forms");
assert.doesNotMatch(desktopTaskItemSource, /\.slice\(0,\s*4\)/, "Desktop conflict details must not truncate field differences before the user decides");
assert.match(desktopTaskItemSource, /getTaskRepeatRuleLabel\(task\.repeatRule/, "Desktop task rows must localize repeat rules before showing them");
assert.match(desktopTaskItemSource, /snapshotRepeatRuleLabel\(local,\s*\["repeat_rule", "repeatRule"\]/, "Desktop conflict details must localize repeat rules before showing them");
assert.doesNotMatch(desktopTaskItemSource, /\{\{\s*task\.repeatRule\s*\}\}/, "Desktop task rows must not expose raw daily/weekly/monthly repeat rules");
assert.match(desktopTaskViewSource, /@use-server="resolveConflictUseServer"/, "Desktop task rows must wire the server-version conflict action at the row");
assert.match(desktopTaskViewSource, /@overwrite-server="forceOverwriteServer"/, "Desktop task rows must wire the local-overwrite conflict action at the row");
assert.match(desktopI18nSource, /"sync\.cloudSnapshot": \{ "zh-CN": "同步来的版本", "en-US": "Synced version" \}/, "Desktop conflict copy must name the remote side as the synced version");
assert.match(desktopI18nSource, /"sync\.useCloud": \{ "zh-CN": "保留同步来的版本", "en-US": "Keep synced version" \}/, "Desktop conflict action must describe the user's choice plainly");
assert.doesNotMatch(desktopI18nSource, /(采用云端|覆盖云端|云端版本|Use cloud|Overwrite cloud|cloud version)/, "Desktop user-facing conflict copy must use server/device wording instead of cloud wording");
assert.doesNotMatch(desktopI18nSource, /重新加入同步队列/, "Desktop conflict copy must not expose sync queue internals to users");
assert.match(desktopLoginSource, /connectionNoteTone/, "Desktop login connection feedback must distinguish success from failure");
assert.match(desktopSettingsSurfaceSource, /connectionNoteTone/, "Desktop settings connection feedback must distinguish success from failure");
assert.match(desktopUserFacingErrorsSource, /formatConnectionFailureMessage/, "Desktop must centralize user-facing connection failure copy");
assert.match(desktopLoginSource, /formatConnectionFailureMessage/, "Desktop login must use user-facing connection failure copy");
assert.match(desktopSettingsSurfaceSource, /formatConnectionFailureMessage/, "Desktop settings must use user-facing connection failure copy");
assert.doesNotMatch(desktopLoginSource, /connectionNote\.value = `\$\{settingsStore\.t\("settings\.connectionFailed"\)\}\$\{detail\}`/, "Desktop login must not append raw connection error details");
assert.doesNotMatch(desktopSettingsSurfaceSource, /connectionNote\.value = `\$\{settingsStore\.t\("settings\.connectionFailed"\)\}\$\{detail\}`/, "Desktop settings must not append raw connection error details");
assert.doesNotMatch(desktopSettingsSurfaceSource, /result\.error\.message/, "Desktop import failures must not expose raw import exception messages");
assert.match(desktopSettingsSurfaceSource, /formatImportFailureMessage/, "Desktop import failures must be mapped to actionable user-facing copy");
assert.match(desktopSettingsSurfaceSource, /confirmDiagnosticsExport/, "Desktop diagnostics export must require explicit confirmation before saving sensitive data");
assert.match(desktopSettingsSurfaceSource, /ConfirmDialog/, "Desktop diagnostics export confirmation must use the shared confirmation dialog");
assert.match(desktopSettingsSurfaceSource, /Intl\.supportedValuesOf\("timeZone"\)/, "Desktop time zone selection must use the runtime time-zone list instead of a short fixed list");
assert.match(desktopSettingsSurfaceSource, /settings\.diagnosticsSupportTools/, "Desktop diagnostics export must live in support tools instead of the default data action row");
assert.match(desktopSettingsSurfaceSource, /updateStatusSummary/, "Desktop update status must use localized user-facing summary text");
assert.match(desktopSettingsSurfaceSource, /updateTechnicalDetail/, "Desktop update raw errors must be hidden behind technical details");
assert.match(desktopSettingsSurfaceSource, /pendingBackupImport/, "Desktop backup import must preview the selected file before importing");
assert.match(desktopSettingsSurfaceSource, /confirmBackupImport/, "Desktop backup import must require explicit confirmation after preview");
assert.match(desktopSettingsSurfaceSource, /lastImportedBackupLocalIds/, "Desktop settings must retain imported task ids for undo");
assert.match(desktopSettingsSurfaceSource, /undoLastBackupImport/, "Desktop settings must provide an undo action for the last backup import");
assert.match(desktopSettingsSurfaceSource, /getLastImportUndoSummary/, "Desktop settings must restore backup import undo availability when users return to settings");
assert.match(desktopIpcSource, /task:get-last-import-undo-summary/, "Desktop IPC must expose the current backup import undo summary");
assert.match(desktopIpcSource, /setLastBackupImportUndoItems/, "Desktop backup import undo metadata must be persisted beyond the current settings view");
assert.match(desktopIpcSource, /clearLastBackupImportUndoItems/, "Desktop backup import undo metadata must be cleared after undo");
assert.match(desktopSettingsSurfaceSource, /bridge\(\)\.task\.chooseImportJson/, "Desktop backup import must choose and preview a backup before confirmation");
assert.match(desktopSettingsSurfaceSource, /bridge\(\)\.task\.confirmImportJson/, "Desktop backup import must use a separate confirm step");
assert.match(desktopSettingsSurfaceSource, /bridge\(\)\.task\.undoLastImportJson/, "Desktop backup import undo must use an explicit IPC path");
assert.match(desktopSettingsSurfaceSource, /clearLocalDeviceData/, "Desktop settings must offer a clear-this-device data flow");
assert.match(desktopSettingsSurfaceSource, /bridge\(\)\.db\.clearLocalDeviceData/, "Desktop clear-this-device flow must delete local task data");
assert.match(desktopSettingsSurfaceSource, /authStore\.logout\(\)/, "Desktop clear-this-device flow must also sign out");
assert.match(desktopSettingsSurfaceSource, /settings-backup-actions/, "Desktop settings must group backup import and export actions separately");
assert.match(desktopSettingsSurfaceSource, /settings-session-actions/, "Desktop settings must isolate sign-out and clear-this-device actions");
assert.match(desktopSettingsSurfaceSource, /settings-update-actions/, "Desktop settings must keep update checks out of destructive data actions");
assertOrder(
  desktopSettingsSurfaceSource,
  'class="settings-backup-actions"',
  'class="settings-session-actions"',
  "Desktop backup actions must appear before account-clearing actions",
);
assertOrder(
  desktopSettingsSurfaceSource,
  'class="settings-session-actions"',
  'class="settings-update-actions"',
  "Desktop update actions must not sit between backup and destructive session actions",
);
assert.match(desktopDbSource, /export function clearLocalDeviceData/, "Desktop DB must expose a local-device data clearing helper");
assert.match(desktopIpcSource, /db:local:clear-device-data/, "Desktop IPC must expose local-device data clearing");
assert.match(desktopI18nSource, /"settings\.clearLocalData"/, "Desktop i18n must include clear-this-device copy");
assert.doesNotMatch(
  desktopI18nSource,
  /"settings\.clearLocalData": \{ "zh-CN": "退出并清除此设备数据"/,
  "Desktop destructive clear-device button must not combine logout and clearing in the short label",
);
assert.doesNotMatch(
  webAppSource,
  /"app\.clearLocalData": "退出并清除此设备数据"/,
  "Web destructive clear-device button must not combine logout and clearing in the short label",
);
assert.doesNotMatch(
  androidSettingsSource,
  /Text\(if \(isEnglish\) "Log out and clear this device" else "退出并清除此设备数据"\)/,
  "Android destructive clear-device button must not combine logout and clearing in the short label",
);
assert.match(desktopDbSource, /undoImportedBackupTasks/, "Desktop backup import undo must use a dedicated DB helper");
assert.match(desktopDbSource, /sync_status = 'pending_delete'[\s\S]{0,260}server_id IS NOT NULL/, "Desktop backup import undo must soft-delete imported tasks that already synced");
assert.match(desktopDbSource, /BackupImportUndoItem/, "Desktop backup import undo must track each imported task's original update marker");
assert.match(desktopDbSource, /importedUpdatedAt/, "Desktop backup import undo must compare against the import-time update marker");
assert.match(desktopDbSource, /updated_at !== item\.importedUpdatedAt|updated_at !== importedUpdatedAt|task\.updated_at !== item\.importedUpdatedAt/, "Desktop backup import undo must skip tasks changed after import");
assert.match(desktopIpcSource, /skippedChangedCount/, "Desktop backup import undo must report tasks skipped because they changed after import");
assert.match(desktopSettingsSurfaceSource, /undoLastBackupImport\(\)[\s\S]{0,500}requestConfirmation/, "Desktop backup import undo must ask for confirmation before deleting imported tasks");
assert.match(desktopSettingsSurfaceSource, /skippedChangedCount/, "Desktop backup import undo message must explain changed tasks that were not undone");
assert.doesNotMatch(desktopIpcSource, /return deleteLocalUnsyncedTasks\(localIds\)/, "Desktop backup import undo must not silently fail after imported tasks have synced");
assert.doesNotMatch(
  desktopSettingsSurfaceSource,
  /const result = await bridge\(\)\.task\.importJson\(\)/,
  "Desktop settings must not import backups immediately after file selection",
);
assert.match(desktopLoginSource, /advancedConnectionManuallyRequested/, "Desktop login should keep advanced connection behind an intentional reveal");
assert.match(desktopLoginSource, /showAdvancedConnectionEntry[\s\S]{0,180}connectionNoteTone\.value === "error"/, "Desktop login advanced connection entry should appear after connection errors");
assert.match(desktopSettingsSurfaceSource, /advancedConnectionManuallyRequested/, "Desktop settings should keep advanced connection behind an intentional reveal");
assert.match(desktopSettingsSurfaceSource, /showAdvancedConnectionEntry[\s\S]{0,180}connectionNoteTone\.value === "error"/, "Desktop settings advanced connection entry should appear after connection errors");
assert.match(desktopLoginSource, /settings\.baseUrl/, "Desktop login advanced settings must let users edit the API URL before authentication");
assert.match(desktopLoginSource, /settings\.wsUrl/, "Desktop login advanced settings must let users edit the WebSocket URL before authentication");
assert.match(desktopLoginSource, /resetGeneratedConnectionEndpoints/, "Desktop login must let users regenerate advanced endpoints from the server URL");
assert.doesNotMatch(desktopInstallerSource, /RMDir \/r "\$APPDATA\\TaskBridge"/, "Desktop uninstall must not delete user data by default");
assert.doesNotMatch(desktopInstallerSource, /RMDir \/r "\$LOCALAPPDATA\\TaskBridge"/, "Desktop uninstall must not delete local user data by default");
assert.match(desktopReadmeSource, /卸载 TaskBridge 不会自动删除本地数据/, "Desktop docs must clearly state uninstall preserves local data");
assert.match(desktopAppSource, /REMINDER_DEDUP_STORAGE_KEY/, "Desktop reminders must persist their dedupe state across restarts");
assert.match(desktopAppSource, /loadNotifiedReminderIds\(\)/, "Desktop reminders must load persisted dedupe state on startup");
assert.match(desktopAppSource, /saveNotifiedReminderIds\(\)/, "Desktop reminders must save dedupe state after reminder changes");
assert.match(desktopIpcSource, /task:choose-import-json/, "Desktop IPC must expose a backup import preview channel");
assert.match(desktopIpcSource, /task:confirm-import-json/, "Desktop IPC must expose a backup import confirmation channel");
assert.match(desktopIpcSource, /task:undo-last-import-json/, "Desktop IPC must expose a backup import undo channel");
assert.match(desktopIpcSource, /BackupImportPreview/, "Desktop IPC must define a preview result for backup imports");
assert.match(desktopIpcSource, /importedLocalIds/, "Desktop IPC must return imported local ids for post-import recovery");
assert.match(desktopIpcSource, /deleteImportedBackupTasks/, "Desktop IPC must support deleting the last imported backup batch");
assert.match(desktopI18nSource, /"settings\.confirmBackupImport"/, "Desktop i18n must include backup import confirmation copy");
assert.match(desktopI18nSource, /"settings\.undoLastImport"/, "Desktop i18n must include backup import undo copy");
const desktopUpdateStatusSummary = sourceBetween(
  desktopSettingsSurfaceSource,
  "const updateStatusSummary = computed(() => {",
  "const updateTechnicalDetail = computed(() => {",
);
assert.doesNotMatch(desktopUpdateStatusSummary, /updateStatus\.value\.(message|error)/, "Desktop update summary must not expose raw updater messages or errors");
const desktopDataSession = sourceBetween(desktopSettingsSurfaceSource, '<section class="settings-section settings-data">', '<section class="settings-section settings-metadata">');
const desktopDiagnosticsSection = sourceBetween(desktopDataSession, '<details class="settings-advanced-details"', '</details>');
const desktopDefaultDataActions = sourceBetween(desktopDataSession, '<div class="settings-data-actions">', '</div>');
assert.doesNotMatch(desktopDefaultDataActions, /settings\.exportDiagnostics/, "Desktop diagnostics export must not sit beside ordinary backup actions");
assert.match(desktopSettingsSurfaceSource, /settings-section-nav/, "Desktop settings must provide quick navigation instead of one undifferentiated long page");
assert.match(desktopI18nSource, /"settings\.clearLocalDataConfirmMessage"/, "Desktop clear-this-device confirmation must use a full risk explanation");
assert.match(desktopSettingsSurfaceSource, /message:\s*settingsStore\.t\("settings\.clearLocalDataConfirmMessage"\)/, "Desktop clear-this-device dialog must not use the button label as the confirmation body");
assert.doesNotMatch(
  desktopDataSession.replace(desktopDiagnosticsSection, ""),
  /settings\.deviceId/,
  "Desktop settings must not expose the raw device id in the default data section",
);
assert.match(desktopDiagnosticsSection, /settings\.deviceId/, "Desktop settings may show the device id only inside diagnostics");
const desktopTaskMenu = sourceBetween(desktopTaskItemSource, '<div class="task-menu-panel">', '</div>');
assert.doesNotMatch(desktopTaskMenu, /sync\.useCloud|sync\.overwriteCloud/, "Desktop conflict actions must not be duplicated inside the More menu");
const desktopTaskPrimaryActions = sourceBetween(desktopTaskItemSource, '<div class="task-actions">', '<details v-if="!trash" class="task-menu">');
assert.doesNotMatch(desktopTaskPrimaryActions, /task\.editAction|task\.edit"\)/, "Desktop task rows must keep edit out of the primary inline action path");
assert.match(desktopTaskMenu, /task\.editAction/, "Desktop task rows must keep edit available inside the More menu");
const desktopTaskEditorBodyFields = sourceBetween(desktopTaskEditorSource, '<section v-if="bodyOpen" id="task-editor-body-fields" class="task-body-fields">', '</section>');
const desktopTaskEditorArrangementFields = sourceBetween(desktopTaskEditorSource, '<section v-if="arrangeOpen" id="task-editor-arrangement-fields" class="advanced-fields task-arrangement-fields">', '</section>');
const desktopTaskEditorAdvancedFields = sourceBetween(desktopTaskEditorSource, '<section v-if="detailsOpen" id="task-editor-more-fields" class="advanced-fields">', '</section>');
const desktopTaskEditorPrimaryFields = sourceBetween(desktopTaskEditorSource, 'settingsStore.t("task.autoFillHint")', 'settingsStore.t("task.bodyDetails")');
assert.doesNotMatch(desktopTaskEditorPrimaryFields, /task\.content|task\.checklist|task\.plan|task\.due|task\.reminder|task\.priority|task\.list/, "Desktop task editor default path should keep optional notes, checklist, scheduling, and priority behind disclosures");
assert.match(desktopTaskEditorBodyFields, /task\.content[\s\S]*task\.checklist/, "Desktop optional body section must keep notes and checklist available");
assert.match(desktopTaskEditorArrangementFields, /task\.list[\s\S]*task\.plan[\s\S]*task\.due[\s\S]*task\.reminder[\s\S]*task\.priority/, "Desktop arrangement section must keep scheduling, list, and priority available after the quick-capture fields");
assert.doesNotMatch(desktopTaskEditorAdvancedFields, /task\.checklist|task\.list|task\.plan|task\.due|task\.reminder|task\.priority/, "Desktop More settings should not mix notes, checklist, or scheduling fields with secondary metadata");
assertOrder(
  desktopTaskEditorSource,
  'settingsStore.t("task.bodyDetails")',
  'settingsStore.t("task.arrangementSettings")',
  "Desktop task editor must offer notes/checklist before optional scheduling settings",
);
assert.match(desktopTaskViewSource, /primaryFilterOptions/, "Desktop task list must keep common filters in a short primary strip");
assert.match(desktopTaskViewSource, /secondaryFilterOptions/, "Desktop task list must move uncommon filters into a secondary selector");
assert.match(desktopTaskViewSource, /filter-advanced-details/, "Desktop project and tag filters must be hidden behind an advanced filter disclosure");
const desktopFilterToolbar = sourceBetween(desktopTaskViewSource, '<div class="filter-toolbar">', '<div v-if="hasActiveFilters"');
assert.doesNotMatch(desktopFilterToolbar.replace(/<details class="filter-advanced-details"[\s\S]*?<\/details>/, ""), /selectedProject|selectedTag/, "Desktop project and tag selectors must not sit in the default filter toolbar");
assert.match(desktopI18nSource, /"task\.projectTagFilters"/, "Desktop project/tag advanced filter must have a distinct label instead of repeating More filters");
assert.match(desktopFilterToolbar, /settingsStore\.t\("task\.projectTagFilters"\)/, "Desktop project/tag advanced filter disclosure must avoid duplicating the secondary More filters label");
assert.match(desktopTaskViewSource, /TaskListSection/, "Desktop task list sections must use one focused component instead of repeating TaskItem event wiring");
assert.match(desktopTaskViewSource, /:aria-label="settingsStore\.t\('task\.search'\)"/, "Desktop task search input must have an accessible name");
assert.match(desktopTaskViewSource, /:aria-pressed="filter === option\.value"/, "Desktop primary task filters must expose their pressed state");
assert.match(desktopTaskViewSource, /:aria-label="settingsStore\.t\('task\.allProjects'\)"/, "Desktop project filter select must have an accessible name");
assert.match(desktopTaskViewSource, /:aria-label="settingsStore\.t\('task\.allTags'\)"/, "Desktop tag filter select must have an accessible name");
const desktopPrimaryFilters = sourceBetween(desktopTaskViewSource, "const primaryFilterOptions", "const secondaryFilterOptions");
assert.doesNotMatch(desktopPrimaryFilters, /pending|conflict|templates|trash|week|high|inbox/, "Desktop primary filters must avoid overwhelming users with rare modes");
assert.match(desktopTaskViewSource, /canCreateIntoCurrentEmptyView/, "Desktop empty task state must know whether a new task will remain visible in the current filters");
assert.match(desktopTaskViewSource, /createVisibleEmptyFilters = new Set<TaskFilter>\(\["all", "inbox", "today"\]\)/, "Desktop Today empty state must offer direct Today task creation");
assert.match(desktopTaskViewSource, /function handleEmptyStateAction\(/, "Desktop empty task state must route filtered empty views to a clear-filter action");
assert.match(desktopTaskViewSource, /function resetTaskFilters\(/, "Desktop empty filtered-view action must reset list, project, tag, and search filters");
assert.match(desktopTaskViewSource, /editorCreatePreset/, "Desktop task list must derive a create preset from the active filter");
assert.match(desktopTaskViewSource, /filter\.value === "today" \? "today" : "default"/, "Desktop Today filter must open the editor with a Today create preset");
assert.match(desktopTaskViewSource, /:create-preset="editorCreatePreset"/, "Desktop task editor must receive the current-view create preset");
assert.match(desktopTaskViewSource, /bulkActionTargets/, "Desktop task list must expose current-view batch actions for dense lists");
assert.match(desktopTaskViewSource, /async function completeVisibleTasks\(/, "Desktop task list must support completing visible open tasks in one action");
assert.match(desktopTaskViewSource, /task\.completeVisibleConfirm/, "Desktop visible-task completion must ask for confirmation before batch changes");
assert.match(desktopTaskViewSource, /async function completeVisibleTasks\([\s\S]{0,420}requestConfirmation/, "Desktop visible-task completion must confirm before completing any selected batch");
assert.doesNotMatch(desktopTaskViewSource, /count > 5[\s\S]{0,320}requestConfirmation/, "Desktop visible-task completion must not skip confirmation for small selected batches");
assert.match(desktopTaskViewSource, /taskStore\.batchComplete\(bulkActionTargets\.value\)/, "Desktop visible-task completion must use the existing batch completion store API");
assert.match(desktopTaskViewSource, /async function deleteVisibleTasks\(/, "Desktop task list must support deleting visible open tasks in one action");
assert.match(desktopTaskViewSource, /taskStore\.batchDelete\(bulkActionTargets\.value\)/, "Desktop visible-task deletion must use the existing batch delete store API");
assert.match(desktopTaskViewSource, /settingsStore\.t\("task\.completeVisible"\)/, "Desktop visible-task completion must use localized button copy");
assert.match(desktopTaskViewSource, /settingsStore\.t\("task\.deleteVisible"\)/, "Desktop visible-task deletion must use localized button copy");
assert.match(desktopI18nSource, /"task\.completeVisibleConfirm"/, "Desktop i18n must include visible-task completion confirmation copy");
assert.match(desktopTaskEditorSource, /createPreset\?: "default" \| "today"/, "Desktop task editor must accept contextual create presets");
assert.match(desktopI18nSource, /"task\.list": \{ "zh-CN": "归类", "en-US": "Location" \}/, "Desktop task list-type field must be labeled as task location/category instead of checklist copy");
assert.match(desktopTaskStoreSource, /listType:\s*draft\.listType \|\| "inbox"/, "Desktop quick add must not silently move every planned task into the Today list");
assert.doesNotMatch(
  desktopTaskStoreSource,
  /listType:\s*draft\.listType \|\| \(plannedDate \? "today" : "inbox"\)/,
  "Desktop quick add with a future planned date must remain in Inbox unless the user explicitly picks Today",
);
assert.match(
  desktopTaskEditorSource,
  /props\.createPreset === "today"[\s\S]{0,260}form\.listType = "today"[\s\S]{0,260}form\.plannedDate = todayDateInputValue\(\)/,
  "Desktop Today create preset must prefill tasks so they remain visible after creation",
);
assert.match(desktopTodayViewSource, /:create-preset="editingTask \? 'default' : 'today'"/, "Desktop Today view must show the same Today preset that it saves");
assert.doesNotMatch(
  desktopTodayViewSource,
  /listType:\s*"today"[\s\S]{0,160}plannedDate:\s*draft\.plannedDate \|\| todayLocalDate/,
  "Desktop Today view must not override the editor's visible list/date choices during save",
);
assert.match(desktopI18nSource, /"task\.showAllTasks"/, "Desktop i18n must include a clear-filter empty-state action label");
assert.match(desktopTaskItemSource, /:aria-label="isCompletedStatus\(task\.status\) \? settingsStore\.t\('task\.restore'\) : settingsStore\.t\('task\.complete'\)"/, "Desktop completion checkbox button must expose a real accessible label");
assert.match(desktopAppSidebarSource, /aria-current/, "Desktop side navigation must expose the current page to assistive technology");
assert.match(desktopFloatingHeaderSource, /:aria-label="settingsStore\.t\('floating\.openMain'\)"/, "Desktop floating open-main control must not rely on title alone");
assert.match(desktopFloatingHeaderSource, /:aria-label="settingsStore\.t\('floating\.hide'\)"/, "Desktop floating hide control must not rely on title alone");
assert.match(desktopFloatingHeaderSource, /:aria-label="settingsStore\.t\('floating\.tools'\)"/, "Desktop floating tools control must not rely on title alone");
assert.match(desktopFloatingHeaderSource, /:aria-label="settingsStore\.t\('floating\.opacity'\)"/, "Desktop floating opacity slider must expose an accessible name");
assert.match(desktopTaskViewSource, /IMPORTANT_NOTICE_MS/, "Desktop important task feedback must stay visible longer than a short toast");
assert.match(desktopTaskViewSource, /showNotice[\s\S]{0,180}IMPORTANT_NOTICE_MS/, "Desktop destructive or sync-risk actions must use the longer feedback duration");
assert.match(desktopCssSource, /\.form-message-success/, "Desktop styles must include a success message state");
assert.match(desktopCssSource, /\.form-message-error/, "Desktop styles must include an error message state");
assert.match(desktopCssSource, /\.form-message-info/, "Desktop styles must include a neutral information message state");
assert.match(desktopMainSource, /minWidth:\s*760/, "Desktop native window minimum width must allow a narrower app window");
assert.match(desktopCssSource, /\.app-shell[\s\S]{0,160}min-width:\s*720px/, "Desktop shell must allow a narrower app window");
assert.doesNotMatch(desktopCssSource, /@media \(max-width: 960px\)[\s\S]{0,180}min-width:\s*760px/, "Desktop narrow layout must not force horizontal overflow at 760px");
assert.match(desktopCssSource, /@media \(max-width: 820px\)[\s\S]*grid-template-columns:\s*1fr/, "Desktop narrow layout must collapse to one column before it overflows");
assert.match(desktopCssSource, /prefers-reduced-motion:\s*reduce/, "Desktop styles must honor reduced-motion preferences");
assert.match(webStylesSource, /prefers-reduced-motion:\s*reduce/, "Web styles must honor reduced-motion preferences");
const desktopThemedCss = sourceBetween(desktopCssSource, "\nbody,\n.login-shell", "\n@media (max-width: 960px)");
assert.doesNotMatch(desktopThemedCss, /background:\s*#ffffff\b/, "Desktop tokenized theme layer must not fall back to hard-coded white backgrounds");
assert.match(desktopSettingsSource, /SettingsAccountDisplayPanel/, "Desktop settings account/display section must be extracted into a focused component");
assert.match(desktopSettingsSource, /SettingsConnectionPanel/, "Desktop settings connection section must be extracted into a focused component");
assert.match(desktopSettingsSource, /SettingsDataSessionPanel/, "Desktop settings data/session section must be extracted into a focused component");
assert.match(desktopSettingsSource, /SettingsMetadataPanel/, "Desktop settings metadata section must be extracted into a focused component");
assert.match(desktopSettingsMetadataPanelSource, /<details class="settings-advanced-details settings-metadata-details"[^>]*>/, "Desktop project/tag maintenance must be collapsed by default as an advanced setting");
const desktopFloatingOpacityBase = sourceBetween(desktopCssSource, "\n.floating-opacity {\n", "\n}\n\n.floating-opacity input");
assert.doesNotMatch(desktopFloatingOpacityBase, /display:\s*grid/, "Desktop floating opacity slider must not take a permanent row in the compact window");
assert.match(desktopCssSource, /\.floating-tools/, "Desktop floating opacity control must move behind a compact tools menu");
assert.match(desktopFloatingHeaderSource, /<details class="floating-tools"/, "Desktop floating opacity control must live in a compact tools menu");
assert.doesNotMatch(desktopFloatingHeaderSource, />\s*(?:↗|−)\s*</, "Desktop floating window controls must not use ambiguous text symbols");

assert.match(androidTokenDataStoreSource, /val currentUserId: Flow<String\?>/, "Android must expose the current user id to repositories");
assert.match(androidTaskEntitySource, /val ownerUserId: String/, "Android tasks must store the owning user id");
assert.match(androidQueueEntitySource, /val ownerUserId: String/, "Android sync queue entries must store the owning user id");
assert.match(androidDatabaseSource, /APP_DATABASE_VERSION = 7/, "Android Room schema version must include workspace isolation");
assert.match(androidDatabaseSource, /MIGRATION_4_5/, "Android must migrate local tables to owner-aware storage");
assert.match(androidDatabaseSource, /MIGRATION_5_6/, "Android must migrate local tasks to store conflict snapshots");
assert.match(androidDatabaseSource, /MIGRATION_6_7/, "Android must migrate local tasks and queue entries into workspace-aware storage");
assert.match(androidTaskEntitySource, /val conflictServerJson: String\?/, "Android tasks must store the cloud conflict snapshot");
assert.match(androidTaskEntitySource, /val conflictLocalJson: String\?/, "Android tasks must store the local conflict snapshot");
assert.match(androidDaoSource, /workspaceId = :workspaceId/, "Android DAO queries must filter by active server-and-user workspace");
assert.ok((androidDaoSource.match(/OR listType = 'today'/g) || []).length >= 2, "Android today list and widget queries must include tasks explicitly placed in the today list");
assert.match(androidTaskRepositorySource, /private val tokenDataStore: TokenDataStore/, "Android TaskRepository must receive TokenDataStore for owner lookup");
assert.match(androidTaskRepositorySource, /activeWorkspace\(\)/, "Android TaskRepository writes must stamp the active workspace identity");
assert.match(androidTaskRepositorySource, /parseConflictServerTask/, "Android cloud conflict resolution must restore the captured cloud snapshot");
assert.match(androidSyncRepositorySource, /activeWorkspace\(\)/, "Android SyncRepository must sync only the active server-and-user workspace");
assert.match(androidSyncRepositorySource, /conflictLocalJson/, "Android sync conflicts must preserve the local snapshot");
assert.match(androidSyncRepositorySource, /conflictServerJson/, "Android sync conflicts must preserve the cloud snapshot");
assert.match(androidAppContainerSource, /TaskRepository\([\s\S]*apiService[\s\S]*tokenDataStore/, "Android AppContainer must inject ApiService and TokenDataStore into TaskRepository");

for (const [name, source] of [
  ["Android login", androidLoginSource],
  ["Android register", androidRegisterSource],
  ["Android settings", androidSettingsSource],
]) {
  assert.match(source, /advancedConnectionOpen/, `${name} must hide API and WebSocket fields behind an advanced toggle`);
  assert.match(source, /if \(advancedConnectionOpen\)/, `${name} must render advanced endpoints conditionally`);
  assert.match(source, /strings\.saveAndTestConnection|Test connection|检查连接|checkAndSaveConnection/, `${name} must expose one connection check action`);
}
assert.doesNotMatch(androidLoginSource, /connectionSettingsOpen/, "Android login must show the server URL directly instead of hiding it behind connection settings");
assert.doesNotMatch(androidRegisterSource, /connectionSettingsOpen/, "Android registration must show the server URL directly instead of hiding it behind connection settings");

assert.match(webHtmlSource, /id="taskAdvancedFields"/, "Web task form must hide secondary task fields behind an advanced section");
assert.match(webHtmlSource, /id="taskQuickPreview"/, "Web task form must preview parsed quick-add metadata");
assert.match(webHtmlSource, /id="taskRemindTime"/, "Web task form must allow editing reminders");
assert.match(webHtmlSource, /id="taskRepeatRule"/, "Web task form must allow editing repeat rules with user-facing labels");
assert.match(webHtmlSource, /id="taskChecklist"/, "Web task form must allow editing checklist steps");
assert.match(webHtmlSource, /id="taskChecklistItems"/, "Web task form must expose checklist items as direct controls");
assertOrder(
  webHtmlSource,
  'id="taskContent"',
  'id="taskAdvancedFields"',
  "Web task form should show content before optional advanced task details",
);
const webQuickTaskFields = sourceBetween(webHtmlSource, '<div class="task-quick-fields', '<p class="field-help');
for (const id of ["taskPriority", "taskListType", "taskPlannedDate", "taskDueTime", "taskRemindTime"]) {
  assert.match(webQuickTaskFields, new RegExp(`id="${id}"`), `Web optional scheduling fields must include ${id}`);
}
assert.match(webHtmlSource, /id="moreViewSelect"/, "Web task views must expose a more-filters select instead of rendering every filter as a top-level button");
assert.match(webAppSource, /const PRIMARY_VIEW_OPTIONS = /, "Web task views must separate primary filters from advanced filters");
assert.match(webAppSource, /const MORE_VIEW_OPTIONS = /, "Web task views must keep rare filters behind a more-filters control");
assert.match(webAppSource, /renderMoreViewSelect/, "Web task view rendering must update the more-filters control");
assert.match(webAppSource, /"view\.moreFilters"/, "Web i18n must include a more-filters label");
assert.doesNotMatch(
  webAppSource,
  /const VIEW_OPTIONS = \[[\s\S]*?value: "pending"[\s\S]*?value: "conflict"[\s\S]*?value: "trash"/,
  "Web task views must not render every rare filter as a primary option",
);
assert.match(webAppSource, /function renderTaskChecklistItems\(/, "Web checklist items must render as interactive controls, not only textarea text");
assert.match(webAppSource, /toggleChecklistDraftItem/, "Web users must be able to toggle checklist items while editing");
assert.match(webAppSource, /deleteChecklistDraftItem/, "Web users must be able to remove checklist items while editing");
assert.match(webHtmlSource, /id="taskIsTemplate"/, "Web task form must allow saving a task as a template");
assert.match(webHtmlSource, /id="taskTemplateName"/, "Web task form must allow naming a template");
assert.match(webHtmlSource, /id="serverLocalhostHint"/, "Web connection form must warn when localhost is likely the wrong address");
assert.doesNotMatch(webHtmlSource, /id="localTrialGuide"/, "Web first-use flow must not add a nested local-trial disclosure to the login screen");
assert.match(webHtmlSource, /href="\.\/local-trial\.html"/, "Web local trial guide must link to a same-origin startup guide inside the served web root");
assert.match(webLocalTrialGuideSource, /docker compose -f docker-compose\.release\.yml up -d/, "Web local trial guide page must show the backend startup command");
assert.match(webHtmlSource, /data-i18n="task\.list">归类<\/span>/, "Web list-type label fallback must match the current Location wording");
assert.doesNotMatch(webHtmlSource, /data-i18n="task\.list">清单<\/span>/, "Web list-type label fallback must not show the old checklist wording before i18n hydrates");
assert.match(webAppSource, /"confirm\.clearDraft": "清空当前任务草稿吗？标题、备注、清单和时间都会被清除。"/, "Web clear-draft confirmation must use the current task editor terminology");
assert.doesNotMatch(webAppSource, /"confirm\.clearDraft": "[^"]*步骤/, "Web clear-draft confirmation must not use the old steps wording");
assert.match(
  webSelfHostingGuideSource,
  /docker compose -f docker-compose\.release\.yml exec api python -m tools\.create_user --username owner --email owner@example\.com/,
  "Web self-hosting guide must use a first-account command that works in Windows PowerShell and POSIX shells",
);
assert.doesNotMatch(webSelfHostingGuideSource, /FIRST_SUPERUSER_USERNAME/, "Web self-hosting guide must not imply an ignored env var creates the first account");
assert.match(
  webSelfHostingGuideSource,
  /DATABASE_URL=mysql\+pymysql:\/\/taskbridge:replace-with-a-strong-password@mysql:3306\/taskbridge/,
  "Web self-hosting guide must keep DATABASE_URL password aligned with MYSQL_PASSWORD",
);
assert.doesNotMatch(
  webSelfHostingGuideSource,
  /exec api\s*\\\s*\n\s*python -m tools\.create_user/,
  "Web self-hosting guide must not rely on Unix backslash continuation for the first-account command",
);
assert.match(webLocalTrialGuideSource, /macOS \/ Linux|Windows PowerShell/, "Web local trial guide must label platform-specific command blocks");
assert.match(
  webLocalTrialGuideSource,
  /源码\/部署包|source or deployment package/,
  "Web local trial guide must start from downloaded source or a deployment package, not a Git-only path",
);
assert.doesNotMatch(
  webLocalTrialGuideSource,
  /git clone/,
  "Web local trial guide must not require installed users to clone the repository before understanding the path",
);
const webLocalTrialEnglishGuide = sourceBetween(webLocalTrialGuideSource, '<section lang="en">', "</section>");
for (const token of [
  "source or deployment package",
  "cd TaskBridge\\deploy",
  "Copy-Item .env.local.example .env",
  "docker compose -f docker-compose.release.yml up -d",
  "curl http://127.0.0.1:8000/ready",
]) {
  assert.match(webLocalTrialEnglishGuide, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Web local trial English guide must include ${token}`);
}
const webSelfHostingEnglishGuide = sourceBetween(webSelfHostingGuideSource, '<section lang="en">', "</section>");
for (const token of [
  "Copy-Item .env.example .env",
  "DATABASE_URL=mysql+pymysql://taskbridge:replace-with-a-strong-password@mysql:3306/taskbridge",
  "WEB_CORS_ORIGINS=https://taskbridge.example.com",
  "docker compose -f docker-compose.release.yml exec api python -m tools.create_user --username owner --email owner@example.com",
]) {
  assert.match(webSelfHostingEnglishGuide, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Web self-hosting English guide must include ${token}`);
}
assert.doesNotMatch(webHtmlSource, /href="\.\.\/deploy\/README\.md/, "Web local trial guide must not link outside the served web root");
assert.match(webSwSource, /\.\/local-trial\.html/, "Web service worker must cache the same-origin local trial guide");
assert.match(webAppSource, /"auth\.openLocalTrialGuide"/, "Web i18n must include the same-origin local-trial guide link label");
assert.match(webAppSource, /function getEmptyTaskStateAction\(/, "Web empty task state must choose an action based on the active filter");
assert.match(webAppSource, /"task\.emptyFilteredHint"/, "Web empty filtered views must tell users to clear the filter instead of implying a new task will appear there");
assert.match(webAppSource, /"task\.clearFilter"/, "Web empty filtered views must expose a clear-filter action");
assert.match(
  webAppSource,
  /state\.view = ""[\s\S]{0,160}persistTaskListPreferences\(\)[\s\S]{0,120}refreshTasks\(\)/,
  "Web empty filtered-view action must reset to all tasks and refresh the list",
);
assert.match(webAppSource, /function applyTaskCreatePresetForCurrentView\(/, "Web task form must apply a create preset from the active view");
assert.match(
  webAppSource,
  /if \(state\.view === "today"\)[\s\S]{0,260}nodes\.taskListType\.value = "today"[\s\S]{0,260}nodes\.taskPlannedDate\.value = getTodayDateInputValue\(\)/,
  "Web Today view must prefill new tasks so they remain visible after creation",
);
assert.match(
  webAppSource,
  /function resetTaskForm\(\)[\s\S]{0,180}resetAccountScopedTaskForm\(\)/,
  "Web task form reset must delegate to the account-scoped form reset",
);
assert.match(
  webAppSource,
  /function resetAccountScopedTaskForm\(\)[\s\S]{0,420}applyTaskCreatePresetForCurrentView\(\)/,
  "Web task form reset must restore the current-view create preset",
);
assert.match(webAppSource, /"app\.localDataUnavailable"/, "Web local data failures must have a friendly localized storage error");
assert.match(webAppSource, /function isLocalStorageOperationError\(/, "Web local data errors must detect storage-layer failures before showing a message");
assert.doesNotMatch(
  webAppSource,
  /return error instanceof Error && error\.message \? error\.message : normalizeError\(error\);/,
  "Web local data operations must not surface raw IndexedDB or storage error messages",
);
assert.match(deployReadmeSource, /cp \.env\.local\.example \.env/, "Deploy docs must include macOS/Linux local-trial startup commands");
assert.match(deployReadmeSource, /Copy-Item \.env\.local\.example \.env/, "Deploy docs must include Windows local-trial startup commands");
assert.doesNotMatch(
  deployReadmeSource,
  /docker compose -f docker-compose\.release\.yml exec api\s*\\\s*\n\s*python -m tools\.create_user/,
  "Deploy docs first-account command must not rely on Unix backslash continuation",
);
assert.match(deployReadmeSource, /METRICS_TOKEN/, "Deploy docs production required settings must include METRICS_TOKEN when metrics are enabled");
const deployProductionRequiredSettings = sourceBetween(deployReadmeSource, "生产环境至少要修改：", "如果 `ENVIRONMENT=production`");
assert.match(deployProductionRequiredSettings, /METRICS_TOKEN/, "Deploy production required settings list must explicitly include METRICS_TOKEN");
assert.match(webHtmlSource, /<h1[^>]*data-i18n="auth\.title"[^>]*>登录 TaskBridge<\/h1>/, "Web first screen heading should lead with the product sign-in goal");
assert.match(webHtmlSource, /id="connectionBadge"[^>]*>等待登录</, "Web initial connection badge must not make the signed-out state look like a server failure");
assert.doesNotMatch(webHtmlSource, /id="connectionBadge"[^>]*>服务器未连接</, "Web initial connection badge must avoid server-error wording before the user signs in");
assert.match(webAppSource, /"connection\.awaitingLogin": "等待登录"/, "Web online unauthenticated state must not look like a server error");
assert.match(webHtmlSource, /id="installAppButton"/, "Web must expose a PWA install action");
assert.match(webHtmlSource, /id="installHelpPanel"/, "Web install guidance must have a persistent help panel");
assert.match(
  webHtmlSource,
  /id="installAppButton"[^>]*hidden/,
  "Web install guidance must stay hidden on the sign-in screen so the first task remains server address and login",
);
assert.match(
  webHtmlSource,
  new RegExp(`<script type="module" src="\\.\\/app\\.js\\?v=${webVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"><\\/script>`),
  "Web must version the app module so users do not keep stale interaction code",
);
assert.match(webSwSource, /CACHE_NAME\s*=\s*`taskbridge-web-shell-v\$\{WEB_VERSION\}`/, "Web service worker cache must be bumped when shell behavior changes");
assert.match(webSwSource, /`\.\/app\.js\?v=\$\{WEB_VERSION\}`/, "Web service worker must cache the same versioned app module as index.html");
assert.match(webHtmlSource, /data-i18n="auth\.checkConnection"/, "Web login must expose a secondary connection-check troubleshooting action");
assert.match(webHtmlSource, /data-i18n="auth\.loginAutoChecksConnection"/, "Web login must explain that submit automatically checks the connection");
assert.match(webHtmlSource, /id="syncStatusButton"[^>]*>同步状态/, "Web topbar action must describe saved-server sync status instead of another connection check");
assert.match(
  webHtmlSource,
  /id="syncStatusButton"[^>]*\bhidden\b[^>]*>同步状态/,
  "Web sync status action must start hidden before sign-in so the first screen stays focused on connection and login",
);
assert.match(
  webAppSource,
  /nodes\.syncStatusButton\.hidden\s*=\s*!hasSession\(\)/,
  "Web sync status action must stay hidden until an authenticated session can make it useful",
);
assert.doesNotMatch(webHtmlSource, /id="syncStatusButton"[^>]*>检查连接/, "Web topbar action must not duplicate the login form's save-and-check connection action");
assert.match(
  webAppSource,
  /const choice = await promptEvent\.userChoice[\s\S]{0,260}choice\?\.outcome !== "accepted"[\s\S]{0,120}showInstallHelp\(\)/,
  "Web PWA install flow must show browser-specific instructions when the native install prompt is dismissed or unavailable",
);
assert.match(webLocalTrialGuideSource, /Web\/PWA[\s\S]*127\.0\.0\.1:8080[\s\S]*Android 真机[\s\S]*局域网 IP/, "Web local trial guide page must distinguish the Web gateway from direct client addresses");
assertOrder(
  webHtmlSource,
  'id="authSubmitButton"',
  'id="testConnectionButton"',
  "Web login should keep sign-in as the first primary action and connection testing secondary",
);
assert.match(webHtmlSource, /id="authSubmitButton" type="submit" class="primary-button"/, "Web sign-in must be the primary first-use action");
assert.match(webHtmlSource, /id="testConnectionButton" type="button" class="secondary-button"/, "Web connection testing must be secondary on first use");
assert.doesNotMatch(webHtmlSource, /id="savePreferencesButton"/, "Web login must not show a separate remember-server button");
assert.match(webHtmlSource, /<title>TaskBridge<\/title>/, "Web browser title must use the product name, not a client module name");
assert.doesNotMatch(webHtmlSource, /TaskBridge Web|浏览器端/, "Web top-level branding must not expose the client type as product copy");
assert.match(webHtmlSource, /选择使用方式/, "Web sign-in must keep optional first-use guidance available after the primary form");
assert.match(webHtmlSource, /高级连接设置/, "Web API and device fields must be framed as advanced connection settings");
assert.match(webHtmlSource, /id="developerDiagnostics"/, "Web account sidebar must hide API and device identifiers behind diagnostics");
assert.match(webHtmlSource, /id="deviceId"[\s\S]{0,160}readonly/, "Web device id must be read-only by default");
assert.match(webHtmlSource, /id="regenerateDeviceIdButton"/, "Web must provide an explicit device-id regeneration action");
assert.doesNotMatch(webHtmlSource, /<label class="field">[\s\S]{0,220}id="deviceId"[\s\S]{0,220}id="regenerateDeviceIdButton"[\s\S]{0,80}<\/label>/, "Web device-id field must not nest a button inside a label");
assert.doesNotMatch(webHtmlSource, /<dt>API<\/dt>|<dt>设备<\/dt>|<h2>后端<\/h2>/, "Web sidebar must not expose API, device, or backend internals by default");
assert.match(webAppSource, /view:\s*"today"/, "Web must default new users into Today to match desktop and Android");
assert.match(webAppSource, /readStoredString\("taskView", "today"\)/, "Web task-list preferences must fall back to Today only when no saved view exists");
assert.match(webAppSource, /writeStoredString\("taskView", state\.view \|\| "all"\)/, "Web must still preserve an explicit All-tasks view preference");
assert.match(webAppSource, /logoutPendingWarning/, "Web logout must warn before leaving with unsynced work");
assert.match(webAppSource, /registrationStatusKnown/, "Web registration UI must know whether the server registration status has been checked");
assert.match(webAppSource, /registrationStatusRequiresConnectionCheck/, "Web file URL registration must require a connection check before showing register");
assert.doesNotMatch(webAppSource, /catch\s*\{\s*state\.registrationEnabled = true;\s*\}/, "Web registration status failures must not optimistically enable registration");
assert.doesNotMatch(webAppSource, /button\.hidden = !registerAvailable/, "Web registration tab must stay visible with a disabled state instead of disappearing");
assert.match(webAppSource, /const registrationBlocked = state\.registrationStatusKnown && !state\.registrationEnabled/, "Web registration tab should only be disabled after the server confirms registration is closed");
assert.match(webAppSource, /button\.disabled = registrationBlocked/, "Web registration tab must remain actionable while availability is unknown and only disable after the server closes registration");
assert.match(webAppSource, /button\.setAttribute\("aria-disabled", String\(registrationBlocked\)\)/, "Web registration tab must expose the confirmed disabled state to assistive technology");
assert.doesNotMatch(webAppSource, /return online \? "网络在线" : "离线可用"/, "Web connection badge must not equate browser connectivity with server connectivity");
assert.match(webAppSource, /function getConnectionBadgeState\(/, "Web connection badge must derive a server-aware status");
assert.match(webAppSource, /hasSession\(\) \? t\("connection\.unchecked"\) : t\("connection\.awaitingLogin"\)/, "Web connection badge must show a neutral waiting state before sign-in");
assert.match(webAppSource, /服务器未连接|未连接服务器/, "Web connection badge must name the disconnected server state");
assert.match(webAppSource, /"connection\.disconnected"/, "Web connection badge must localize disconnected server copy");
assert.match(webAppSource, /"connection\.pendingSync"/, "Web connection badge must localize pending-sync copy");
assert.match(
  webAppSource,
  /getConnectionBadgeState\(\)[\s\S]{0,900}t\("connection\./,
  "Web connection badge state must use selected-language labels",
);
assert.match(
  webAppSource,
  /formatMessage\("connection\.pendingSync"/,
  "Web connection badge pending-sync suffix must follow the selected language",
);
assert.match(webAppSource, /getInstallHelpMessage/, "Web install guidance must choose browser-specific instructions");
assert.doesNotMatch(webAppSource, /toast\("可通过浏览器菜单安装到桌面或主屏幕。"\)/, "Web install fallback must not rely on a short generic toast");
const webRenderInstallButtonSource = sourceBetween(webAppSource, "function renderInstallButton()", "async function installApp()");
assert.match(webRenderInstallButtonSource, /const workspaceActive = hasLocalWorkspace\(\)/, "Web install guidance visibility must depend on an active online or offline workspace");
assert.match(webRenderInstallButtonSource, /nodes\.installAppButton\.hidden = !workspaceActive/, "Web install guidance must stay out of the unauthenticated first screen");
assert.match(webHtmlSource, /id="clientErrorDiagnosticsNotice"/, "Web diagnostics must explain automatic client error reporting to users");
assert.match(webAppSource, /function sanitizeClientErrorUrl\(/, "Web client error reporting must sanitize page URLs before upload");
assert.doesNotMatch(webAppSource, /url:\s*location\.href/, "Web client error reporting must not upload the full URL with query or hash");
assert.match(securityDocSource, /脱敏后的错误堆栈/, "Security docs must disclose that logged-in Web error reports include sanitized stack traces");
assert.match(securityDocSource, /浏览器类型|user agent/i, "Security docs must disclose the browser user-agent field in client error reports");
assert.match(securityDocSource, /查询参数|hash|令牌|token/i, "Security docs must document URL and token sanitization for client error reports");
assert.doesNotMatch(webAppSource, /getSyncHealthDetailLabel\("database"\)|getSyncHealthDetailLabel\("redis"\)|getSyncHealthDetailLabel\("websocket"\)/, "Web default sync details must not expose backend component names to ordinary users");
assert.doesNotMatch(webAppSource, /case "database":|case "redis":|case "websocket":/, "Web sync detail labels must avoid database/cache/WebSocket internals in ordinary status copy");
assert.match(webAppSource, /function confirmResetTaskDraft\(/, "Web task reset must route through a draft reset confirmation helper");
assert.match(webAppSource, /function confirmResetCurrentTaskForm\([\s\S]{0,500}confirmUserAction\(/, "Web task reset must confirm before clearing a non-empty draft");
assert.match(webAppSource, /等待同步/, "Web sync summaries must use user-facing pending-sync copy");
assert.doesNotMatch(webAppSource, /离线队列/, "Web must not expose offline queue internals in user-facing copy");
assert.match(webAppSource, /registrationDisabledHelp/, "Web registration-disabled copy must tell users what to do next");
assert.match(webAppSource, /function normalizeUserFacingError\(/, "Web must translate common backend errors into user-facing copy");
assert.match(webAppSource, /version conflict/, "Web user-facing error mapping must handle cross-device version conflicts");
assert.match(webAppSource, /unsupported repeat_rule/, "Web user-facing error mapping must handle unsupported repeat rules");
assert.match(webAppSource, /function parseWebQuickTask\(/, "Web task creation must support natural-language quick add");
assert.match(webAppSource, /function renderTaskQuickPreview\(/, "Web task creation must preview natural-language parsing");
assert.match(webAppSource, /parseWebQuickTask\(nodes\.taskTitle\.value/, "Web task payload must derive time, tag and priority from the title");
assert.match(webAppSource, /getLocalizedPriorityLabel\(quickTask\.priority\)/, "Web quick-add preview must reuse selected-language priority labels");
assert.doesNotMatch(webAppSource, /P\$\{quickTask\.priority\}/, "Web quick-add preview must not expose raw P-number priority copy");
assert.match(webHtmlSource, /id="taskTitle"[\s\S]{0,180}data-i18n-placeholder="task\.quickPlaceholder"/, "Web task title must advertise natural-language quick add in the field itself");
assert.doesNotMatch(
  webHtmlSource,
  /id="taskTitle"[\s\S]{0,220}placeholder="[^"]*(?:#|@|P3)/,
  "Web task title placeholder must not make shortcut syntax look required",
);
assert.match(
  webAppSource,
  /"task\.quickPlaceholder": "例如：写周报"/,
  "Web Chinese quick-add placeholder must start with a plain task title",
);
assert.match(
  webAppSource,
  /"task\.quickPlaceholder": "Example: write weekly report"/,
  "Web English quick-add placeholder must start with a plain task title",
);
assert.doesNotMatch(
  webAppSource,
  /"task\.(quickPlaceholder|emptyViewHint|emptyFilteredHint)": "[^"]*(?:#|@|P3)/,
  "Web ordinary task placeholders and empty-state hints must not lead with shortcut syntax",
);
assertOrder(
  webHtmlSource,
  'id="taskContent"',
  'class="task-quick-fields',
  "Web task form must show content before optional scheduling fields",
);
assert.match(webAppSource, /function expandTaskAdvancedFieldsIfNeeded\(/, "Web task editor must expand optional fields when editing or restoring tasks that already use them");
assert.match(webAppSource, /details\.className = "task-action-menu"/, "Web task rows must collapse secondary actions into a More menu");
assert.doesNotMatch(webAppSource, /deleteButton\.textContent = t\("task\.delete"\);\s*actions\.appendChild\(deleteButton\);/, "Web task rows must not expose delete as a primary inline action");
assert.match(webAppSource, /function updateServerLocalhostHint\(/, "Web connection form must update the localhost warning from the current page context");
assert.match(webAppSource, /beforeinstallprompt/, "Web must handle browser PWA install prompts");
assert.match(webAppSource, /installPromptEvent/, "Web must preserve the PWA install prompt until the user clicks install");
assert.match(webAppSource, /function boot\(\)[\s\S]{0,560}canAutoCheckRegistrationStatus\(\)[\s\S]{0,80}loadRegistrationStatus\(\)/, "Web must refresh registration availability during first render only when the page can safely auto-check it");
assert.match(webAppSource, /serverBaseUrl\.addEventListener\("change"[\s\S]{0,390}canAutoCheckRegistrationStatus\(\)[\s\S]{0,80}loadRegistrationStatus\(\)/, "Web must refresh registration availability after changing server URL only when the page can safely auto-check it");
assert.match(webAppSource, /apiBaseUrl\.addEventListener\("change"[\s\S]{0,330}canAutoCheckRegistrationStatus\(\)[\s\S]{0,80}loadRegistrationStatus\(\)/, "Web must refresh registration availability after changing advanced API URL only when the page can safely auto-check it");
assert.match(webAppSource, /function supportsHttpOrigin\(\)[\s\S]{0,120}location\.protocol === "http:"/, "Web must avoid automatic network probes from file:// pages");
assert.match(webAppSource, /function canAutoCheckRegistrationStatus\(\)[\s\S]{0,220}new URL\(state\.apiBaseUrl\)\.origin === location\.origin/, "Web automatic registration probes must be limited to same-origin API pages");
assert.doesNotMatch(webAppSource, /if \(supportsHttpOrigin\(\)\) \{[\s\S]{0,80}loadRegistrationStatus\(\)/, "Web automatic registration probes must not run for every HTTP origin");
assert.match(webAppSource, /installPromptEvent \? t\("install\.installApp"\) : t\("install\.action"\)/, "Web install action must provide a clear fallback instruction state");
assert.match(webAppSource, /function regenerateDeviceId\(/, "Web must regenerate device ids only through an explicit action");
assert.match(webAppSource, /nodes\.authForm\.addEventListener\("click"[\s\S]{0,220}#regenerateDeviceIdButton[\s\S]{0,120}regenerateDeviceId\(\)/, "Web device-id regeneration must stay wired through the stable auth form");
assert.match(webAppSource, /async function regenerateDeviceId\([\s\S]{0,500}confirmUserAction\(/, "Web device-id regeneration must require confirmation");
assert.doesNotMatch(webAppSource, /nodes\.deviceId\.addEventListener\("change"/, "Web must not save arbitrary manual device-id edits");
assert.match(webAppSource, /payload\.password\.length < 8/, "Web registration must validate the 8-character password rule before submitting");
assert.match(webAppSource, /function resolveTaskConflict\(/, "Web must call the backend conflict-resolution endpoint");
assert.match(webHtmlSource, /id="showAdvancedConnectionButton"/, "Web advanced connection settings must be reached through a low-distraction reveal action");
assert.match(deployReadmeSource, /Copy-Item \.env\.local\.example \.env/, "Deploy docs must keep local trial commands for users who need to start a backend");
assert.match(webAppSource, /function revealAdvancedConnectionSettings\(/, "Web must keep a stable hook for opening advanced connection settings after connection trouble");
assert.match(webAppSource, /taskIsTemplate/, "Web task payload must preserve template status");
assert.match(webAppSource, /taskTemplateName/, "Web task payload must preserve template name");
assert.match(webAppSource, /instantiate-template/, "Web task list must expose a use-template action for templates");
assert.match(webAppSource, /function useCloudConflictTask\(/, "Web conflicts must offer a server-version action");
assert.match(webAppSource, /function overwriteCloudConflictTask\(/, "Web conflicts must offer a local-overwrites-server action");
assert.match(webAppSource, /function renderConflictSnapshotSummary\(/, "Web conflicts must show local and server snapshots before users decide");
assert.match(webAppSource, /function buildConflictDetailLabels\(/, "Web conflicts must compare changed task fields before users decide");
assert.match(webAppSource, /function buildConflictDetailRows\(/, "Web conflict details must be modeled as side-by-side rows instead of slash-joined text");
assert.match(webAppSource, /function makeConflictComparisonCard\(/, "Web conflict UI must show each version in a comparison card");
assert.match(webAppSource, /conflict-resolution__comparison/, "Web conflict UI must use a side-by-side comparison layout");
assert.doesNotMatch(
  webAppSource,
  /\$\{compactConflictValue\(localValue\)\} \/ \$\{compactConflictValue\(cloudValue\)\}/,
  "Web conflict details must not expose local/server differences as slash-joined engineering text",
);
assert.match(webAppSource, /conflict-resolution__snapshot/, "Web conflict UI must render snapshot rows near the conflict actions");
assert.match(webAppSource, /这台设备|同步来的版本|This device|Synced version/, "Web conflict UI must name the device and synced versions in user-facing copy");
assert.doesNotMatch(webAppSource, /(采用云端|覆盖云端|云端版本|没有云端版本|cloud version|overwrite cloud)/i, "Web user-facing conflict copy must use server/device wording instead of cloud wording");
assert.match(webAppSource, /deleteOfflineMutationsForTask/, "Web conflict resolution must clear obsolete pending local changes");
assert.doesNotMatch(webAppSource, /pending-sync record|sync queue internals/i, "Web conflict hints must not expose pending-sync record internals");
assert.match(webAppSource, /放弃这条本机修改|放弃本机修改/, "Web conflict hints must use user-facing local-change copy");
assert.doesNotMatch(webAppSource, /return message \|\| "操作失败，请稍后重试"/, "Web generic errors must not fall back to raw error.message");
assert.match(webOfflineCoreSource, /trash: "回收站"/, "Web must keep a visible trash view for deleted tasks");
assert.match(webOfflineCoreSource, /export function buildConflictOverwritePayload\(/, "Web conflict overwrite must use a sanitized payload helper");
assert.match(webOfflineCoreSource, /export function canResolveTaskConflict\(/, "Web conflict actions must be gated to real server tasks");
assert.doesNotMatch(webAppSource, /async function importBackupTasks\([\s\S]{0,280}importBackupTasksOnline\(tasks\)/, "Web backup import should stage tasks locally first so the latest import can be undone");
assert.doesNotMatch(webAppSource, /async function importBackupTasksOffline\([\s\S]{0,420}flushOfflineQueue\(\)/, "Web backup import must not immediately sync away the undo window");
assert.match(webAppSource, /"app\.localBackupImportMessage"[\s\S]{0,180}(最近一次安全导入|most recent safe import)/, "Web backup import confirmation must explain the undo boundary before importing");

assert.match(androidManifestSource, /POST_NOTIFICATIONS/, "Android manifest must declare notification permission");
const androidOnCreateSource = sourceBetween(androidMainActivitySource, "override fun onCreate", "override fun onNewIntent");
assert.doesNotMatch(androidOnCreateSource, /requestNotificationPermissionIfNeeded\(\)/, "Android must not request notification permission on first launch");
assert.match(androidMainActivitySource, /onRequestNotificationPermission/, "Android editor route must pass a deferred notification permission request");
assert.match(androidMainActivitySource, /Manifest\.permission\.POST_NOTIFICATIONS/, "Android runtime request must use POST_NOTIFICATIONS");
assert.match(androidEditorSource, /onRequestNotificationPermission/, "Android editor must request notification permission only when users pick a reminder");
const androidPickDueTimeSource = sourceBetween(androidEditorSource, "fun pickDueTime() {", "fun pickReminder() {");
const androidPickReminderSource = sourceBetween(androidEditorSource, "fun pickReminder() {", "fun requestCancel() {");
assert.doesNotMatch(androidPickDueTimeSource, /onRequestNotificationPermission\(\)/, "Android due-time picker must not request notification permission");
assert.match(androidPickReminderSource, /onRequestNotificationPermission\(\)/, "Android reminder picker must request notification permission before scheduling notifications");
assert.match(androidReminderManagerSource, /checkSelfPermission/, "Android reminders must still guard notification delivery by permission");
assert.match(androidSettingsSource, /connectionNoteIsError/, "Android settings connection feedback must distinguish success from failure");
assert.match(androidUserFacingErrorsSource, /userFacingConnectionErrorMessage/, "Android must centralize user-facing connection failure copy");
assert.match(androidLoginViewModelSource, /connectionFailureMessage\(error\)/, "Android login must store user-facing connection failure detail");
assert.match(androidLoginViewModelSource, /resetGeneratedEndpoints/, "Android login must let users restore generated advanced endpoints");
assert.match(androidRegisterViewModelSource, /connectionFailureMessage\(error\)/, "Android registration must store user-facing connection failure detail");
assert.match(androidRegisterViewModelSource, /resetGeneratedEndpoints/, "Android registration must let users restore generated advanced endpoints");
assert.match(androidSettingsSource, /userFacingConnectionErrorMessage/, "Android settings must use user-facing connection failure copy");
assert.match(androidUserFacingErrorsSource, /invalid api url/, "Android user-facing errors must recognize invalid advanced API URLs");
assert.match(androidUserFacingErrorsSource, /invalid websocket url/, "Android user-facing errors must recognize invalid advanced WebSocket URLs");
assert.match(androidSettingsSource, /resetGeneratedEndpoints/, "Android settings must let users restore generated advanced endpoints");
assert.doesNotMatch(androidLoginViewModelSource, /Connection failed: \$\{error\.message/, "Android login must not expose raw connection errors");
assert.doesNotMatch(androidRegisterViewModelSource, /Connection failed: \$\{error\.message/, "Android registration must not expose raw connection errors");
assert.doesNotMatch(androidSettingsSource, /Connection failed: \$\{error\.message|连接失败：\$\{error\.message/, "Android settings must not expose raw connection errors");
assert.match(androidSettingsSource, /confirmLogoutWithPendingSync/, "Android logout must warn when pending sync work exists");
assert.match(androidTaskRepositorySource, /getConflictTaskCount/, "Android settings must be able to count unresolved conflict tasks before sign-out");
assert.match(androidSettingsSource, /conflictTaskCount/, "Android logout warning must include unresolved conflict tasks");
assert.match(
  androidSettingsSource,
  /recoverableSyncIssueCount > 0 \|\| conflictTaskCount > 0/,
  "Android sign-out must warn when conflicts are still unresolved",
);
assert.match(androidLoginSource, /connectionMessageIsError/, "Android login connection feedback must distinguish success from failure");
assert.match(androidRegisterSource, /connectionMessageIsError/, "Android registration connection feedback must distinguish success from failure");
assert.match(androidLoginViewModelSource, /registrationStatusKnown: Boolean = false/, "Android login must start with an unknown registration status");
assert.match(androidRegisterViewModelSource, /registrationStatusKnown: Boolean = false/, "Android registration must start with an unknown registration status");
assert.doesNotMatch(androidLoginViewModelSource, /registrationEnabled: Boolean = true/, "Android login must not optimistically expose registration before status is known");
assert.doesNotMatch(androidRegisterViewModelSource, /registrationEnabled: Boolean = true/, "Android registration must not optimistically enable registration before status is known");
assert.match(androidLoginSource, /pendingRegisterNavigation/, "Android login should remember the user's create-account intent while checking registration availability");
assert.match(androidLoginSource, /viewModel\.testConnection\(\)[\s\S]{0,260}pendingRegisterNavigation = true|pendingRegisterNavigation = true[\s\S]{0,260}viewModel\.testConnection\(\)/, "Android login create-account action should automatically test the connection when registration status is unknown");
assert.doesNotMatch(androidLoginSource, /state\.registrationStatusKnown && state\.registrationEnabled && registrationAvailability\.showCreateAccountAction/, "Android login must not hide account creation until users manually test the connection");
assert.match(androidRegisterSource, /registrationAvailability\.actionText \?: strings\.createAccount/, "Android registration submit action must explain automatic checking when registration status is unknown");
assert.match(androidRegisterSource, /enabled = registrationAvailability\.canSubmitRegistration/, "Android registration submit action must stay available while registration status can be checked automatically");
assert.doesNotMatch(androidRegisterSource, /enabled = state\.registrationStatusKnown && state\.registrationEnabled && registrationAvailability\.canSubmitRegistration/, "Android registration must not force users to manually check the server before the create-account action can run");
assert.match(androidLoginSource, /registrationAvailability\.actionText/, "Android login registration action must explain automatic checking when registration status is unknown");
assert.match(androidRegistrationAvailabilitySource, /helperText = registrationStatusPendingHelp\(isEnglish\)/, "Android registration availability policy must explain how to check an unknown registration status");
assert.match(androidRegisterSource, /registrationAvailability\.helperText/, "Android registration must render registration availability guidance");
assert.match(androidLoginSource, /registrationDisabledHelp/, "Android login must tell users what to do when registration is closed");
assert.match(androidRegisterSource, /registrationDisabledHelp/, "Android registration must tell users what to do when registration is closed");
assert.match(androidLoginSource, /PasswordTextField\(/, "Android login password field must expose a show/hide control");
assert.match(androidRegisterSource, /PasswordTextField\(/, "Android registration password field must expose a show/hide control");
assert.match(androidI18nSource, /showPassword/, "Android i18n must define show-password copy");
assert.match(androidI18nSource, /hidePassword/, "Android i18n must define hide-password copy");
assert.match(androidRegisterSource, /enabled = registrationAvailability\.canEditAccountFields/, "Android registration account fields must remain editable while registration status is being checked");
assert.doesNotMatch(androidRegisterSource, /enabled = registrationAvailability\.canSubmitRegistration,[\s\S]{0,120}singleLine = true,[\s\S]{0,80}modifier = Modifier\.fillMaxWidth\(\)/, "Android registration account fields must not be locked by submit availability");
const androidRegisterAccountPanelSource = sourceBetween(androidRegisterSource, "label = { Text(strings.username) }", "text = strings.connectionSettings");
assert.match(
  androidRegisterAccountPanelSource,
  /RegistrationConnectionFeedbackNearSubmit\(/,
  "Android registration must surface connection feedback near the create-account action",
);
assert.match(
  androidRegisterSource,
  /strings\.changeServerAddress/,
  "Android registration connection feedback near submit must offer a direct change-server-address action",
);
assertOrder(
  androidRegisterSource,
  "label = { Text(strings.username) }",
  "text = strings.connectionSettings",
  "Android registration must ask for account details before showing connection settings",
);
assert.match(androidLoginSource, /strings\.advancedConnectionSecondaryHint/, "Android login advanced connection entry must mark custom URLs as usually unnecessary");
assert.match(androidRegisterSource, /strings\.advancedConnectionSecondaryHint/, "Android registration advanced connection entry must mark custom URLs as usually unnecessary");
assert.match(androidI18nSource, /advancedConnectionSecondaryHint/, "Android i18n must centralize advanced connection secondary guidance");
assert.match(androidAppUiSource, /systemBarsPadding\(\)/, "Android page shell must apply system bar insets consistently");
assert.match(androidManifestSource, /android:label="@string\/app_name"/, "Android app label must use the localized app_name resource instead of a manifest literal");
assert.match(
  androidMainActivitySource,
  /remember\s*\{\s*mutableStateOf<WidgetLaunchTarget\?>\(null\)\s*\}/,
  "Android widget launch fallback state must be remembered instead of being recreated during composition",
);
assert.match(
  androidMainActivitySource,
  /remember\s*\{\s*mutableStateOf<String\?>\(null\)\s*\}/,
  "Android shared-text fallback state must be remembered instead of being recreated during composition",
);
assert.doesNotMatch(androidTaskListSource, /SyncStatusBar\(uiState\.syncMessage, modifier = Modifier\.statusBarsPadding\(\)\)/, "Android task list must not apply a second status-bar inset to the sync bar");
assert.doesNotMatch(androidTaskListSource, /label = ""/, "Android task list dropdowns must have visible labels so two 'all' controls are distinguishable");
assert.match(androidTaskListSource, /TaskListPrimaryNavigation\(/, "Android task view switching must be visible as primary navigation");
assert.match(androidTaskListSource, /label = strings\.filter/, "Android task filter dropdown must be labeled from centralized i18n");
assert.match(androidTaskListSource, /private val primaryTaskListFilters/, "Android task list must keep common filters separate from secondary filters");
assert.match(androidTaskListSource, /private val moreTaskListFilters/, "Android task list must keep secondary filters grouped separately from common filters");
assert.doesNotMatch(androidTaskListSource, /options = TaskListFilter\.entries\.map/, "Android task filter dropdown must not expose every filter in one long menu");
assert.match(androidTaskListSource, /emptyTaskStateUi\([\s\S]{0,180}searchQuery = uiState\.searchQuery/, "Android empty task state must choose contextual copy and actions based on search and the active filter");
assert.match(androidTaskListSource, /EmptyTaskListAction\.ShowAllTasks[\s\S]{0,180}viewModel\.setFilter\(TaskListFilter\.All\)/, "Android empty filtered-view action must reset to the all-tasks filter");
assert.match(androidMainActivitySource, /EditorToday/, "Android navigation must have a dedicated today-add editor route");
assert.match(androidMainActivitySource, /todayOnly = true[\s\S]{0,180}onAddClick = \{ navController\.navigate\(Routes\.EditorToday\) \}/, "Android Today page add action must open the editor with a today preset");
assert.match(androidMainActivitySource, /EditorEntryPreset\.Today/, "Android today-add editor route must pass the today preset to the editor");
assert.match(androidEditorViewModelSource, /fun initialEditorDraftForPreset\(/, "Android editor must model entry presets as a tested draft initializer");
assert.match(androidEditorViewModelSource, /EditorEntryPreset\.Today -> EditorUiState\([\s\S]{0,120}listType = "today"[\s\S]{0,120}plannedDate = today\.toString\(\)/, "Android Today entry preset must also keep the hidden list type aligned with Today");
assert.match(androidI18nSource, /10\.0\.2\.2|emulator/i, "Android local trial copy must explicitly explain emulator-to-computer backend addressing");
assert.match(androidLoginSource, /strings\.advancedConnectionSettings/, "Android login must frame API/WebSocket fields as advanced connection settings");
assert.match(androidRegisterSource, /strings\.advancedConnectionSettings/, "Android registration must frame API/WebSocket fields as advanced connection settings");
assert.match(androidI18nSource, /advancedConnectionSettings = "Troubleshooting: custom connection URLs"/, "Android i18n must include custom troubleshooting connection settings copy");
assert.doesNotMatch(androidLoginSource, /Developer endpoints/, "Android login must not use developer-only wording for recoverable connection settings");
assert.doesNotMatch(androidRegisterSource, /Developer endpoints/, "Android registration must not use developer-only wording for recoverable connection settings");
assert.doesNotMatch(androidLoginSource, /showAdvancedConnectionEntry[\s\S]{0,220}connectionMessageIsError/, "Android login advanced connection entry must not depend on an error first");
assert.doesNotMatch(androidRegisterSource, /showAdvancedConnectionEntry[\s\S]{0,220}connectionMessageIsError/, "Android registration advanced connection entry must not depend on an error first");
assert.doesNotMatch(androidLoginSource, /if \(showAdvancedConnectionEntry\)/, "Android login should always render the collapsed advanced connection entry");
assert.doesNotMatch(androidRegisterSource, /if \(showAdvancedConnectionEntry\)/, "Android registration should always render the collapsed advanced connection entry");
assert.match(androidLoginSource, /FirstUseGuide/, "Android login must keep optional first-use guidance available after the primary form");
const androidSignInPanelSource = sourceBetween(androidLoginSource, "private fun SignInPanel(", "private fun FirstUseGuide(");
assertOrder(
  androidSignInPanelSource,
  "value = state.serverBaseUrl",
  "value = state.usernameOrEmail",
  "Android login should keep the server address before account controls in the primary sign-in flow",
);
assertOrder(
  androidLoginSource,
  "SignInPanel(",
  "FirstUseGuide(strings = strings)",
  "Android login should place optional setup guidance after sign-in controls",
);
assert.match(androidRegisterSource, /FirstUseGuide/, "Android registration must orient first-time users before asking for a server");
assert.match(androidLoginSource, /var detailsOpen by remember/, "Android login first-use guidance must collapse setup details by default");
assert.match(androidRegisterSource, /var detailsOpen by remember/, "Android registration first-use guidance must collapse setup details by default");
assert.doesNotMatch(androidLoginSource, /Web 客户端的本机试用\/自托管说明|Web client local-trial and self-hosting guides/, "Android login first-use guide must not send Android-only users to Web-client setup wording");
assert.doesNotMatch(androidRegisterSource, /Web 客户端的本机试用\/自托管说明|Web client local-trial and self-hosting guides/, "Android registration first-use guide must not send Android-only users to Web-client setup wording");
assert.doesNotMatch(androidI18nSource, /Use Docker local trial|Docker 本机试用/, "Android first-use copy must not front-load Docker in the sign-in path");
assert.match(androidI18nSource, /10\.0\.2\.2/, "Android local-trial help must still explain the emulator address when users need it");
assert.match(androidLoginSource, /strings\.localTrialHelp/, "Android login first-use guide must use localized local-trial copy");
assert.match(androidRegisterSource, /strings\.localTrialHelp/, "Android registration first-use guide must use localized local-trial copy");
assert.match(androidI18nSource, /openLocalTrialGuide/, "Android first-use copy must include a direct local-trial guide action");
assert.match(androidI18nSource, /openSelfHostGuide/, "Android first-use copy must include a direct self-hosting guide action");
assert.match(androidLoginSource, /LocalUriHandler\.current/, "Android login first-use guide must be able to open documentation directly");
assert.match(androidRegisterSource, /LocalUriHandler\.current/, "Android registration first-use guide must be able to open documentation directly");
assert.match(androidLoginSource, /strings\.openLocalTrialGuide/, "Android login first-use guide must render a direct local-trial guide button");
assert.match(androidRegisterSource, /strings\.openLocalTrialGuide/, "Android registration first-use guide must render a direct local-trial guide button");
assert.match(androidLoginSource, /strings\.openSelfHostGuide/, "Android login first-use guide must render a direct self-hosting guide button");
assert.match(androidRegisterSource, /strings\.openSelfHostGuide/, "Android registration first-use guide must render a direct self-hosting guide button");
assert.doesNotMatch(androidLoginSource, /strings\.setupChecklist/, "Android login first-use help must not repeat a setup checklist in the ordinary sign-in path");
assert.doesNotMatch(androidRegisterSource, /strings\.setupChecklist/, "Android registration first-use help must not repeat a setup checklist in the ordinary registration path");
assert.doesNotMatch(androidI18nSource, /setupChecklist/, "Android i18n data model must not keep an unused setup checklist field");
assert.match(androidI18nSource, /setupHelpSummary = "没有服务器地址？"/, "Android collapsed setup help label must be short and decision-oriented in Chinese");
assert.match(androidI18nSource, /setupHelpSummary = "No server address\?"/, "Android collapsed setup help label must be short and decision-oriented in English");
assert.match(androidI18nSource, /localTrialHelp = "本机试用：/, "Android local-trial help must label the trial path directly");
assert.match(androidI18nSource, /selfHostGuide = "自托管：/, "Android self-host help must label the self-host path directly");
for (const [name, source] of [
  ["Android login", androidLoginSource],
  ["Android register", androidRegisterSource],
  ["Android settings", androidSettingsSource],
]) {
  assert.doesNotMatch(source, /label = \{ Text\(if \(isEnglish\) "API URL"/, `${name} advanced request endpoint must not be API-first copy`);
  assert.doesNotMatch(source, /label = \{ Text\(if \(isEnglish\) "WebSocket URL"/, `${name} advanced sync endpoint must not be WebSocket-first copy`);
  assert.match(source, /strings\.requestUrlAdvanced|Request address for custom proxy/, `${name} advanced request endpoint must use user-facing copy`);
  assert.match(source, /strings\.syncConnectionUrlAdvanced|Sync address for custom proxy/, `${name} advanced sync endpoint must use user-facing copy`);
}
assert.match(androidLoginSource, /localhostWarningText/, "Android login must warn when localhost is likely the wrong address");
assert.match(androidRegisterSource, /localhostWarningText/, "Android registration must warn when localhost is likely the wrong address");
assert.match(androidSettingsSource, /localhostWarningText/, "Android settings must warn when localhost is likely the wrong address");
assert.doesNotMatch(androidSettingsSource, /showAdvancedConnectionEntry[\s\S]{0,220}connectionNoteIsError/, "Android settings advanced connection entry must not depend on an error first");
assert.doesNotMatch(androidSettingsSource, /if \(showAdvancedConnectionEntry\)/, "Android settings should always render the collapsed advanced connection entry");
assert.match(androidLoginViewModelSource, /\.onFailure\s*\{\s*error\s*->[\s\S]{0,260}connectionFailureMessage\(error\)/, "Android login connection test must preserve the failure detail");
assert.match(androidRegisterViewModelSource, /\.onFailure\s*\{\s*error\s*->[\s\S]{0,260}connectionFailureMessage\(error\)/, "Android registration connection test must preserve the failure detail");
assert.match(androidUserFacingErrorsSource, /fun connectionFailureMessage\(error: Throwable\)/, "Android user-facing errors must expose a connection failure message with detail");
assert.match(androidUserFacingErrorsSource, /connectionFailureMessagePrefix/, "Android connection failure details must use a typed prefix instead of collapsing to a generic key");
assert.match(androidUserFacingErrorsSource, /isServerUrlFormatError/, "Android connection errors must classify invalid server URLs");
assert.doesNotMatch(androidTokenDataStoreSource, /return normalizeServerBaseUrl\(fallback\)/, "Android server URL normalization must not silently fall back to the build default");
assert.match(androidTokenDataStoreSource, /throw IllegalArgumentException\("invalid server url"\)/, "Android invalid server URL must fail loudly so the UI can guide the user");
assert.match(androidReminderManagerSource, /tokenDataStore\.language\.first\(\)/, "Android reminders must use the saved app language");
assert.match(androidReminderManagerSource, /stringsFor\(AppLanguage\.fromCode/, "Android reminder actions and fallback text must come from localized strings");
assert.doesNotMatch(androidReminderManagerSource, /"Task reminders"|"TaskBridge due task reminders"|"Task reminder"/, "Android reminders must not hard-code English notification copy");
assert.doesNotMatch(androidReminderManagerSource, /\.addAction\(0, "完成"/, "Android reminder complete action must not be hard-coded Chinese");
const desktopFirstUseGuide = sourceBetween(
  desktopLoginSource,
  '<details class="first-use-guide first-use-guide-collapsed">',
  '</details>',
);
assert.match(desktopFirstUseGuide, /:aria-label="settingsStore\.t\('auth\.firstUseTitle'\)"/, "Desktop first-use guide accessible name must follow the selected language");
assert.doesNotMatch(desktopFirstUseGuide, /command-snippet|localTrialGuideText\(\)/, "Desktop first-use guide must not put deployment commands in the auth screen");
assert.doesNotMatch(desktopFirstUseGuide, /git clone/, "Desktop local-trial guide must not require installed users to clone the repository before understanding the path");
assert.match(desktopLoginSource, /源码\/部署包|source or deployment package/, "Desktop local-trial guide must explain that users need the TaskBridge source or deployment package before running deploy commands");
assert.match(desktopFirstUseGuide, /copyDeployDocsReference/, "Desktop local-trial guide must keep an actionable reference without exposing command blocks");
assert.match(desktopLoginSource, /TaskBridge 本机试用/, "Desktop local-trial guide title must avoid front-loading deployment tooling names");
assert.match(desktopI18nSource, /If you do not have one, ask your administrator or deployer first/, "Desktop English local-trial summary must avoid front-loading deployment tooling names");
assert.doesNotMatch(desktopI18nSource, /Docker local trial|Docker 本机试用|Docker 本机试用说明/, "Desktop local-trial copy must not front-load Docker in ordinary login guidance");
assert.doesNotMatch(
  desktopLoginSource,
  /registrationBlocked \|\| !auth\.registrationStatusKnown" class="form-error"/,
  "Desktop login must not style an unknown registration status as an error",
);
assert.match(
  desktopLoginSource,
  /const registrationUnavailableText = computed\(\(\) =>[\s\S]{0,160}registrationBlocked\.value \? settingsStore\.t\("auth\.registrationClosed"\) : settingsStore\.t\("auth\.registrationUnknown"\)/,
  "Desktop login must still derive separate closed-registration and unknown-status guidance",
);
assert.match(
  desktopLoginSource,
  /:title="registrationBlocked \|\| !auth\.registrationStatusKnown \? registrationUnavailableText : ''"/,
  "Desktop login register tab must keep concise status guidance without repeating a second paragraph",
);
assert.match(androidLoginSource, /reducePendingRegistrationNavigation/, "Android login must reduce pending registration navigation through a tested policy helper");
assert.match(androidLoginSource, /registrationStatusUnknownAfterCheckHelp/, "Android login must explain when registration status cannot be confirmed after a connection check");
assert.match(androidRegisterSource, /registrationAvailability\.helperText/, "Android registration must show registration availability help before disabled form fields");
assertOrder(
  androidRegisterSource,
  "registrationAvailability.helperText",
  "value = state.username",
  "Android registration should explain unavailable registration before showing disabled account fields",
);
assert.doesNotMatch(androidTaskListSource, /taskListSubtitleOrNull/, "Android task rows must not collapse metadata into one truncating subtitle line");
assert.match(androidTaskListSource, /TaskMetaChips\(/, "Android task rows must render task metadata as wrapping chips");
assert.match(androidTaskListSource, /private fun TaskMetaChips/, "Android task metadata chips must be a focused composable");
assert.doesNotMatch(androidTaskListSource, /private fun Task\.subtitle\(/, "Android task rows must not keep slash-joined metadata subtitles");
assert.match(androidTaskListSource, /val activeFilterLabels = activeTaskFilterLabels\(/, "Android task list must derive visible active filter labels");
assert.match(androidTaskListSource, /TaskFilterSummaryBar\(/, "Android task list must show a current-filter summary below filter controls");
assert.match(
  androidTaskListSource,
  /onClearSearch = \{ viewModel\.updateSearchQuery\(""\) \}/,
  "Android task list current-filter summary must let users clear search text",
);
assert.match(
  androidTaskListSource,
  /onClearFilter = \{ viewModel\.setFilter\(TaskListFilter\.All\) \}/,
  "Android task list current-filter summary must let users reset filters to all tasks",
);
assert.match(androidEditorViewModelSource, /fun buildQuickAddPreviewChips/, "Android editor must provide a quick-add preview model before saving");
assert.match(androidEditorSource, /QuickAddPreviewChips/, "Android editor must render quick-add preview chips below the title field");
assert.doesNotMatch(readmeSource, /高级连接端点/, "README ordinary-user copy must use the current advanced connection settings wording");
assert.match(androidI18nSource, /repeatRule = "重复"/, "Android repeat field copy must hide internal daily/weekly/monthly values");
assert.doesNotMatch(androidI18nSource, /重复规则：daily \/ weekly \/ monthly/, "Android repeat field copy must not expose implementation values to users");
assert.match(androidTaskListSource, /TaskListFilter\.Trash/, "Android task list must expose a trash/recycle-bin filter");
assert.match(androidTaskListSource, /pendingPurgeTask/, "Android trash view must keep a confirmation state for permanent delete");
assert.match(androidTaskListSource, /PurgeTaskConfirmationDialog/, "Android trash permanent delete must explain the irreversible action");
assert.match(androidTaskListSource, /onPurge/, "Android trash rows must expose a permanent-delete action");
assert.match(androidTaskRepositorySource, /suspend fun purgeDeletedTask/, "Android repository must implement permanent delete");
assert.match(androidTaskRepositorySource, /apiService\.purgeTask/, "Android permanent delete must call the backend purge endpoint for synced tasks");
assert.match(androidTaskListViewModelSource, /val taskBeforePurge = taskRepository\.getTask\(localId\)/, "Android permanent delete must load the task before deleting it so reminders can be canceled");
assertOrder(
  androidTaskListViewModelSource,
  "taskBeforePurge?.let(reminderManager::cancel)",
  "taskRepository.purgeDeletedTask(localId)",
  "Android permanent delete must cancel scheduled reminders before removing the task row",
);
assert.match(androidTaskListViewModelSource, /SyncStatusMessage\.PurgeFailed/, "Android permanent delete failures must show a failure message instead of a queued-delete message");
assert.doesNotMatch(
  androidTaskListViewModelSource,
  /onFailure\s*\{[\s\S]{0,140}SyncStatusMessage\.DeleteQueued/,
  "Android permanent delete failure must not tell users the delete was queued",
);
assert.match(androidSyncStatusBarSource, /SyncStatusMessage\.PurgeFailed/, "Android sync status bar must localize permanent-delete failure feedback");
assert.match(androidTaskListSource, /if \(uiState\.syncMessage != SyncStatusMessage\.LocalCacheReady\)/, "Android task list should not reserve the main status bar for the normal healthy state");
assert.match(androidI18nSource, /purge = "永久删除"/, "Android i18n must include permanent-delete copy");
assert.match(androidTaskListSource, /pendingConflictAction/, "Android conflict actions must require confirmation before resolving");
assert.match(androidTaskListSource, /ConflictActionConfirmationDialog/, "Android conflict resolution must explain the consequence before applying");
assert.match(androidTaskListSource, /getConflictConfirmationMessage/, "Android conflict confirmation must use user-facing risk copy");
assert.match(androidTaskListSource, /ConflictSnapshotSummary/, "Android conflict rows must show local and server snapshots before users decide");
assert.match(androidTaskListSource, /conflictSnapshotDetailText/, "Android conflict rows must compare more than the task title");
assert.match(androidTaskListSource, /ConflictSnapshotComparison/, "Android conflict rows must use a comparison layout for the two task versions");
assert.match(androidTaskListSource, /data class ConflictSnapshotDiff/, "Android conflict details must keep local and synced values as structured rows");
const androidConflictComparisonSource = sourceBetween(androidTaskListSource, "private fun ConflictSnapshotComparison(", "@Composable\nprivate fun ConflictSnapshotCard");
assert.match(androidConflictComparisonSource, /Column\(/, "Android conflict comparison should stack versions vertically on narrow phones");
assert.doesNotMatch(androidConflictComparisonSource, /Row\(/, "Android conflict comparison must not force two narrow columns on phones");
assert.doesNotMatch(
  androidTaskListSource,
  /\$\w+: \$\{\w+Value\.ifBlank \{ "-" \}\} \/ \$\{\w+Value\.ifBlank \{ "-" \}\}/,
  "Android conflict details must not expose local/server differences as slash-joined engineering text",
);
assert.doesNotMatch(androidTaskListSource, /differences\.take\(3\)/, "Android conflict details must not truncate field differences before the user decides");
assert.match(androidTaskListSource, /content|截止|Due|标签|Tag|清单|Checklist/, "Android conflict details must include changed fields users can evaluate");
assert.doesNotMatch(androidTaskListSource, /ConflictInlineActions/, "Android conflict rows must keep conflict decisions inside the row action menu to avoid crowded mobile rows");
assert.match(androidTaskListSource, /DropdownMenuItem\([\s\S]{0,220}strings\.keepServerVersion[\s\S]{0,260}onUseServer\(\)/, "Android row action menu must still offer the synced-version conflict decision");
assert.match(androidTaskListSource, /DropdownMenuItem\([\s\S]{0,220}strings\.keepDeviceVersion[\s\S]{0,260}onOverwriteServer\(\)/, "Android row action menu must still offer the device-version conflict decision");
assert.match(androidTaskListSource, /onTaskClick: \(String\) -> Unit/, "Android task rows must expose a normal open-details action, not only edit");
assert.match(androidTaskListSource, /onOpen = \{ onTaskClick\(task\.localId\) \}/, "Android task rows must wire row opening to the task detail route");
assert.match(androidMainActivitySource, /onTaskClick = \{ navController\.navigate\(Routes\.taskDetail\(it\)\) \}/, "Android all-tasks list must navigate to task detail");
assert.match(androidMainActivitySource, /todayOnly = true,[\s\S]{0,220}onTaskClick = \{ navController\.navigate\(Routes\.taskDetail\(it\)\) \}/, "Android today list must navigate to task detail");
assert.doesNotMatch(androidTaskListSource, /cloudTitle == null[\s\S]{0,120}MaterialTheme\.colorScheme\.error/, "Android missing server preview must use informational color instead of error color");
assert.match(androidTaskListSource, /TaskListHeaderActions/, "Android task list must fold secondary actions such as sync and settings behind one header action menu");
assert.doesNotMatch(androidTaskListSource, /TextButton\(onClick = \{ viewModel\.refresh\(\) \}, modifier = Modifier\.weight\(1f\)\)/, "Android task list must not reserve a full-width sync button before search and filters");
assert.match(androidTaskListSource, /Synced version|同步来的版本/, "Android conflict copy must call the remote side the synced version");
assert.doesNotMatch(androidTaskListSource, /(采用云端|覆盖云端|云端版本|Cloud preview|cloud version|Overwrite cloud)/, "Android task conflict UI must use server/device wording instead of cloud wording");
assert.doesNotMatch(androidI18nSource, /(采用云端|覆盖云端|cloud sync|Use cloud|Overwrite cloud)/, "Android i18n conflict copy must use server/device wording instead of cloud wording");
assert.doesNotMatch(androidSyncStatusBarSource, /(已采用云端版本|已排队覆盖云端|Using cloud version|Overwrite cloud queued)/, "Android sync status copy must use server/device wording instead of cloud wording");
assert.match(androidTaskDetailSource, /getTaskListTypeLabel\(listType/, "Android task detail must localize list types before showing them");
assert.match(androidTaskDetailSource, /getTaskPriorityLabel\(priority/, "Android task detail must localize priorities before showing them");
assert.match(androidTaskDetailSource, /pendingChecklistDelete/, "Android checklist deletion must require confirmation state before deleting");
assert.match(androidTaskDetailSource, /AlertDialog/, "Android checklist deletion must show a confirmation dialog");
assert.match(androidTaskDetailSource, /pendingTaskDelete/, "Android task detail must expose a delete confirmation for the current task");
assert.match(androidTaskDetailSource, /softDeleteTask\(current\.localId\)/, "Android task detail delete must use the same soft-delete workflow as the list");
assert.match(androidTaskDetailSource, /current\.isDeleted/, "Android task detail must branch deleted tasks away from normal task actions");
assert.match(androidTaskDetailSource, /restoreDeletedTask\(current\.localId\)/, "Android deleted task detail must expose a restore action");
assert.match(androidTaskDetailSource, /DeletedTaskActions/, "Android deleted task detail actions must be isolated from normal task actions");
assert.doesNotMatch(androidTaskDetailSource, /\$\{strings\.list\} \$listType/, "Android task detail must not expose raw listType values");
assert.doesNotMatch(androidTaskDetailSource, /\$\{strings\.priority\} \$priority/, "Android task detail must not expose raw priority numbers");
assert.match(androidEditorSource, /DateTimeActionRow/, "Android time fields must be picker-first compact actions instead of free-form text fields");
assert.match(androidEditorSource, /showDatePicker\(/, "Android planned date must use a date picker instead of a raw yyyy-MM-dd text field");
assert.match(androidEditorSource, /onPickPlannedDate = \{ pickPlannedDate\(\) \}/, "Android planned date action must open the date picker");
assert.match(androidEditorSource, /onPickDueTime = \{ pickDueTime\(\) \}/, "Android due-time action must open the date-time picker");
assert.match(androidEditorSource, /onPickReminder = \{ pickReminder\(\) \}/, "Android reminder action must open the date-time picker");
assert.doesNotMatch(androidEditorSource, /label = \{ Text\("\$\{strings\.plan\} yyyy-MM-dd"\) \}/, "Android planned date label must not ask users to hand-type yyyy-MM-dd");
assert.match(androidEditorViewModelSource, /fun isValidPlannedDateInput\(/, "Android editor must validate planned dates before saving");
assert.match(androidEditorSource, /BackHandler/, "Android editor must intercept system back before discarding unsaved edits");
assert.match(androidEditorSource, /confirmDiscardChanges/, "Android editor must show a discard confirmation state before canceling dirty edits");
assert.match(androidEditorViewModelSource, /hasUnsavedChanges/, "Android editor state must track whether the current draft differs from the loaded task");
assert.match(androidEditorViewModelSource, /updateProject/, "Android editor must allow editing project metadata");
assert.match(androidEditorViewModelSource, /updatePlannedDate/, "Android editor must allow editing planned date metadata");
assert.match(androidEditorViewModelSource, /updateChecklistText/, "Android editor must allow editing checklist steps");
assert.match(
  androidEditorViewModelSource,
  /checklistTextToJson\(state\.checklistText,\s*existingChecklistJson\)/,
  "Android task edits must preserve checklist completion state when users only edit checklist text titles",
);
assert.match(androidEditorViewModelSource, /preserveChecklistItemState/, "Android checklist text parsing must reuse matching existing item state");
assert.match(androidEditorSource, /state\.project/, "Android editor UI must render the project field");
assert.match(androidEditorSource, /state\.plannedDate/, "Android editor UI must render the planned date field");
assert.match(androidEditorSource, /state\.checklistText/, "Android editor UI must render the checklist field");
assert.match(androidEditorSource, /ArrangementTaskFieldsPanel/, "Android editor must keep common scheduling fields available in the optional arrangement section");
assert.match(androidEditorSource, /AdvancedTaskFieldsPanel/, "Android editor must keep secondary metadata behind the more-settings section");
const androidQuickFieldsSection = sourceBetween(androidEditorSource, "private fun ArrangementTaskFieldsPanel(", "private fun AdvancedTaskFieldsPanel(");
for (const marker of ["strings.priority", "state.plannedDate", "state.dueTime", "state.remindTime"]) {
  assert.match(
    androidQuickFieldsSection,
    new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Android optional scheduling fields must remain available after expansion: ${marker}`,
  );
}
const androidAdvancedFieldsSection = sourceBetween(androidEditorSource, "private fun AdvancedTaskFieldsPanel(", "private val editorDateTimeFormatter");
assertOrder(
  androidEditorSource,
  "TextButton(onClick = { arrangeOpen = !arrangeOpen }",
  "ArrangementTaskFieldsPanel(",
  "Android optional scheduling fields should appear only after the arrangement toggle",
);
assert.match(androidQuickAddParserSource, /projectRegex/, "Android quick-add parser must extract @project shorthand like desktop and Web");
assert.match(androidTaskListSource, /showCompletionControl/, "Android task rows must hide completion checkboxes in trash mode");
assert.match(androidTaskListSource, /if \(showCompletionControl\)[\s\S]{0,260}Checkbox/, "Android task rows must render the completion checkbox only when it means complete or undo-complete");
assert.doesNotMatch(androidTaskListSource, /Checkbox\([\s\S]{0,260}if \(isTrash\)/, "Android trash rows must not use a checkbox as the restore action");
assert.match(androidTaskListSource, /combinedTaskListFilterOptions/, "Android task list must combine common and rare filters into one filter menu");
assert.doesNotMatch(androidTaskListSource, /More filters/, "Android task list must not expose a second More filters control in the default toolbar");
assert.doesNotMatch(androidTaskListSource, /TextButton\(onClick = onEdit\)/, "Android task rows must keep edit out of the primary inline action path");
assert.match(androidTaskListSource, /DropdownMenuItem\([\s\S]{0,160}Text\(strings\.edit\)[\s\S]{0,220}onEdit\(\)/, "Android task rows must keep edit available inside the More menu");
const androidTaskRowSource = sourceBetween(androidTaskListSource, "private fun TaskRow(", "@Composable\nprivate fun ConflictSnapshotSummary");
assert.match(androidTaskRowSource, /actionsLabel = if \(languageCode == "en-US"\) "Actions" else "操作"/, "Android task row secondary action button must say Actions/操作 instead of generic More");
assert.match(androidTaskRowSource, /adjustPlanSectionLabel = if \(languageCode == "en-US"\) "Adjust plan" else "调整计划"/, "Android row action menu must group schedule-changing actions");
assert.match(androidTaskRowSource, /resolveConflictSectionLabel = if \(languageCode == "en-US"\) "Resolve conflict" else "解决冲突"/, "Android row action menu must group conflict decisions");
assert.match(androidTaskRowSource, /dangerSectionLabel = if \(languageCode == "en-US"\) "Danger zone" else "危险操作"/, "Android row action menu must separate destructive actions");
assert.match(androidTaskRowSource, /DropdownMenuSectionLabel\(adjustPlanSectionLabel\)[\s\S]{0,520}strings\.today[\s\S]{0,520}strings\.tomorrow[\s\S]{0,520}strings\.snoozeOneHour/, "Android schedule actions must sit under the adjust-plan group");
assert.match(androidTaskRowSource, /DropdownMenuSectionLabel\(resolveConflictSectionLabel\)[\s\S]{0,520}strings\.keepServerVersion[\s\S]{0,520}strings\.keepDeviceVersion/, "Android conflict decisions must sit under the conflict-resolution group");
assert.match(androidTaskRowSource, /DropdownMenuSectionLabel\(dangerSectionLabel\)[\s\S]{0,260}strings\.delete/, "Android delete must sit under the danger group");
const androidQuickFieldsPanel = sourceBetween(androidEditorSource, "private fun ArrangementTaskFieldsPanel(", "private fun AdvancedTaskFieldsPanel(");
assert.match(androidQuickFieldsPanel, /DateTimeActionRow/, "Android optional date/time controls must use compact action rows");
assert.doesNotMatch(androidQuickFieldsPanel, /OutlinedTextField[\s\S]{0,180}readOnly = true/, "Android optional date/time controls must not duplicate a read-only field and a pick button");
assert.match(androidSettingsSource, /SettingsSectionButton/, "Android settings must expose a compact section navigation strip");
assert.match(androidSettingsSource, /FlowRow/, "Android settings section navigation must wrap on narrow screens");
assert.match(androidSettingsSource, /selectedSection == SettingsSection\.Preferences/, "Android settings must keep the preferences section separate from the rest");
assert.match(androidSettingsSource, /selectedSection == SettingsSection\.Troubleshooting/, "Android settings must keep troubleshooting separate from the rest");
assert.match(androidSettingsSource, /supportToolsOpen|troubleshootingOpen/, "Android settings must collapse recovery tools behind a support section");
assert.match(androidSettingsSource, /text = if \(isEnglish\) "Sync issues" else "同步问题"/, "Android settings support section tab must use shared sync-issues wording");
assert.match(androidSettingsSource, /title = if \(isEnglish\) "Account" else "账号"/, "Android settings must give sign-out its own account section");
assert.match(androidSettingsSource, /title = if \(isEnglish\) "Data and backups" else "数据与备份"/, "Android settings must expose backup as ordinary data management");
assert.match(androidSettingsSource, /title = if \(isEnglish\) "Sync issues" else "同步问题"/, "Android settings must separate sync issue tools from account actions");
assert.match(androidSettingsSource, /showTechnicalDiagnostics/, "Android troubleshooting must keep raw sync diagnostics behind an advanced toggle");
assert.match(androidSettingsSource, /confirmExportBackup/, "Android backup export must require explicit confirmation before sharing task data");
assert.match(androidSettingsSource, /confirmClearLocalData/, "Android settings must confirm before clearing this device's data");
assert.match(androidSettingsSource, /taskRepository\.clearLocalDeviceData\(\)/, "Android clear-this-device flow must delete local task data before logout");
assert.match(androidSettingsSource, /Clear this device/, "Android settings must expose a clear-this-device action");
assert.match(androidTaskRepositorySource, /suspend fun clearLocalDeviceData/, "Android repository must implement clear-this-device data clearing");
assert.match(androidDaoSource, /DELETE FROM tasks WHERE workspaceId = :workspaceId/, "Android DAO must scope local task clearing to the active workspace");
assert.match(androidDaoSource, /suspend fun deleteAllForWorkspace\(workspaceId: String\)/, "Android DAO must expose workspace-scoped local data clearing");
assert.doesNotMatch(androidDaoSource, /@Query\("DELETE FROM tasks"\)/, "Android DAO must not expose unscoped task clearing");
assert.match(androidI18nSource, /importBackup/, "Android settings must include user-facing import backup copy");
assert.match(androidSettingsSource, /rememberLauncherForActivityResult/, "Android settings must provide an explicit backup import picker");
assert.match(androidSettingsSource, /ActivityResultContracts\.OpenDocument/, "Android backup import must use the platform document picker");
assert.match(androidTaskRepositorySource, /data class BackupImportResult/, "Android backup import must return enough information for post-import recovery");
assert.match(androidTaskRepositorySource, /data class BackupImportPreview/, "Android backup import preview must return structured details");
assert.match(androidTaskRepositorySource, /enum class BackupImportErrorCode/, "Android backup import failures must use explicit error codes");
assert.match(androidTaskRepositorySource, /previewBackupImport/, "Android backup import must preview importable, scanned, skipped, and error details");
assert.match(androidTaskRepositorySource, /scannedCount/, "Android backup import preview must include scanned task count");
assert.match(androidTaskRepositorySource, /skippedCount/, "Android backup import preview must include skipped task count");
assert.match(androidSettingsSource, /formatBackupImportFailureMessage/, "Android backup import errors must map to actionable user-facing copy");
assert.match(androidSettingsSource, /formatBackupImportPreviewMessage/, "Android backup import confirmation must show import and skip counts");
assert.match(androidTaskRepositorySource, /importBackupJsonDetailed/, "Android backup import must expose imported local ids for undo");
assert.match(androidTaskRepositorySource, /undoImportedBackupTasks/, "Android backup import must support undoing the last import batch");
assert.match(androidTaskRepositorySource, /data class BackupImportUndoItem/, "Android backup import undo must track each imported task's original update marker");
assert.match(androidTaskRepositorySource, /data class BackupImportUndoResult/, "Android backup import undo must return undone and skipped counts");
assert.match(androidTaskRepositorySource, /importedUndoItems/, "Android backup import result must expose safe undo metadata instead of only local ids");
assert.match(androidTaskRepositorySource, /current\.updatedAt != item\.importedUpdatedAt/, "Android backup import undo must skip tasks changed after import");
assert.match(androidSettingsSource, /pendingBackupImport/, "Android backup import must preview the selected file before importing");
assert.match(androidSettingsSource, /confirmBackupImport/, "Android backup import must require explicit confirmation after preview");
assert.match(androidSettingsSource, /lastImportedBackupLocalIds/, "Android settings must retain the last imported task ids for undo");
assert.match(androidTokenDataStoreSource, /lastBackupImportUndoItems/, "Android backup import undo metadata must be persisted beyond the current settings composition");
assert.match(androidTokenDataStoreSource, /saveLastBackupImportUndoItems/, "Android settings must be able to save backup import undo metadata");
assert.match(androidTokenDataStoreSource, /clearLastBackupImportUndoItems/, "Android settings must be able to clear backup import undo metadata after undo");
assert.match(androidSettingsSource, /parseBackupImportUndoItems/, "Android settings must restore backup import undo availability from persisted metadata");
assert.match(androidSettingsSource, /confirmUndoBackupImport/, "Android settings must confirm backup import undo before deleting imported tasks");
assert.match(androidSettingsSource, /skippedChangedCount/, "Android backup import undo message must explain changed tasks that were not undone");
assert.match(androidSettingsSource, /undoLastBackupImport/, "Android settings must provide an undo action for the last backup import");
assert.match(androidSettingsSource, /most recent/, "Android backup import undo copy must say only the most recent import can be undone");
assert.doesNotMatch(
  androidSettingsSource,
  /taskRepository\.importBackupJson\(raw\)/,
  "Android settings must not import backups immediately after file selection",
);
assert.match(androidSettingsSource, /backupExportSensitiveWarning/, "Android backup export confirmation must explain that backups contain task data");
assert.match(androidSettingsSource, /onClick = \{ confirmExportBackup = true \}/, "Android backup export button must open the confirmation dialog instead of sharing immediately");
assertOrder(
  androidSettingsSource,
  'title = if (isEnglish) "Data and backups" else "数据与备份"',
  'title = if (isEnglish) "Sync issues" else "同步问题"',
  "Android backup export should be visible before sync issue tools",
);
assert.match(androidSettingsSource, /saveAdvancedConnection/, "Android settings must save and test developer endpoints through an explicit helper");
assert.match(androidSettingsSource, /authRepository\.testConnection\(\)[\s\S]{0,480}"Connection is ready\."/, "Android advanced endpoint save must verify the API endpoint before showing a ready state");
assert.match(androidTokenDataStoreSource, /fun validateApiBaseUrl/, "Android advanced API endpoint must have explicit user-input validation");
assert.match(androidTokenDataStoreSource, /fun validateWebSocketUrl/, "Android advanced WebSocket endpoint must have explicit user-input validation");
assert.match(androidTokenDataStoreSource, /val normalizedApiBaseUrl = validateApiBaseUrl\(apiBaseUrl\)[\s\S]{0,240}apiBaseUrl = normalizedApiBaseUrl/, "Android advanced endpoint save must validate API URLs before persistence");
assert.match(androidTokenDataStoreSource, /webSocketUrl = validateWebSocketUrl\(webSocketUrl\)/, "Android advanced endpoint save must validate WebSocket URLs before persistence");
assert.match(androidTokenDataStoreSource, /preferences\[API_BASE_URL\] = endpoints\.apiBaseUrl[\s\S]{0,120}preferences\[WEB_SOCKET_URL\] = endpoints\.webSocketUrl/, "Android endpoint persistence must store only the validated endpoint object");
assert.match(androidSettingsSource, /validateApiBaseUrl\(apiBaseUrlDraft\)/, "Android settings must validate the advanced API URL before saving and testing");
assert.match(androidSettingsSource, /validateWebSocketUrl\(webSocketUrlDraft\)/, "Android settings must validate the advanced WebSocket URL before saving and testing");
assert.match(androidSettingsSource, /ZoneId\.getAvailableZoneIds\(\)/, "Android time zone selection must use the platform time-zone list instead of a short fixed list");
assert.match(androidSettingsSource, /syncQueueDiagnosticText\(/, "Android technical diagnostics must render user-facing retry details");
assert.doesNotMatch(androidSettingsSource, /\$\{item\.action\} 路 \$\{item\.localId\} 路 attempts=\$\{item\.attemptCount\}/, "Android technical diagnostics must not expose raw action/local id/attempt syntax");
assert.doesNotMatch(androidSettingsSource, /\$\{item\.action\} 路 \$\{item\.title \?: item\.localId\} 路 \$\{item\.attemptCount\}/, "Android troubleshooting must not expose raw queue action/local id/attempt count by default");
assertOrder(
  androidSettingsSource,
  'title = if (isEnglish) "Account" else "账号"',
  'title = if (isEnglish) "Sync issues" else "同步问题"',
  "Android account actions should appear before sync issue tools",
);
assert.doesNotMatch(androidSettingsSource, /Room 数据/, "Android widget settings must not expose Room implementation details");
assert.doesNotMatch(
  androidSyncStatusBarSource,
  /同步队列/,
  "Android sync status messages must not expose sync queue internals to users",
);
assert.doesNotMatch(readmeSource, /Use cloud|Overwrite cloud|cloud version/i, "README conflict copy must use the current device/synced-version wording");
assert.doesNotMatch(deployReadmeSource, /Use cloud|Overwrite cloud|cloud version/i, "Deploy docs must not use old server-overwrite conflict wording");
assert.doesNotMatch(syncDesignDocSource, /Use cloud|Overwrite cloud|cloud version/i, "Sync design docs must use current device/synced-version conflict wording");

assert.match(deployReadmeSource, /客户端填写服务器根地址/, "Deploy docs must lead with the server root address for clients");
assert.match(deployReadmeSource, /高级端点/, "Deploy docs must move API and WebSocket paths into advanced endpoint wording");
assert.match(deployReadmeSource, /### 本机试用/, "Deploy docs must name the local trial as 本机试用");
assert.match(deployReadmeSource, /cp \.env\.local\.example \.env/, "Deploy local trial must copy the local env example, not the production env example");
assert.ok(
  deployReadmeSource.indexOf("cp .env.local.example .env") < deployReadmeSource.indexOf("cp .env.example .env"),
  "Deploy docs must show the local env example before production env setup",
);
assert.match(deployReadmeSource, /### 验证客户端能登录/, "Deploy docs must include a concrete client login verification step");
assert.match(
  deployReadmeSource,
  /python -m tools\.create_user|create_user/,
  "Deploy docs must explain how to create the first account when production registration is disabled",
);
assert.match(
  deployReadmeSource,
  /python -m tools\.create_user/,
  "Deploy docs must provide a concrete first-account command for self-hosted production deployments",
);
assert.match(deployReadmeSource, /## 生产运维/, "Deploy docs must move monitoring and proxy trust details into a production operations section");
assert.match(deployReadmeSource, /客户端填写服务器根地址[\s\S]{0,160}http:\/\/<服务器 IP 或域名>:8000[\s\S]{0,80}https:\/\/<域名>/, "Deploy connection docs must keep ordinary clients on the server root URL for HTTP or HTTPS");
assert.doesNotMatch(deployReadmeSource, /客户端使用：[\s\S]{0,80}https:\/\/<域名>\/api\/v1\//, "Deploy HTTPS docs must not tell ordinary clients to use the API path as the server URL");
assertOrder(
  deployReadmeSource,
  "### 验证客户端能登录",
  "## 生产运维",
  "Deploy docs must verify client login before production operations details",
);
const deployLocalTrial = sourceBetween(deployReadmeSource, "### 本机试用", "### 验证客户端能登录");
assert.match(deployLocalTrial, /复制 `\.env\.local\.example` 为 `\.env`/, "Deploy local trial prose must tell users to copy the local env example");
assert.doesNotMatch(deployLocalTrial, /复制 `\.env\.example` 为 `\.env`/, "Deploy local trial prose must not point users at the production env example");
assert.doesNotMatch(
  deployLocalTrial,
  /(\/metrics|Prometheus|METRICS_TOKEN|TRUSTED_PROXY_IPS|X-Forwarded-For|X-Real-IP)/,
  "Deploy quick start must not front-load monitoring or proxy internals before client login works",
);
assert.match(deployEnvExampleSource, /ENVIRONMENT=production/, "Production env example must stay production hardened");
assert.match(deployLocalEnvExampleSource, /ENVIRONMENT=development/, "Local env example must start in development mode");
assert.match(
  deployLocalEnvExampleSource,
  /DATABASE_URL=mysql\+pymysql:\/\/taskbridge:taskbridge-local-password@mysql:3306\/taskbridge/,
  "Local env example must use a non-rejected database password",
);
assert.match(
  deployLocalEnvExampleSource,
  /WEB_CORS_ORIGINS=\*/,
  "Local env example must allow LAN Web/PWA origins in development",
);
assert.match(deployEnvExampleSource, /REGISTRATION_ENABLED=false/, "Production env example must keep open registration disabled by default");
assert.match(deployEnvExampleSource, /TASKBRIDGE_API_BIND=127\.0\.0\.1:8000/, "Production env example must bind the API to loopback by default");
assert.match(deployEnvExampleSource, /TASKBRIDGE_WEB_BIND=127\.0\.0\.1:8080/, "Production env example must bind the Web gateway to loopback by default");
assert.match(deployLocalEnvExampleSource, /TASKBRIDGE_API_BIND=8000/, "Local env example must keep the API reachable from LAN devices");
assert.match(deployLocalEnvExampleSource, /TASKBRIDGE_WEB_BIND=8080/, "Local env example must keep the Web gateway reachable from LAN devices");
assert.doesNotMatch(readmeSource, /docs\/assets\/screenshots\/(?:PC|APP)/, "README must not present legacy screenshots as the current interface");
assert.match(readmeSource, /### 已有服务器地址/, "README ordinary-user quick start must start with the existing-server path");
assertOrder(
  readmeSource,
  "## 普通用户快速开始",
  "## 你可以用它做什么",
  "README must put the ordinary-user quick start before feature marketing copy",
);
assert.doesNotMatch(readmeSource, /### 第一次使用怎么选/, "README ordinary-user quick start must not repeat the same first-use choices twice");
assert.match(readmeSource, /已有服务器地址[\s\S]{0,420}没有服务器地址[\s\S]{0,320}本机试用[\s\S]{0,260}长期自托管/, "README ordinary-user quick start must lead with existing-server sign-in and then distinguish local trial from long-term self-hosting");
assert.match(readmeSource, /已有服务器地址[\s\S]{0,650}本机试用[\s\S]{0,650}长期自托管/, "README ordinary-user quick start must expose the three plain choices: existing server, local trial, long-term self-hosting");
assertOrder(
  readmeSource,
  "### 已有服务器地址",
  "### 没有服务器地址",
  "README should explain the ordinary existing-server path before trial or self-hosting choices",
);
assert.match(readmeSource, /普通用户快速开始/, "README must lead ordinary users through a non-technical quick start");
assert.match(readmeSource, /\[普通用户快速开始\]\(\.\/docs\/user-quick-start\.md\)/, "README must link to the ordinary-user quick start document from the entry area");
assert.match(userQuickStartDocSource, /^# TaskBridge 普通用户快速开始/m, "Ordinary-user quick start doc must exist with a clear user-facing title");
assert.match(userQuickStartDocSource, /已有服务器地址[\s\S]{0,500}登录会自动检查连接/, "Ordinary-user quick start must lead with the existing-server login path and automatic connection check");
assert.match(userQuickStartDocSource, /已有服务器地址[\s\S]{0,650}本机试用[\s\S]{0,650}长期自托管/, "Ordinary quick start must use the same three-path language as the clients");
assert.match(deployReadmeSource, /本机试用[\s\S]{0,650}长期自托管/, "Deploy docs must explain when to use local trial versus long-term self-hosting");
assert.match(
  userQuickStartDocSource,
  /## 本机试用时的地址[\s\S]{0,260}电脑上本机试用时[\s\S]{0,260}手机或另一台电脑访问时[\s\S]{0,260}运行后端那台设备的地址/,
  "Ordinary-user quick start must explain the local device vs phone/other-device address difference",
);
assert.match(userQuickStartDocSource, /继续离线使用[\s\S]{0,500}登录并同步[\s\S]{0,260}待同步修改/, "Ordinary-user quick start must explain Web offline editing and the later sign-in required for sync");
assert.match(userQuickStartDocSource, /清除[\s\S]{0,260}不会删除服务器[\s\S]{0,260}导出备份|导出备份[\s\S]{0,260}不会删除服务器[\s\S]{0,260}清除/, "Ordinary-user quick start must explain clear-this-device safety and backups");
assert.match(
  userQuickStartDocSource,
  /标题是默认主输入[\s\S]{0,220}添加备注和清单[\s\S]{0,220}时间与安排[\s\S]{0,220}“更多”展开/,
  "Ordinary-user quick start must explain the title-first task editor path and optional sections",
);
assert.match(userQuickStartDocSource, /项目 \/ 标签维护[\s\S]{0,220}默认收起/, "Ordinary-user quick start must explain low-frequency settings are collapsed");
assert.doesNotMatch(
  userQuickStartDocSource,
  /^(?!## 维护者|## 开发者|## 自托管维护者).*(JWT|Redis|MySQL|CORS|WebSocket|docker compose|\.env)/m,
  "Ordinary-user quick start must keep implementation details out of the main user path",
);
assert.match(readmeSource, /开发者和自托管说明/, "README must separate implementation details from ordinary user onboarding");
assert.doesNotMatch(readmeSource, /## 开发启动|## 开发者技术栈|## 开发者常用验证命令/, "README must move developer commands into the development doc");
assert.match(readmeSource, /\[开发说明\]\(\.\/docs\/development\.md\)/, "README developer section must link to the development doc");
assert.match(developmentDocSource, /^# TaskBridge 开发说明/m, "Development doc must exist with a clear title");
assert.match(developmentDocSource, /## 开发启动[\s\S]*### Web\/PWA/, "Development doc must contain local startup instructions including Web/PWA");
assert.match(developmentDocSource, /## 开发者技术栈[\s\S]*轻量 JSON 配置/, "Development doc must keep the technical stack details");
assert.match(developmentDocSource, /## 开发者常用验证命令[\s\S]*check:auth-session-config[\s\S]*check:contract-drift/, "Development doc must keep desktop verification commands");
assert.match(developmentDocSource, /本机试用请使用 `\.env\.local\.example`/, "Development doc developer setup must use the local-trial name");
assert.match(developmentDocSource, /仅本机试用可以使用 `WEB_CORS_ORIGINS=\*`/, "Development doc CORS guidance must use the local-trial name");
assert.doesNotMatch(readmeSource, /WEB_CORS_ORIGINS|bootstrap-local\.ps1|-ReportOnly|-BootstrapMissing/, "README must keep implementation commands and CORS details out of the entry document");
assert.doesNotMatch(readmeSource, /(^|\n)Docker 本机试用请使用|(^|\n)Docker 本机试用可以使用/, "README must not mix old Docker local-trial wording in developer setup");
assert.match(readmeSource, /已有服务器/, "README must explain the existing-server path");
const readmeOrdinaryQuickStart = sourceBetween(readmeSource, "## 普通用户快速开始", "## 开发者和自托管说明");
assert.doesNotMatch(
  readmeOrdinaryQuickStart,
  /(Room|SQLite|FastAPI|Redis|WebSocket|IndexedDB|cursor_id|同步队列|离线队列)/,
  "README ordinary-user quick start must not lead with implementation details",
);
assert.doesNotMatch(
  deployReadmeSource,
  /## 客户端连接地址[\s\S]{0,160}后端 API 路径需要带/,
  "Deploy docs must not lead client setup with API/WebSocket internals",
);
const desktopUserSection = sourceBetween(desktopReadmeSource, "## 普通用户入口", "## 开发者说明");
const androidUserSection = sourceBetween(androidReadmeSource, "## 普通用户入口", "## 开发者说明");
assert.doesNotMatch(desktopUserSection, /(SQLite|WebSocket|Electron|Pinia|Vue|TypeScript|同步队列)/, "Desktop user README section must not lead with implementation details");
assert.doesNotMatch(androidUserSection, /(Kotlin|Jetpack Compose|Room|Retrofit|WebSocket|WorkManager|DataStore)/, "Android user README section must not lead with implementation details");
assert.doesNotMatch(androidUserSection, /please connect.*sign in once/i, "Android user README must use the same completed-login offline wording as the root README");

assert.match(desktopLoginSource, /copyDeployDocsReference/, "Desktop login local-trial guide must offer an actionable deployment-docs reference");
assert.match(desktopLoginSource, /copyDeployDocsReference[\s\S]{0,500}try[\s\S]{0,220}navigator\.clipboard\.writeText[\s\S]{0,220}catch/, "Desktop login local-trial copy action must show a fallback when clipboard access fails");
assert.doesNotMatch(desktopLoginSource, /deploy\/README\.md#/, "Desktop login local-trial guide must not copy a repository-relative docs path for installed users");
assert.match(desktopLoginSource, /openLocalTrialGuide/, "Desktop login local-trial action must open a usable guide instead of only copying text");
assert.match(desktopLoginSource, /const selfHostGuideUrl\s*=/, "Desktop login must keep a dedicated self-hosting guide URL instead of overloading the local trial guide");
assert.match(desktopLoginSource, /async function openSelfHostGuide\(\): Promise<void>/, "Desktop login must expose a direct self-hosting guide action");
assert.match(
  desktopFirstUseGuideSource,
  /@click="openLocalTrialGuide"[\s\S]{0,220}auth\.openLocalTrialGuide[\s\S]{0,420}@click="openSelfHostGuide"[\s\S]{0,220}auth\.openSelfHostGuide/,
  "Desktop first-use help must offer separate local-trial and self-hosting buttons",
);
assert.match(
  desktopI18nSource,
  /"auth\.openLocalTrialGuide": \{ "zh-CN": "打开本机试用说明", "en-US": "Open local trial guide" \}/,
  "Desktop local-trial guide label must match Web and Android",
);
assert.match(
  desktopI18nSource,
  /"auth\.openSelfHostGuide": \{ "zh-CN": "打开自托管说明", "en-US": "Open self-hosting guide" \}/,
  "Desktop self-hosting guide label must match Web and Android",
);
assert.match(desktopLoginSource, /bridge\(\)\.app\.openExternal/, "Desktop login local-trial action must use the desktop shell bridge to open the guide");
assert.match(desktopIpcSource, /shell\.openExternal/, "Desktop IPC must expose a controlled external-guide open action");

assert.match(desktopI18nSource, /"floating\.feedbackAddedInbox"/, "Desktop floating quick add must explain when a future task is added outside the Today list");
assert.match(desktopFloatingStoreSource, /floating\.feedbackAddedInbox/, "Desktop floating quick add must use the inbox feedback for non-today tasks");
assert.match(desktopFloatingStoreSource, /task\.listType === "today"/, "Desktop floating quick add must decide feedback from the saved task destination");
assert.match(desktopFloatingStoreSource, /task\.plannedDate|task\.dueTime/, "Desktop floating quick add must mention scheduled task timing when it leaves the floating Today list");

assert.doesNotMatch(readmeSource, /### 先判断你是哪一种用户/, "README ordinary-user quick start must not repeat the same three entry choices twice");
assert.doesNotMatch(desktopI18nSource, /"auth\.firstUseTitle": \{ "zh-CN": "先判断你是哪一种用户"/, "Desktop login first-use title should be action-oriented, not another persona checklist");
assertOrder(androidLoginSource, "label = strings.language", "SignInPanel(", "Android login must expose language switching before sign-in controls");
assertOrder(androidLoginSource, "SignInPanel(", "FirstUseGuide(strings = strings)", "Android login must keep optional first-use guidance after sign-in controls");
assert.doesNotMatch(androidLoginSource, /FirstUseGuide[\s\S]{0,1200}label = strings\.language/, "Android login must not bury language switching inside the sign-in panel");
assert.match(androidRegisterSource, /AppDropdownField\([\s\S]{0,260}label = strings\.language[\s\S]{0,520}FirstUseGuide/, "Android registration must expose language switching before first-use guidance");
assert.doesNotMatch(androidRegisterSource, /FirstUseGuide[\s\S]{0,1200}label = strings\.language/, "Android registration must not bury language switching inside the connection panel");
assert.match(androidMainActivitySource, /val targetRoute = widgetLaunchTarget\?\.toRoute\(\) \?: Routes\.Today/, "Android authenticated startup should land on Today by default");
assert.match(androidMainActivitySource, /val startDestination = remember\(navController\) \{[\s\S]{0,100}if \(token\.isNullOrBlank\(\)\) Routes\.Login else Routes\.Today/, "Android authenticated startup must build the navigation graph directly on Today without rebuilding it on later token changes");
assert.match(androidMainActivitySource, /NavHost\(navController = navController, startDestination = startDestination\)/, "Android navigation host must use the resolved authentication start destination");
assert.match(androidMainActivitySource, /val sharedTextHandled = savedInstanceState\?\.getBoolean\(SHARED_TEXT_HANDLED_STATE_KEY\) == true/, "Android activity recreation must restore whether shared text was already handled");
assert.match(androidMainActivitySource, /if \(!sharedTextHandled\) loadSharedText\(intent\)/, "Android activity recreation must not replay a handled share intent over restored editor state");
assert.match(androidMainActivitySource, /override fun onSaveInstanceState\(outState: Bundle\)[\s\S]{0,500}sharedTextState\?\.value == null/, "Android activity recreation must preserve whether shared text has already been consumed");
assert.match(androidMainActivitySource, /viewModel\.updateContent\(draft\.content\)[\s\S]{0,120}sharedTextState\.value = null/, "Android shared text must be consumed after it is applied to the editor");
assert.match(androidMainActivitySource, /onLoginSuccess = \{[\s\S]{0,120}navController\.navigateAfterAuthentication\(Routes\.Today\)/, "Android sign-in should land on Today, matching the desktop default");
assert.match(androidMainActivitySource, /onRegisterSuccess = \{[\s\S]{0,120}navController\.navigateAfterAuthentication\(Routes\.Today\)/, "Android registration should land on Today, matching the sign-in path");
assert.match(
  androidMainActivitySource,
  /fun NavHostController\.navigateAfterAuthentication[\s\S]{0,220}navigate\(Routes\.Today\)[\s\S]{0,160}popUpTo\(graph\.id\) \{ inclusive = true \}/,
  "Android authenticated navigation must clear auth history and establish Today as the root destination",
);
assert.match(webAppSource, /view:\s*"today"/, "Web default task view should land on Today, matching desktop and Android");
assert.doesNotMatch(webHtmlSource, /data-i18n="auth\.setupChecklistTitle"|class="setup-checklist"/, "Web first-use screen must not render a setup checklist before sign-in");
assert.match(webAppSource, /"auth\.setupChecklistTitle": "推荐顺序"/, "Web i18n may keep setup checklist copy for guide pages or fallback text");
assert.match(webAppSource, /"auth\.setupChecklistTitle": "Recommended order"/, "Web i18n may keep setup checklist English copy for guide pages or fallback text");
assert.match(webStylesSource, /\.first-run-details/, "Web first-use optional server help must have dedicated disclosure styling");
assert.doesNotMatch(webStylesSource, /\.first-run-details\s+\.first-run-details/, "Web first-use styling must not depend on nested Docker and self-hosting disclosures");
assert.match(webHtmlSource, /data-i18n="task\.scheduleHelp"/, "Web task form must explain plan date, due time, and reminder together");
assert.match(webAppSource, /"task\.scheduleHelp"/, "Web i18n must define task scheduling helper copy");
assert.match(webHtmlSource, /data-i18n="app\.syncDecision"/, "Web workspace must translate sync diagnostics into a user decision summary");
assert.match(webAppSource, /"app\.syncDecision"/, "Web i18n must define the sync decision summary");
assert.match(webHtmlSource, /id="syncNextStep"/, "Web sync status must show the user's next step, not only the current state");
assert.match(webHtmlSource, /data-i18n="app\.syncNextStep"/, "Web sync next-step copy must be language-switchable");
assert.match(webAppSource, /"app\.syncNextStep"/, "Web i18n must define default sync next-step copy");
assert.match(webAppSource, /"sync\.nextStepReady"/, "Web i18n must define the ready sync next step");
assert.match(webAppSource, /"sync\.nextStepNeedsCheck"/, "Web i18n must define the needs-attention sync next step");
assert.match(webAppSource, /function getSyncHealthNextStepText\(/, "Web sync status must derive next-step copy through a focused helper");
assert.match(webAppSource, /nodes\.syncNextStep\.textContent = getSyncHealthNextStepText\(status\)/, "Web renderSyncStatus must update the visible next step");
assert.match(webHtmlSource, /data-i18n="app\.localDataSafetyHint"/, "Web local-data tools must explain what to check before clearing this device");
const webSupportToolsSourceForDataSplit = sourceBetween(webHtmlSource, '<details id="supportDataTools"', '</details><!-- supportDataTools -->');
assert.match(webHtmlSource, /id="supportDataTools"[\s\S]*id="syncAdvancedDiagnostics"[\s\S]*id="developerDiagnostics"/, "Web sync support disclosure must keep sync details before technical diagnostics");
assert.doesNotMatch(webSupportToolsSourceForDataSplit, /id="localDataTools"/, "Web local data and backups must not be buried inside the sync support disclosure");
assertOrder(
  webHtmlSource,
  '</details><!-- supportDataTools -->',
  'id="localDataTools"',
  "Web local data and backups must be a separate ordinary-user section after sync support",
);
assert.match(webHtmlSource, /<details id="supportDataTools" class="sidebar-details support-tools-panel">/, "Web sync support and diagnostics tools must be collapsed by default behind one disclosure");
assert.match(webAppSource, /nodes\.supportDataTools\.open = true/, "Web sync-support shortcut must open the collapsed support disclosure before scrolling");
assert.doesNotMatch(desktopI18nSource, /"auth\.setupChecklistTitle"/, "Desktop i18n must remove setup-order copy after moving setup guidance into dedicated help surfaces");
assert.doesNotMatch(desktopLoginSource, /auth\.setupChecklistTitle|class="setup-checklist"/, "Desktop login must not render a setup checklist in the ordinary sign-in path");
assert.match(desktopI18nSource, /"task\.scheduleHelp"/, "Desktop task editor must define plan/due/reminder helper copy");
assert.match(desktopTaskEditorSource, /task\.scheduleHelp/, "Desktop task editor must show plan/due/reminder helper copy near scheduling fields");
assert.match(desktopI18nSource, /"task\.arrangementSettings": \{ "zh-CN": "时间与安排", "en-US": "Time and schedule" \}/, "Desktop optional scheduling details must match the Android arrangement label");
assert.match(desktopI18nSource, /"task\.moreSettings": \{ "zh-CN": "更多：标签、重复、模板", "en-US": "More: tags, repeat, templates" \}/, "Desktop optional metadata details must name the secondary concepts");
assert.match(desktopI18nSource, /"task\.hideSettings": \{ "zh-CN": "收起更多", "en-US": "Hide more" \}/, "Desktop optional task details collapse copy must match the shorter More label");
assert.match(desktopI18nSource, /"settings\.syncAtAGlance"/, "Desktop settings must define a user-facing sync-at-a-glance label");
assert.match(desktopSettingsDataPanelSource, /settings\.syncAtAGlance/, "Desktop data settings must show sync status before diagnostics");
assert.match(desktopI18nSource, /"settings\.syncNextStep"/, "Desktop settings must define a user-facing sync next-step label");
assert.match(desktopI18nSource, /"settings\.syncNextStepNone"/, "Desktop settings must define no-action sync next-step copy");
assert.match(desktopI18nSource, /"settings\.syncNextStepReview"/, "Desktop settings must define review-needed sync next-step copy");
assert.match(desktopI18nSource, /"settings\.localDataTrust"/, "Desktop settings must explain the local-data/server-data boundary");
assert.match(desktopSettingsDataPanelSource, /const syncNextStepText = computed/, "Desktop data settings must derive sync next-step copy");
assert.match(desktopSettingsDataPanelSource, /settings\.syncNextStep/, "Desktop data settings must render the sync next-step label");
assert.match(desktopSettingsDataPanelSource, /settings\.localDataTrust/, "Desktop data settings must render local-data trust copy before destructive actions");
assert.match(desktopI18nSource, /"settings\.dataTools"/, "Desktop settings must define one user-facing data-tools disclosure label");
assert.match(desktopI18nSource, /"settings\.dataSession": \{ "zh-CN": "数据与备份", "en-US": "Data and backups" \}/, "Desktop settings must separate data/backups from account session wording");
assert.match(desktopI18nSource, /"settings\.dataTools": \{ "zh-CN": "备份与本机数据", "en-US": "Backups and local data" \}/, "Desktop settings data disclosure must describe the contained backup and local-data tools");
assert.match(desktopI18nSource, /"settings\.diagnosticsSupportTools": \{ "zh-CN": "技术信息（排查时使用）", "en-US": "Technical information \(for troubleshooting\)" \}/, "Desktop diagnostics tools must present technical details as secondary support information");
assert.match(desktopSettingsDataPanelSource, /class="settings-advanced-details settings-data-advanced-tools"/, "Desktop backup, session, and update tools must sit behind one optional data-tools disclosure");
assert.match(desktopI18nSource, /"settings\.clearLocalDataSafetyHint"/, "Desktop settings must define clear-this-device safety guidance");
assert.match(desktopSettingsDataPanelSource, /settings\.clearLocalDataSafetyHint/, "Desktop data settings must show safety guidance near clear-this-device");
assertOrder(androidLoginSource, "TextButton(onClick = { detailsOpen = !detailsOpen })", "strings.localTrialHelp", "Android login must keep no-server help behind one optional action");
assertOrder(androidRegisterSource, "TextButton(onClick = { detailsOpen = !detailsOpen })", "strings.localTrialHelp", "Android register must keep no-server help behind one optional action");
assertOrder(androidLoginSource, "strings.localTrialHelp", "strings.selfHostGuide", "Android login no-server help must explain local trial before self-hosting");
assertOrder(androidRegisterSource, "strings.localTrialHelp", "strings.selfHostGuide", "Android register no-server help must explain local trial before self-hosting");
assert.match(androidI18nSource, /taskScheduleHelp = "计划日期表示哪天要做；截止时间表示最晚完成时间；提醒时间只负责通知。"/, "Android task editor must explain plan date, due time, and reminder together");
assert.match(androidEditorSource, /strings\.taskScheduleHelp/, "Android task editor must render schedule helper copy from i18n");
assert.match(androidEditorSource, /strings\.taskArrangementSettings/, "Android arrangement toggle must clearly describe scheduling and placement fields");
assert.match(androidEditorSource, /strings\.taskHideArrangementSettings/, "Android arrangement collapse copy must match the scheduling label");
assert.match(androidEditorSource, /bodyOpen/, "Android task editor must keep notes and checklist in their own disclosure, matching Web and desktop");
assert.match(androidEditorSource, /BodyTaskFieldsPanel\(/, "Android task editor must render notes and checklist through a focused body-details panel");
assert.match(androidEditorSource, /strings\.taskBodyDetails/, "Android task editor must show the same notes/checklist disclosure label as Web and desktop");
assert.match(androidEditorSource, /strings\.taskHideBodyDetails/, "Android task editor must show a matching collapse label for notes/checklist");
assert.match(androidEditorSource, /ArrangementTaskFieldsPanel\(/, "Android task editor must keep scheduling and placement fields in the arrangement panel");
assert.match(androidI18nSource, /moreSettings = "更多：标签、重复、模板"/, "Android optional metadata must name the secondary concepts in Chinese");
assert.match(androidI18nSource, /moreSettings = "More: tags, repeat, templates"/, "Android optional metadata must name the secondary concepts in English");
assert.match(androidI18nSource, /hideSettings = "收起更多"/, "Android optional metadata collapse copy must match the shorter More label in Chinese");
assert.match(androidI18nSource, /hideSettings = "Hide more"/, "Android optional metadata collapse copy must match the shorter More label in English");
assert.match(androidSettingsSource, /settingsSectionStatusText/, "Android settings section navigation must include a short status summary for the selected section");
assert.match(androidSettingsSource, /text = if \(isEnglish\) "Data and backups" else "数据与备份"/, "Android settings data section must be labeled as data and backups");
assert.match(androidSettingsUiPolicySource, /fun syncAtAGlanceText\(/, "Android settings policy must derive sync-at-a-glance copy in one testable helper");
assert.match(androidSettingsUiPolicySource, /fun syncNextStepText\(/, "Android settings policy must derive sync next-step copy in one testable helper");
assert.match(androidSettingsUiPolicySource, /fun localDataTrustText\(/, "Android settings policy must explain local-data boundaries in one testable helper");
assert.match(androidSettingsSource, /syncAtAGlanceText\(/, "Android settings screen must render the sync-at-a-glance policy copy");
assert.match(androidSettingsSource, /syncNextStepText\(/, "Android settings screen must render the sync next-step policy copy");
assert.match(androidSettingsSource, /localDataTrustText\(/, "Android settings screen must render local-data trust policy copy");
assert.match(androidSettingsSource, /clearLocalDataSafetyHint/, "Android account settings must explain what to check before clearing this device");

assert.match(webHtmlSource, /id="openTaskCreateButton"/, "Web task workspace must expose a visible new-task action near the task list");
assert.match(webAppSource, /"openTaskCreateButton"/, "Web app must bind the visible new-task action");
assert.match(
  webAppSource,
  /openTaskCreateButton[\s\S]{0,260}openTaskCreatePanel\(\{ focusTitle: true \}\)/,
  "Web visible new-task action must open and focus the nearby task creation panel without forcing a long scroll",
);
assert.match(webHtmlSource, /id="openSyncSupportButton"/, "Web sync status must offer a direct path to sync details");
assert.match(webAppSource, /"app\.openSyncSupport"/, "Web i18n must define the sync-details action label");
assert.match(webAppSource, /function openSyncSupportPanel\(/, "Web app must centralize opening the sync support details");
assert.match(
  webAppSource,
  /openSyncSupportButton[\s\S]{0,260}openSyncSupportPanel\(\)/,
  "Web sync-details action must open the support and sync diagnostics disclosures",
);
assert.match(webAppSource, /"task\.moreActions": "操作"/, "Web task row secondary menu must be labeled as actions in Chinese");
assert.match(webAppSource, /"task\.moreActions": "Actions"/, "Web task row secondary menu must be labeled as actions in English");
assert.match(desktopI18nSource, /"task\.moreActions": \{ "zh-CN": "操作", "en-US": "Actions" \}/, "Desktop task row secondary menu must match Web and Android action wording");
assert.match(webAppSource, /"view\.moreFilters": "列表与状态"/, "Web secondary view selector must say what it contains");
assert.match(webAppSource, /"view\.moreFilters": "Lists and status"/, "Web English secondary view selector must say what it contains");
assert.match(desktopI18nSource, /"task\.moreFilters": \{ "zh-CN": "列表与状态", "en-US": "Lists and status" \}/, "Desktop secondary filter selector must say what it contains");
assert.doesNotMatch(webAppSource, /标题以外.*暂不可预览|Fields other than the title/i, "Web conflict fallback must not tell users only title differences are available");
assert.doesNotMatch(desktopI18nSource, /标题以外.*暂不可预览|Only title differences/i, "Desktop conflict fallback must not tell users only title differences are available");
assert.doesNotMatch(androidTaskListSource, /标题以外.*暂不可预览|only title changes/i, "Android conflict fallback must not tell users only title differences are available");
assert.doesNotMatch(androidTaskListSource, /private fun primaryTaskListFilterOptions|private fun moreTaskListFilterOptions|private fun isPrimaryTaskListFilter|private fun isMoreTaskListFilter/, "Android task list must not keep unused split-filter helper functions");
assert.doesNotMatch(
  readmeOrdinaryQuickStart,
  /git clone|docker compose|\.env\.local\.example|WEB_CORS_ORIGINS/,
  "README ordinary-user quick start must not front-load repository commands or environment-file details",
);

const webFirstUseLeadSource = sourceBetween(webHtmlSource, '<section id="authScreen"', '<details id="serverSetupHelp"');
assert.doesNotMatch(
  webFirstUseLeadSource,
  /Docker|127\.0\.0\.1|10\.0\.2\.2|局域网 IP|LAN IP/,
  "Web login first-use lead must keep technical trial/network details behind optional help",
);
assert.doesNotMatch(
  webFirstUseLeadSource,
  /setup-checklist|auth\.setupChecklistTitle|auth\.setupStep/,
  "Web login first-use lead must not front-load the setup checklist before the form",
);
assert.doesNotMatch(
  webFirstRunGuideSource,
  /class="setup-checklist"|id="localTrialGuide"|id="selfHostGuide"/,
  "Web first-use guide should collapse no-server help into one short disclosure without nested setup choices",
);
assert.match(
  webAppSource,
  /"auth\.firstUseTitle": "已有服务器地址就能登录"/,
  "Web first-use title must prioritize the ordinary existing-server path",
);
assert.match(
  webAppSource,
  /"auth\.serverSetupHelp": "没有服务器地址？先确认来源"/,
  "Web no-server disclosure summary must tell users to confirm where the service address should come from",
);
assert.match(
  webAppSource,
  /"auth\.serverSetupHelp": "No server address\? Confirm where it should come from"/,
  "Web English no-server disclosure summary must tell users to confirm where the service address should come from",
);
assert.match(webHtmlSource, /id="authModeSwitch"[^>]*role="group"/, "Web auth mode controls must expose button-group semantics");
assert.match(webHtmlSource, /data-mode="login"[^>]*aria-pressed="true"/, "Web login mode button must expose its pressed state");
assert.match(webHtmlSource, /data-mode="register"[^>]*aria-pressed="false"/, "Web register mode button must expose its pressed state");
const webSupportToolsSource = sourceBetween(webHtmlSource, '<details id="supportDataTools"', '</details><!-- supportDataTools -->');
assert.doesNotMatch(
  webSupportToolsSource,
  /<details/,
  "Web support, data, and sync area must not nest multiple disclosure controls inside one support panel",
);
assert.doesNotMatch(webSupportToolsSource, /id="localDataTools"/, "Web support disclosure must contain only sync issue support and technical diagnostics");
assert.match(webAppSource, /"app\.supportDataTools": "同步问题"/, "Web support disclosure must use sync-problem wording in Chinese after data tools are split out");
assert.match(webAppSource, /"app\.supportDataTools": "Sync issues"/, "Web support disclosure must use sync-problem wording in English after data tools are split out");
assert.match(webAppSource, /"app\.localData": "数据与备份"/, "Web local-data section must be labeled as data and backups in Chinese");
assert.match(webAppSource, /"app\.localData": "Data and backups"/, "Web local-data section must be labeled as data and backups in English");
assert.match(webAppSource, /"app\.diagnostics": "技术信息（排查时使用）"/, "Web diagnostics section must mark technical information as secondary in Chinese");
assert.match(webAppSource, /"app\.diagnostics": "Technical information \(for troubleshooting\)"/, "Web diagnostics section must mark technical information as secondary in English");
assert.match(webHtmlSource, /<details id="taskBodyFields" class="task-body-fields span-2">[\s\S]*id="taskContent"[\s\S]*id="taskChecklist"[\s\S]*<\/details>/, "Web notes and checklist must be available but collapsed behind one optional task-body disclosure");
assertOrder(
  webHtmlSource,
  'id="taskQuickPreview"',
  'id="taskBodyFields"',
  "Web quick-capture form must keep the title and quick preview before optional notes and checklist",
);
assert.match(webHtmlSource, /<details id="taskArrangementFields" class="advanced-task-fields task-arrangement-fields span-2">[\s\S]*task\.arrangementSettings[\s\S]*task\.priority[\s\S]*task\.plannedDate[\s\S]*task\.remindTime[\s\S]*<\/details>/, "Web scheduling and priority fields must sit in a dedicated optional arrangement section");
assert.match(webHtmlSource, /<details id="taskAdvancedFields" class="advanced-task-fields task-metadata-fields span-2">[\s\S]*task\.moreSettings[\s\S]*task\.project[\s\S]*task\.tag[\s\S]*task\.repeat[\s\S]*<\/details>/, "Web tags, project, repeat, and template fields must sit in a separate optional metadata section");
assert.match(webAppSource, /"task\.bodyDetails": "添加备注和清单"/, "Web optional task body disclosure must have clear Chinese copy");
assert.match(webAppSource, /"task\.bodyDetails": "Add notes and checklist"/, "Web optional task body disclosure must have clear English copy");
assert.match(webAppSource, /"task\.arrangementSettings": "时间与安排"/, "Web arrangement section must match Android scheduling wording in Chinese");
assert.match(webAppSource, /"task\.arrangementSettings": "Time and schedule"/, "Web arrangement section must match Android scheduling wording in English");
assert.match(webAppSource, /"task\.moreSettings": "更多：标签、重复、模板"/, "Web optional metadata fields must name the secondary concepts in Chinese");
assert.match(webAppSource, /"task\.moreSettings": "More: tags, repeat, templates"/, "Web optional metadata fields must name the secondary concepts in English");
assert.match(
  webStylesSource,
  /\.task-body-fields:not\(\[open\]\),\s*\.advanced-task-fields:not\(\[open\]\)[\s\S]{0,160}border-color:\s*transparent/,
  "Web collapsed optional task sections must stay visually lightweight until opened",
);
assert.match(
  desktopCssSource,
  /\.advanced-toggle\s*\{[\s\S]{0,180}border-color:\s*transparent/,
  "Desktop collapsed optional task sections must use lightweight toggles instead of heavy form panels",
);
assert.match(webAppSource, /nodes\.taskBodyFields\.open = hasTaskBodyValues\(\)/, "Web editor must reveal notes and checklist automatically when editing an existing task body");
assert.match(webAppSource, /nodes\.taskArrangementFields\.open = hasTaskArrangementValues\(\)/, "Web editor must reveal scheduling fields automatically only when they contain values");
assert.match(webAppSource, /nodes\.taskAdvancedFields\.open = hasTaskMetadataValues\(\)/, "Web editor must reveal metadata fields automatically only when they contain values");
assert.match(webAppSource, /nodes\.taskSyncHealthBar\.hidden = tone === "ready"/, "Web task-list sync health must disappear in the healthy state and only interrupt users when status is unknown or needs attention");
assert.match(webHtmlSource, /class="[^"]*\blocal-data-action-group\b[^"]*\bbackup-action-group\b[^"]*"/, "Web backup actions must be grouped separately from destructive device-clearing actions");
assert.match(webHtmlSource, /class="[^"]*\blocal-data-action-group\b[^"]*\bdanger-zone\b[^"]*\blocal-data-danger-zone\b[^"]*"/, "Web clear-this-device action must sit in a separate danger zone");
assert.match(webAppSource, /"task\.emptyViewHint": "可以先输入一个标题，例如：写周报。需要时再加时间、标签或优先级。"/, "Web empty task state must teach task creation with a plain Chinese title first");
assert.match(webAppSource, /"task\.emptyViewHint": "Start with a title, for example: write weekly report\. Add time, tags, or priority only when needed\."/ , "Web empty task state must teach task creation with a plain English title first");
assert.match(webAppSource, /function hasLocalDataClearRisk\(/, "Web clear-this-device action must derive a risk state from sync diagnostics");
assert.match(webAppSource, /"app\.clearLocalDataBlocked"/, "Web clear-this-device action must explain when sync risk blocks clearing");
assert.match(
  webAppSource,
  /async function clearLocalDeviceData\(\)[\s\S]{0,420}hasLocalDataClearRisk\(\)/,
  "Web clear-this-device action must check sync risk before the destructive confirmation",
);
assert.match(
  desktopSettingsDataPanelSource,
  /clearLocalDataBlocked/,
  "Desktop data settings must receive a blocked state for clearing this device",
);
assert.match(
  desktopSettingsDataPanelSource,
  /:disabled="clearLocalDataBlocked"/,
  "Desktop clear-this-device button must be disabled while local sync risk exists",
);
assert.match(
  androidSettingsSource,
  /val clearLocalDataBlocked = recoverableSyncIssueCount > 0 \|\| conflictTaskCount > 0/,
  "Android clear-this-device action must derive a blocked state from sync diagnostics",
);
assert.match(
  androidSettingsSource,
  /enabled = !clearLocalDataBlocked/,
  "Android clear-this-device button must be disabled while local sync risk exists",
);
assert.match(
  desktopI18nSource,
  /"sync\.useServer": \{ "zh-CN": "保留同步来的版本", "en-US": "Keep synced version" \}/,
  "Desktop conflict action copy must use the same synced-version wording as Web and Android",
);
assert.match(
  desktopI18nSource,
  /"sync\.overwriteServer": \{ "zh-CN": "保留这台设备版本", "en-US": "Keep this device version" \}/,
  "Desktop conflict overwrite copy must state the result instead of cloud overwrite jargon",
);
assert.match(
  androidTaskListSource,
  /keepServerVersion|keepDeviceVersion/,
  "Android conflict actions must keep stable decision hooks for user choices",
);
assert.match(
  androidI18nSource,
  /keepServerVersion = "保留同步来的版本"/,
  "Android Chinese legacy keepServerVersion copy must still show the user-facing synced-version wording",
);
assert.match(
  androidI18nSource,
  /keepServerVersion = "Keep synced version"/,
  "Android English legacy keepServerVersion copy must still show the user-facing synced-version wording",
);
assert.doesNotMatch(
  readmeOrdinaryQuickStart,
  /Android 模拟器|10\.0\.2\.2|局域网 IP/,
  "README ordinary-user quick start must move emulator and LAN address details out of the main path",
);

const webNormalizeServerBaseUrlSource = sourceBetween(
  webAppSource,
  "function normalizeServerBaseUrl(value)",
  "function restoreTaskListPreferences()",
);
assert.match(
  webNormalizeServerBaseUrlSource,
  /if \(!trimmed\) throw new ValidationError\("validation\.serverUrlRequired"\)/,
  "Web server URL normalization must reject blank user input instead of silently using localhost",
);
assert.doesNotMatch(
  webNormalizeServerBaseUrlSource,
  /if \(!trimmed\) return DEFAULT_SERVER_BASE_URL/,
  "Web blank server URL must not fall back to the local default",
);
const webNormalizeApiBaseUrlSource = sourceBetween(
  webAppSource,
  "function normalizeApiBaseUrl(value)",
  "function deriveApiBaseUrlFromServer(value)",
);
assert.match(
  webNormalizeApiBaseUrlSource,
  /if \(!trimmed\) throw new ValidationError\("validation\.apiUrlRequired"\)/,
  "Web API URL normalization must reject blank values instead of silently using localhost",
);
assert.doesNotMatch(
  webNormalizeApiBaseUrlSource,
  /if \(!trimmed\) return DEFAULT_API_BASE_URL/,
  "Web blank advanced API URL must not fall back to the local default",
);
assert.match(
  webAppSource,
  /function resolveApiBaseUrlForInput\([\s\S]{0,220}deriveApiBaseUrlFromServer\(serverBaseUrl\)/,
  "Web saved blank advanced API URL must be regenerated from the visible server URL",
);
assert.match(webAppSource, /"validation\.apiUrlRequired"/, "Web i18n must explain that the advanced request URL is required when normalized directly");
assert.match(webAppSource, /"validation\.serverUrlRequired"/, "Web i18n must explain that the server address is required");
assert.doesNotMatch(
  webHtmlSource,
  /id="serverBaseUrl"[\s\S]{0,220}placeholder="http:\/\/127\.0\.0\.1:8000"/,
  "Web server URL placeholder must not steer ordinary users toward localhost",
);
assert.match(
  webHtmlSource,
  /id="serverBaseUrl"[\s\S]{0,220}placeholder="填写管理员给你的服务器地址"/,
  "Web server URL placeholder must tell ordinary users what to enter",
);
assert.match(
  webAppSource,
  /"auth\.serverUrlPlaceholder": "填写管理员给你的服务器地址"/,
  "Web i18n must define a user-facing server address placeholder",
);
assert.match(
  webAppSource,
  /const DEFAULT_SERVER_BASE_URL = supportsHttpOrigin\(\) \? location\.origin : LOCAL_FALLBACK_SERVER_BASE_URL/,
  "Web first-run server address must use the current HTTP or HTTPS origin when same-origin proxying is available",
);
assert.match(
  webAppSource,
  /const INITIAL_SERVER_BASE_URL = readStoredString\([\s\S]{0,120}"serverBaseUrl",[\s\S]{0,120}deriveServerBaseUrlFromApi\(INITIAL_API_BASE_URL\)/,
  "Web must prefer a previously saved server address over the first-run same-origin default",
);
assert.match(
  webAppSource,
  /"auth\.serverUrlHint": "填写 TaskBridge 服务器地址即可；本机或内网可以使用 http:\/\/，高级连接设置会自动生成。"/,
  "Web server URL hint must tell users HTTP is valid for local or LAN setups",
);
assertOrder(
  webHtmlSource,
  'data-i18n="app.views"',
  'id="supportDataTools"',
  "Web sidebar must put normal navigation before support and diagnostics tools",
);
assertOrder(
  webHtmlSource,
  'data-i18n="app.stats"',
  'id="supportDataTools"',
  "Web sidebar support tools must be after stats instead of the first account panel content",
);
assert.match(webAppSource, /function updateAuthActionPriority\(/, "Web auth screen must centralize login/check button priority");
assert.match(
  webAppSource,
  /function isConnectionReadyForAuth\(/,
  "Web auth submit must still derive whether the automatic connection check passed",
);
assert.match(
  webAppSource,
  /authSubmitButton\.className\s*=\s*"primary-button"/,
  "Web login/register button must stay primary because submit automatically verifies the connection",
);
assert.match(
  webAppSource,
  /testConnectionButton\.className\s*=\s*"secondary-button"/,
  "Web connection-test button must stay secondary as a troubleshooting action",
);
const webAuthSubmitHandlerSource = sourceBetween(
  webAppSource,
  'nodes.authForm.addEventListener("submit"',
  'nodes.testConnectionButton.addEventListener("click"',
);
assert.match(webAppSource, /async function ensureConnectionReadyForAuth\(\)/, "Web auth submit must have a focused connection readiness guard");
assert.match(
  webAuthSubmitHandlerSource,
  /const connectionReady = await ensureConnectionReadyForAuth\(\);[\s\S]{0,120}if \(!connectionReady\) return;/,
  "Web login/register submit must automatically test the connection before authenticating",
);
assert.match(
  webAppSource,
  /async function testConnection\(\)[\s\S]{0,900}return isConnectionReadyForAuth\(\);[\s\S]{0,700}catch \(error\)[\s\S]{0,700}return false;/,
  "Web connection test must return a boolean result for auth gating",
);
assertOrder(
  webHtmlSource,
  '<details id="taskArrangementFields"',
  '<div class="task-quick-fields',
  "Web task form must keep priority, plan date, due time, and reminder behind the arrangement disclosure",
);
const webArrangementTaskFieldsSource = sourceBetween(
  webHtmlSource,
  '<details id="taskArrangementFields"',
  "</details>",
);
assert.match(
  webArrangementTaskFieldsSource,
  /id="taskPriority"|id="taskPlannedDate"|id="taskDueTime"|id="taskRemindTime"/,
  "Web arrangement section should contain optional scheduling and priority fields so quick capture stays light",
);
const webAdvancedTaskFieldsSource = sourceBetween(
  webHtmlSource,
  '<details id="taskAdvancedFields"',
  "</details>",
);
assert.doesNotMatch(
  webAdvancedTaskFieldsSource,
  /id="taskPriority"|id="taskPlannedDate"|id="taskDueTime"|id="taskRemindTime"/,
  "Web metadata section must not mix scheduling fields with tags, repeat, and templates",
);

const desktopLoginNormalizeServerUrlSource = sourceBetween(
  desktopConnectionEndpointsSource,
  "function normalizeServerUrl(value: string): string",
  "export function deriveConnectionEndpoints",
);
assert.match(
  desktopLoginNormalizeServerUrlSource,
  /if \(!trimmed\) throw new Error\("server_url_required"\)/,
  "Desktop login must reject a blank server URL instead of silently using localhost",
);
assert.doesNotMatch(
  desktopLoginNormalizeServerUrlSource,
  /if \(!trimmed\) return "http:\/\/127\.0\.0\.1:8000"/,
  "Desktop login blank server URL must not fall back to localhost",
);
const desktopSettingsNormalizeServerUrlSource = sourceBetween(
  desktopConnectionEndpointsSource,
  "function normalizeServerUrl(value: string): string",
  "export function deriveConnectionEndpoints",
);
assert.match(
  desktopSettingsNormalizeServerUrlSource,
  /if \(!trimmed\) throw new Error\("server_url_required"\)/,
  "Desktop settings must reject a blank server URL instead of silently using localhost",
);
assert.match(desktopI18nSource, /"settings\.serverUrlRequired"/, "Desktop settings i18n must define the blank server URL error");
assert.match(desktopI18nSource, /"auth\.serverUrlRequired"/, "Desktop login i18n must define the blank server URL error");
assert.doesNotMatch(
  desktopLoginSource,
  /authPrimaryActionReady/,
  "Desktop login action priority must not depend on a prior manual connection check",
);
assert.match(
  desktopLoginSource,
  /class="secondary-button"[\s\S]{0,420}checkAndSaveConnection/,
  "Desktop connection test action must stay secondary",
);
assert.match(
  desktopLoginSource,
  /class="primary-button" type="submit"/,
  "Desktop login/register action must stay primary because submit automatically verifies the connection",
);
assert.match(desktopTaskViewSource, /const selectedTaskIds = ref<Set<string>>/, "Desktop task view must own explicit selected task ids");
assert.match(desktopTaskViewSource, /function setTaskSelected\(/, "Desktop task view must update selected tasks through a focused handler");
assert.match(
  desktopTaskViewSource,
  /const bulkActionTargets = computed\(\(\) => selectableOpenTasks\.value\.filter\(\(task\) => selectedTaskIds\.value\.has\(task\.localId\)\)\)/,
  "Desktop bulk actions must target selected tasks, not every visible task",
);
assert.doesNotMatch(
  desktopTaskViewSource,
  /bulkActionTargets = computed\(\(\) =>[\s\S]{0,220}openFilteredTasks\.value\.filter\(\(task\) => !task\.isTemplate\)/,
  "Desktop bulk actions must not automatically select all open visible tasks",
);
assert.match(desktopTaskItemSource, /selectable\?: boolean/, "Desktop task item must accept a selectable prop");
assert.match(desktopTaskItemSource, /selected\?: boolean/, "Desktop task item must accept a selected prop");
assert.match(desktopTaskItemSource, /"selection-change": \[task: TaskRecord, selected: boolean\]/, "Desktop task item must emit explicit selection changes");
assert.match(desktopTaskItemSource, /class="task-selection-checkbox"/, "Desktop task item must render a checkbox for bulk selection");
assert.match(desktopTaskListSectionSource, /selectedTaskIds: Set<string>/, "Desktop list sections must receive selected task ids");
assert.match(desktopTaskListSectionSource, /selection-change/, "Desktop list sections must forward selection changes");
assert.match(
  desktopTaskViewSource,
  /filter\.value === "trash"\s*\?\s*filteredTasks\.value/,
  "Desktop trash view must support explicit selection instead of disabling all batch actions",
);
assert.match(desktopTaskViewSource, /async function restoreSelectedTrashTasks\(/, "Desktop trash view must support restoring selected tasks");
assert.match(desktopTaskViewSource, /async function purgeSelectedTrashTasks\(/, "Desktop trash view must support permanently deleting selected tasks");
assert.match(desktopTaskStoreSource, /async function batchRestore\(/, "Desktop task store must expose batch restore for trash recovery");
assert.match(desktopTaskStoreSource, /async function batchPurge\(/, "Desktop task store must expose batch purge for trash cleanup");
const desktopRestoreSelectedTrashTasks = sourceBetween(
  desktopTaskViewSource,
  "async function restoreSelectedTrashTasks(): Promise<void> {",
  "\n}\n\nasync function purgeSelectedTrashTasks",
);
assert.match(desktopRestoreSelectedTrashTasks, /taskStore\.batchRestore/, "Desktop selected trash restore should run directly after selection");
assert.doesNotMatch(desktopRestoreSelectedTrashTasks, /requestConfirmation/, "Desktop selected trash restore must not add a low-risk confirmation dialog");
assert.match(desktopTaskViewSource, /task\.purgeSelectedConfirm/, "Desktop selected trash purge must use localized confirmation copy");
assert.match(desktopI18nSource, /"task\.restoreSelectedTrash"/, "Desktop i18n must include selected trash restore copy");
assert.match(desktopI18nSource, /"task\.purgeSelectedTrash"/, "Desktop i18n must include selected trash purge copy");
assert.match(webAppSource, /selectedTrashTaskIds/, "Web trash view must keep explicit selected task ids for batch actions");
assert.match(webAppSource, /function renderTrashBulkActions\(/, "Web trash view must render a batch action toolbar");
assert.match(webAppSource, /async function restoreSelectedTrashTasks\(/, "Web trash view must support restoring selected tasks");
assert.match(webAppSource, /async function purgeSelectedTrashTasks\(/, "Web trash view must support permanently deleting selected tasks");
assert.match(webAppSource, /task\.restoreSelectedTrash/, "Web selected trash restore must use localized copy");
assert.match(webAppSource, /task\.purgeSelectedTrash/, "Web selected trash purge must use localized copy");
assertOrder(
  desktopTaskEditorSource,
  'advanced-toggle',
  'class="task-editor-plan-fields"',
  "Desktop task editor must keep priority and scheduling fields behind More settings",
);
const desktopPrimaryPlanFieldsSource = sourceBetween(
  desktopTaskEditorSource,
  'settingsStore.t("task.content")',
  'advanced-toggle',
);
assert.doesNotMatch(
  desktopPrimaryPlanFieldsSource,
  /task\.list|task\.plan|task\.due|task\.reminder|task\.priority/,
  "Desktop task editor quick-capture area must not front-load scheduling and priority fields",
);
const desktopOptionalPlanFieldsSource = sourceBetween(
  desktopTaskEditorSource,
  '<div class="task-editor-plan-fields">',
  '</div>\n      <p class="editor-hint"',
);
assert.match(
  desktopOptionalPlanFieldsSource,
  /task\.list/,
  "Desktop task editor must keep task location/category available in optional arrangement fields",
);
const desktopAdvancedFieldsSource = sourceBetween(
  desktopTaskEditorSource,
  '<section v-if="detailsOpen" id="task-editor-more-fields" class="advanced-fields">',
  '<div class="form-actions">',
);
assert.match(
  desktopAdvancedFieldsSource,
  /task\.tag/,
  "Desktop More settings should contain secondary metadata after the quick-capture fields",
);
assert.doesNotMatch(desktopAdvancedFieldsSource, /task\.list|task\.plan|task\.due|task\.reminder|task\.priority/, "Desktop More settings should not mix scheduling fields with secondary metadata");
assert.match(desktopTaskEditorSource, /const arrangeOpen = ref\(false\)/, "Desktop task editor must own a dedicated arrangement disclosure state");
assert.match(desktopTaskEditorSource, /const bodyOpen = ref\(false\)/, "Desktop task editor must own a dedicated notes/checklist disclosure state");
assert.match(desktopTaskEditorSource, /bodyOpen\.value = Boolean\(task && hasTaskBodyFields\(task\)\)/, "Desktop task editor must reveal notes and checklist automatically when editing tasks that use them");
assert.match(desktopTaskEditorSource, /arrangeOpen\.value = Boolean\(task && hasArrangementFields\(task\)\)/, "Desktop task editor must reveal scheduling fields automatically when editing tasks that use them");
assert.match(desktopTaskEditorSource, /settingsStore\.t\("task\.bodyDetails"\)/, "Desktop task editor must label optional notes and checklist through i18n");
assert.match(desktopTaskEditorSource, /settingsStore\.t\("task\.arrangementSettings"\)/, "Desktop task editor must label the scheduling section consistently with Android");
assert.match(desktopI18nSource, /"task\.bodyDetails": \{ "zh-CN": "添加备注和清单", "en-US": "Add notes and checklist" \}/, "Desktop i18n must define optional notes/checklist copy");
assert.match(desktopI18nSource, /"task\.arrangementSettings": \{ "zh-CN": "时间与安排", "en-US": "Time and schedule" \}/, "Desktop i18n must define arrangement copy that matches Android");
assert.match(desktopI18nSource, /"task\.moreSettings": \{ "zh-CN": "更多：标签、重复、模板", "en-US": "More: tags, repeat, templates" \}/, "Desktop optional task metadata must name the secondary concepts");
assert.doesNotMatch(
  sourceBetween(desktopTaskEditorSource, "function hasAdvancedMetadataFields", "</script>"),
  /task\.listType !== "inbox"/,
  "Desktop Today location must not force the metadata More settings open after location is moved to arrangement",
);
assert.doesNotMatch(
  desktopI18nSource,
  /Object\.assign\(messages/,
  "Desktop i18n must keep final copy in the main message table instead of hidden post-definition overrides",
);
assert.match(
  desktopI18nSource,
  /"auth\.firstUseTitle": \{ "zh-CN": "已有服务器地址就能登录", "en-US": "Sign in with a server address" \}/,
  "Desktop login first-use title must be defined once with the final ordinary-user copy",
);
assert.match(
  desktopSettingsSource,
  /settings\.navSyncRecovery[\s\S]{0,260}sectionId: "sync-recovery"[\s\S]{0,160}settings\.syncRecoveryCenter/,
  "Desktop settings navigation must include a direct sync recovery/support entry",
);
assert.match(
  desktopSettingsSource,
  /id="settings-sync-recovery"/,
  "Desktop settings must expose an anchor for sync recovery/support details",
);
assert.match(desktopSettingsSource, /nextTick/, "Desktop settings sync recovery jump must wait for the opened details to render");
assert.match(desktopSettingsSource, /const syncDiagnosticsOpen = ref\(false\)/, "Desktop settings must own sync diagnostics disclosure state");
assert.match(
  desktopSettingsSource,
  /sectionId === "sync-recovery"[\s\S]{0,180}syncDiagnosticsOpen\.value = true/,
  "Desktop sync recovery navigation must open the diagnostics disclosure before scrolling",
);
assert.match(
  desktopSettingsSource,
  /:open="syncDiagnosticsOpen"/,
  "Desktop sync diagnostics details must bind to the navigation-controlled open state",
);
assert.match(
  desktopSettingsSource,
  /function handleSyncDiagnosticsToggle\(event: Event\)/,
  "Desktop settings must keep sync diagnostics manual toggles in sync through a typed handler",
);
assert.match(
  desktopSettingsSource,
  /@toggle="handleSyncDiagnosticsToggle"/,
  "Desktop sync diagnostics details must keep manual toggles in sync",
);

assert.match(
  androidTokenDataStoreSource,
  /fun requireServerBaseUrlForUserInput\(serverBaseUrl: String\): String/,
  "Android must have a user-input server URL validator that rejects blank values",
);
assert.match(
  androidTokenDataStoreSource,
  /if \(raw\.isBlank\(\)\) throw IllegalArgumentException\("server url required"\)/,
  "Android user-input server URL validator must reject blank input",
);
assert.match(
  androidTokenDataStoreSource,
  /fun deriveNetworkEndpoints\(serverBaseUrl: String\): NetworkEndpoints \{[\s\S]{0,120}requireServerBaseUrlForUserInput\(serverBaseUrl\)/,
  "Android deriveNetworkEndpoints must use the strict user-input validator",
);
assertOrder(
  androidEditorSource,
  "TextButton(onClick = { arrangeOpen = !arrangeOpen }",
  "ArrangementTaskFieldsPanel(",
  "Android task editor must keep priority and scheduling fields behind an optional arrangement toggle",
);
const androidAdvancedEditorSource = sourceBetween(
  androidEditorSource,
  "if (advancedOpen) {",
  "state.error?.let",
);
const androidArrangementEditorSource = sourceBetween(
  androidEditorSource,
  "if (arrangeOpen) {",
  "TextButton(onClick = { advancedOpen = !advancedOpen }",
);
assert.match(
  androidArrangementEditorSource,
  /ArrangementTaskFieldsPanel\(/,
  "Android arrangement section should contain common scheduling fields after the quick-capture fields",
);
assert.match(androidEditorSource, /var listMenuOpen by remember/, "Android task editor must own a task-location dropdown state");
assert.match(
  androidEditorSource,
  /ArrangementTaskFieldsPanel\([\s\S]{0,1400}selectedListLabel[\s\S]{0,1400}onListSelected = viewModel::updateListType/,
  "Android task editor must expose the task location/category in the quick fields panel",
);
assert.match(androidEditorSource, /var bodyOpen by remember\(state\.editingLocalId\)/, "Android editor must own a dedicated optional notes/checklist disclosure state");
assert.match(androidEditorSource, /bodyOpen = !bodyOpen/, "Android editor must let users reveal notes and checklist only when needed");
assert.match(androidEditorSource, /hasTaskBodyFields\(state\)/, "Android editor must reopen notes and checklist when editing a task that already uses them");
assertOrder(
  androidEditorSource,
  "TextButton(onClick = { bodyOpen = !bodyOpen }",
  "BodyTaskFieldsPanel(",
  "Android notes and checklist should appear only after the optional body toggle",
);
assert.match(
  androidEditorSource,
  /label = strings\.list[\s\S]{0,220}options = listOptions/,
  "Android quick fields must label task location/category with localized copy",
);
assert.doesNotMatch(
  androidAdvancedEditorSource,
  /strings\.list|listOptions|updateListType/,
  "Android More settings should keep secondary metadata separate from arrangement controls",
);
assert.match(androidEditorViewModelSource, /fun updateListType\(value: String\)/, "Android editor view model must expose a focused list-type update action");
assert.match(androidEditorViewModelSource, /editorDraftWithListType/, "Android list-type changes must be handled by a pure editor draft helper");
assert.doesNotMatch(androidLoginSource, /connectionReadyForAuth|connectionReadyMessageKey/, "Android login screen priority must not depend on a prior manual connection check");
assert.doesNotMatch(androidRegisterSource, /connectionReadyForAuth|connectionReadyMessageKey/, "Android registration screen priority must not depend on a prior manual connection check");
assert.match(androidLoginSource, /onSignIn = \{ viewModel\.login\(onLoginSuccess\) \}/, "Android login screen must connect the primary sign-in panel to the login action");
assert.match(androidLoginSource, /Button\([\s\S]{0,180}onClick = onSignIn/, "Android sign-in panel must render login as the primary button");
assert.match(androidRegisterSource, /Button\([\s\S]{0,320}viewModel\.register/, "Android create-account button must stay primary because submit automatically verifies the connection");
assert.match(androidLoginSource, /OutlinedButton\([\s\S]{0,260}viewModel\.testConnection/, "Android connection test must stay secondary on login");
assert.match(androidRegisterSource, /OutlinedButton\([\s\S]{0,320}viewModel\.testConnection/, "Android connection test must stay secondary on registration");
const androidLoginActionSource = sourceBetween(
  androidLoginViewModelSource,
  "fun login(onSuccess: () -> Unit) {",
  "private suspend fun ensureConnectionReadyForAuth",
);
assert.match(androidLoginViewModelSource, /fun testConnection\(\)[\s\S]{0,520}ensureConnectionReadyForAuth\(\)/, "Android explicit connection troubleshooting must still probe the configured server");
assertOrder(
  androidLoginActionSource,
  "saveConnectionStateOrReport(connectionState)",
  "authRepository.login",
  "Android login must validate and save the selected endpoint before sending credentials",
);
assert.doesNotMatch(androidLoginActionSource, /ensureConnectionReadyForAuth\(\)/, "Android login must not add a redundant connection probe before the authentication request");
const androidRegisterActionSource = sourceBetween(
  androidRegisterViewModelSource,
  "fun register(onSuccess: () -> Unit) {",
  "private fun applyServerBaseUrlOrReport",
);
assert.match(androidRegisterViewModelSource, /private suspend fun ensureConnectionReadyForAuth\(\): Boolean[\s\S]{0,900}authRepository\.testConnection\(\)/, "Android registration view model must verify the server before auth");
assertOrder(
  androidRegisterActionSource,
  "ensureConnectionReadyForAuth()",
  "authRepository.register",
  "Android registration must test the connection before sending account details",
);
assert.match(androidLoginSource, /KeyboardOptions\(keyboardType = KeyboardType\.Email\)/, "Android login username-or-email field should request an email-friendly keyboard");
assert.match(androidRegisterSource, /KeyboardOptions\(keyboardType = KeyboardType\.Email\)/, "Android registration email field must request the email keyboard");
assert.match(androidTaskListSource, /TaskListPrimaryNavigation\(/, "Android task list must expose Today, All, and Settings as visible navigation controls");
assert.doesNotMatch(androidTaskListSource, /label = if \(isEnglish\) "View" else "视图"/, "Android task list must not hide Today/All behind a View dropdown");
const androidHeaderActionsSource = sourceBetween(
  androidTaskListSource,
  "private fun TaskListHeaderActions",
  "@Composable\n@OptIn(ExperimentalLayoutApi::class)",
);
assert.doesNotMatch(androidHeaderActionsSource, /strings\.settings/, "Android settings must be a visible navigation action, not hidden in More");
assert.match(androidI18nSource, /registerFirstUseTitle = "Create an account with a server address"/, "Android i18n must include an account-creation first-use title");
assert.match(androidRegisterSource, /strings\.registerFirstUseTitle/, "Android registration first-use title must match the account-creation goal");
assert.doesNotMatch(androidRegisterSource, /Sign in with a server address/, "Android registration first-use title must not reuse sign-in copy");
assert.match(androidSettingsSource, /fun timeZoneOptionLabel\(/, "Android settings must format time zones through a user-facing label helper");
assert.doesNotMatch(
  androidSettingsSource,
  /fun label\(isEnglish: Boolean\): String \{\s*return id\s*\}/,
  "Android time zone choices must not expose raw ZoneId values as labels",
);
assert.match(androidSharedTextDraftSource, /data class SharedTextEditorDraft/, "Android shared text handling must use a pure draft model");
assert.match(androidSharedTextDraftSource, /fun sharedTextToEditorDraft\(/, "Android shared text handling must split long text through a pure helper");
assert.match(androidMainActivitySource, /sharedTextToEditorDraft\(text\)/, "Android shared text entry must use the shared text draft helper");
assert.match(androidMainActivitySource, /viewModel\.updateContent\(draft\.content\)/, "Android shared text entry must preserve long shared text in content");
assert.match(androidTaskListSource, /selectedTrashTaskIds/, "Android trash view must keep explicit selected task ids for batch actions");
assert.match(androidTaskListSource, /batchRestoreDeleted\(/, "Android trash view must expose a batch restore action");
assert.match(androidTaskListSource, /batchPurgeDeleted\(/, "Android trash view must expose a batch permanent-delete action");
assert.match(androidTaskListViewModelSource, /fun batchRestoreDeleted\(localIds: List<String>\)/, "Android task list view model must expose batch restore for trash recovery");
assert.match(androidTaskListViewModelSource, /fun batchPurgeDeleted\(localIds: List<String>\)/, "Android task list view model must expose batch purge for trash cleanup");
assert.match(androidTaskRepositorySource, /suspend fun batchRestoreDeleted/, "Android repository must support batch restore for deleted tasks");
assert.match(androidTaskRepositorySource, /suspend fun batchPurgeDeleted/, "Android repository must support batch purge for deleted tasks");
assert.match(androidTaskListSource, /emptyTaskStateUi\(/, "Android empty list UI must use a contextual empty-state policy helper");
assert.match(androidTaskListSource, /EmptyTaskState\([\s\S]{0,260}title = emptyState\.title[\s\S]{0,260}hint = emptyState\.hint/, "Android empty task state must render contextual title and hint copy");

const readmeExistingServerPath = sourceBetween(readmeSource, "## 普通用户快速开始", "### 没有服务器地址");
assert.doesNotMatch(
  readmeExistingServerPath,
  /Docker|docker compose|\.env\.local\.example|10\.0\.2\.2|局域网 IP/,
  "README ordinary existing-server path must not front-load Docker or network setup details",
);
assert.match(
  readmeExistingServerPath,
  /Web\/PWA[\s\S]{0,120}部署者|部署者[\s\S]{0,120}Web\/PWA/,
  "README ordinary existing-server path must explain that Web/PWA access is provided by the deployer",
);
assert.match(
  readmeExistingServerPath,
  /Windows[\s\S]{0,120}Android[\s\S]{0,120}Releases|Releases[\s\S]{0,120}Windows[\s\S]{0,120}Android/,
  "README ordinary existing-server path must keep Windows and Android downloads tied to Releases",
);
assertOrder(
  readmeSource,
  "### 已有服务器地址",
  "### 没有服务器地址",
  "README ordinary quick start must lead with existing-server sign-in before trial or self-hosting paths",
);
const readmeEntrySection = sourceBetween(readmeSource, "## 入口", "## 普通用户快速开始");
assert.doesNotMatch(
  readmeEntrySection,
  /Demo|一键部署|发布与镜像|Roadmap|CONTRIBUTING/,
  "README first entry section must keep developer, release, and contribution links out of the ordinary-user path",
);
assert.match(readmeSource, /## 开发者和自托管说明[\s\S]*Demo 演示/, "README developer/self-hosting section must retain the demo entry");
assert.match(readmeSource, /## 开发者和自托管说明[\s\S]*一键部署/, "README developer/self-hosting section must retain the deployment entry");
assert.match(readmeSource, /## 开发者和自托管说明[\s\S]*发布与镜像/, "README developer/self-hosting section must retain release documentation");
assert.match(readmeSource, /## 开发者和自托管说明[\s\S]*参与贡献/, "README developer/self-hosting section must retain contribution documentation");
assert.match(
  webStylesSource,
  /@media \(max-width: 960px\)[\s\S]{0,180}grid-template-areas:\s*"mobile-actions"\s*"main"\s*"sidebar"/,
  "Web mobile workspace must show quick actions and the primary task workflow before secondary account diagnostics",
);
assert.match(webHtmlSource, /<section id="appScreen" class="workspace" hidden>\s*<nav id="mobileQuickActions"[\s\S]*?<\/nav>\s*<aside id="sidebar"/, "Web mobile quick actions must be a direct workspace grid item");
assert.match(webStylesSource, /--panel-muted:\s*#[0-9a-fA-F]{6}/, "Web technical support tint must use a defined panel-muted token");
assert.doesNotMatch(webHtmlSource, /<section id="syncAdvancedDiagnostics"[\s\S]*?<h4[\s>]/, "Web sync details must not skip from h2 to h4 inside support tools");
assert.doesNotMatch(webHtmlSource, /<section id="developerDiagnostics"[\s\S]*?<h4[\s>]/, "Web technical diagnostics must not skip from h2 to h4 inside support tools");
assert.doesNotMatch(webHtmlSource, /<section id="localDataTools"[\s\S]*?<h4[\s>]/, "Web local data tools must not skip from h2 to h4 inside support tools");
assert.match(webStylesSource, /\.support-tools-panel h3,\s*\.support-tools-section h3/, "Web support-tool headings must share one h3 style rule");
assert.match(webStylesSource, /button,\s*input,\s*textarea,\s*select\s*\{[\s\S]{0,120}min-height:\s*2\.5rem/, "Web interactive controls must use at least a 40px default touch target");
assert.match(desktopCssSource, /button,\s*input,\s*textarea,\s*select\s*\{[\s\S]{0,160}min-height:\s*40px/, "Desktop interactive controls must use at least a 40px default touch target");
assert.match(webHtmlSource, /id="taskFilterSummary"/, "Web task list must expose a visible current-filter summary area");
assert.match(webHtmlSource, /id="taskActiveFilterChips"/, "Web current-filter summary must render filter chips instead of only a compact count line");
assert.match(webHtmlSource, /id="clearTaskFiltersButton"/, "Web current-filter summary must offer one action to clear the active view/search filters");
assertOrder(
  webHtmlSource,
  '<div class="search-row">',
  '<div id="taskFilterSummary"',
  "Web current-filter summary should sit directly after search controls",
);
assertOrder(
  webHtmlSource,
  '<div id="taskFilterSummary"',
  '<ul id="taskList"',
  "Web current-filter summary should appear before the task list it explains",
);
assert.match(webAppSource, /function getActiveTaskFilterLabels\(/, "Web must derive active task filter chips through a focused helper");
assert.match(webAppSource, /function resetTaskListFilters\(/, "Web must clear view and search through one reusable reset helper");
assert.match(webAppSource, /function renderActiveTaskFilters\(/, "Web must render the current-filter summary whenever task state changes");
assert.match(webAppSource, /renderActiveTaskFilters\(\)/, "Web render cycle must refresh the current-filter summary");
assert.match(
  webAppSource,
  /nodes\.clearTaskFiltersButton\.addEventListener\("click",\s*\(\) => \{[\s\S]{0,160}resetTaskListFilters\(\)/,
  "Web clear-filter button must reset all task list filters through the shared helper",
);
assert.match(webStylesSource, /\.active-filter-bar/, "Web active filters must use the same compact filter-bar affordance as other clients");
assert.match(webStylesSource, /\.active-filter-chip/, "Web active filter values must be visually separated as chips");
assert.match(webHtmlSource, /id="taskSyncHealthBar"/, "Web task list must show sync health next to the list, not only in the sidebar");
assert.match(webHtmlSource, /id="taskSyncHealthText"/, "Web task-list sync health must expose a readable status sentence");
assert.match(webHtmlSource, /id="taskSyncHealthActionButton"/, "Web task-list sync health must offer a direct path to sync details");
assertOrder(
  webHtmlSource,
  '<div class="search-row">',
  '<div id="taskSyncHealthBar"',
  "Web task-list sync health should sit immediately after search controls",
);
assertOrder(
  webHtmlSource,
  '<div id="taskSyncHealthBar"',
  '<div id="taskFilterSummary"',
  "Web task-list sync health should appear before filter feedback and the task list",
);
assert.match(webAppSource, /function getTaskSyncHealthText\(/, "Web must derive task-list sync health through a focused helper");
assert.match(webAppSource, /function renderTaskSyncHealthBar\(/, "Web must render task-list sync health whenever task state changes");
assert.match(webAppSource, /renderTaskSyncHealthBar\(\)/, "Web render cycle must refresh the task-list sync health bar");
assert.match(webAppSource, /function shouldShowSyncSupportAction\(/, "Web must centralize when sync detail actions are worth interrupting ordinary users");
assert.match(webAppSource, /nodes\.openSyncSupportButton\.hidden = !shouldShowSyncSupportAction\(\)/, "Web sidebar sync detail action must stay hidden while sync is healthy or not yet checked");
assert.match(webAppSource, /nodes\.taskSyncHealthActionButton\.hidden = !shouldShowSyncSupportAction\(\)/, "Web task-list sync detail action must only appear when there is something to review");
assert.match(webAppSource, /"task\.syncHealthReady"/, "Web i18n must include ready task-list sync health copy");
assert.match(webAppSource, /"task\.syncHealthNeedsReview"/, "Web i18n must include attention-needed task-list sync health copy");
assert.match(webStylesSource, /\.task-sync-health-bar/, "Web task-list sync health bar must have a compact product UI style");
assertOrder(
  webHtmlSource,
  '<section id="syncAdvancedDiagnostics"',
  '<section id="developerDiagnostics"',
  "Web support tools must show sync details before technical diagnostics",
);
assert.match(
  webHtmlSource,
  /<section id="developerDiagnostics" class="support-tools-section technical-support-section">/,
  "Web technical diagnostics must be visually and semantically separated from ordinary sync recovery",
);
assert.match(
  webAppSource,
  /"app\.supportDataTools": "同步问题"/,
  "Web support disclosure must use the same sync-problem mental model as desktop and Android",
);
assert.match(
  webAppSource,
  /"app\.supportDataTools": "Sync issues"/,
  "Web support disclosure must use consistent English sync-problem wording",
);
assert.match(
  webAppSource,
  /"app\.diagnostics": "技术信息（排查时使用）"/,
  "Web diagnostics copy must make technical details feel secondary for ordinary users",
);
assert.match(
  webAppSource,
  /nodes\.syncAdvancedDiagnostics\.scrollIntoView\(\{ block: "start" \}\)/,
  "Web sync health action must focus the sync detail section directly",
);
assert.match(webAppSource, /"sync\.useServerConsequence"/, "Web conflict UI must define visible consequences for keeping the synced version");
assert.match(webAppSource, /"sync\.overwriteServerConsequence"/, "Web conflict UI must define visible consequences for keeping this device's version");
assert.match(webAppSource, /function makeConflictDecisionNote\(/, "Web conflict UI must render consequence notes through a focused helper");
assert.match(webAppSource, /conflict-resolution__decision-list/, "Web conflict UI must show decision consequences next to conflict actions");
assert.doesNotMatch(desktopLoginSource, /showAdvancedConnectionEntry = computed\(\(\) => true\)/, "Desktop login must not show advanced connection settings by default");
assert.match(
  desktopLoginSource,
  /docs\/user-quick-start\.md#%E6%B2%A1%E6%9C%89%E6%9C%8D%E5%8A%A1%E5%99%A8%E5%9C%B0%E5%9D%80/,
  "Desktop login local-trial help must deep-link to the focused no-server quick-start section instead of the README top",
);
const desktopAuthFormSource = sourceBetween(desktopLoginSource, '<form class="auth-form auth-main-form"', '</form>');
assertOrder(
  desktopAuthFormSource,
  'settingsStore.t("settings.serverUrl")',
  'settingsStore.t("auth.password")',
  "Desktop login form must put the server address in the main sign-in form before account credentials",
);
assertOrder(
  desktopAuthFormSource,
  '<button class="primary-button" type="submit"',
  'checkAndSaveConnection',
  "Desktop connection testing must stay secondary after the primary sign-in action",
);
assert.match(desktopLoginSource, /class="segment-control" role="group"/, "Desktop auth mode controls must expose button-group semantics");
assert.match(desktopLoginSource, /:aria-pressed="mode === 'login'"/, "Desktop login mode button must expose its pressed state");
assert.match(desktopLoginSource, /:aria-pressed="mode === 'register'"/, "Desktop register mode button must expose its pressed state");
assert.doesNotMatch(desktopSettingsSource, /showAdvancedConnectionEntry = computed\(\(\) => true\)/, "Desktop settings must not show advanced connection settings by default");
assert.match(
  desktopLoginSource,
  /advancedConnectionManuallyRequested/,
  "Desktop login must let users intentionally reveal custom proxy connection settings",
);
assert.match(
  desktopSettingsSource,
  /advancedConnectionManuallyRequested/,
  "Desktop settings must let users intentionally reveal custom proxy connection settings",
);
assert.match(
  desktopSettingsConnectionPanelSource,
  /showAdvancedConnection/,
  "Desktop connection panel must expose a plain action to reveal advanced connection settings",
);
assert.match(desktopTaskViewSource, /const emptyTaskStateText = computed/, "Desktop task view must derive contextual empty-state copy instead of one generic string");
assert.match(desktopTaskViewSource, /search\.value\.trim\(\)[\s\S]{0,180}task\.emptySearch/, "Desktop empty search state must have search-specific copy");
assert.match(desktopTaskViewSource, /hasActiveFilters\.value[\s\S]{0,180}task\.emptyFiltered/, "Desktop empty filtered state must have filter-specific copy");
assert.match(desktopTaskViewSource, /emptyTaskStateText/, "Desktop empty-state template must render the contextual empty-state copy");
assert.match(desktopI18nSource, /"task\.emptySearch"/, "Desktop i18n must define empty search copy");
assert.match(desktopI18nSource, /"task\.emptyFiltered"/, "Desktop i18n must define empty filtered copy");
assert.doesNotMatch(
  desktopI18nSource,
  /"task\.(emptySearch|emptyFiltered|empty|emptyToday|quickPlaceholder|autoFillHint)": [\s\S]{0,180}(?:#工作|#work|P3)/,
  "Desktop ordinary task placeholders and empty states must not lead with shortcut syntax",
);
assert.match(
  desktopI18nSource,
  /"task\.quickPlaceholder"[\s\S]{0,120}例如：写周报/,
  "Desktop Chinese task placeholder must start with a plain task title",
);
assert.match(
  desktopI18nSource,
  /"task\.quickPlaceholder"[\s\S]{0,120}Example: write weekly report/,
  "Desktop English task placeholder must start with a plain task title",
);
assert.match(desktopWorkspaceStatusBannerSource, /defineProps<[\s\S]*status:\s*WorkspaceStatusPresentation/, "Desktop workspace status banner must accept a workspace status presentation");
assert.match(desktopWorkspaceStatusBannerSource, /defineEmits<[\s\S]*retry:\s*\[\];[\s\S]*openDetails:\s*\[\]/, "Desktop workspace status banner must emit retry and details actions");
assert.match(desktopWorkspaceStatusBannerSource, /aria-live="polite"/, "Desktop workspace status banner must announce changes politely");
assert.match(desktopAppSource, /import \{ deriveWorkspaceStatus \} from "\.\.\/shared\/workspace-ui-policy"/, "Desktop app must import the shared workspace status policy");
assert.match(desktopAppSource, /const workspaceStatus = computed\(\(\) =>[\s\S]{0,160}deriveWorkspaceStatus\(syncStore\.status, syncStore\.diagnostics\)/, "Desktop app must derive workspace status from sync state and diagnostics");
assert.match(desktopAppSource, /<WorkspaceStatusBanner[\s\S]{0,160}v-if="workspaceStatus\.banner !== 'none'"/, "Desktop app must only render the workspace banner when it has a status to show");
for (const [name, source] of [
  ["Desktop all-tasks view", desktopTaskViewSource],
  ["Desktop Today view", desktopTodayViewSource],
]) {
  assert.doesNotMatch(source, /TaskSyncHealthBar|taskSyncHealth|showTaskSyncHealth|diagnosticSyncIssueCount|taskRecordSyncIssueCount|taskSyncIssueCount|taskSyncHealthTone|taskSyncHealthText|useSyncStore/, `${name} must not derive or render duplicate task-level sync health`);
}
assert.match(desktopI18nSource, /"sync\.offlineWorkspace"/, "Desktop i18n must include offline workspace copy");
assert.match(desktopI18nSource, /"sync\.attentionWorkspace"/, "Desktop i18n must include attention workspace copy");
assert.match(desktopI18nSource, /"sync\.retry"/, "Desktop i18n must include retry copy");
assert.match(desktopI18nSource, /"sync\.details"/, "Desktop i18n must include sync details copy");
assert.match(desktopI18nSource, /"settings\.navSyncRecovery": \{ "zh-CN": "同步问题", "en-US": "Sync issues" \}/, "Desktop settings navigation must use the shared sync-issues label");
assert.match(desktopI18nSource, /"settings\.syncRecoveryCenter": \{ "zh-CN": "同步问题", "en-US": "Sync issues" \}/, "Desktop sync recovery panel title must use the shared sync-issues label");
assert.match(androidTaskListSource, /TaskFilterSummaryBar\(/, "Android task list must keep visible active-filter feedback near the list");
assert.match(androidTaskListSource, /activeTaskFilterLabels\(/, "Android active-filter feedback must be derived through a focused helper");
assert.match(androidTaskListSource, /strings\.clearSearch/, "Android active-filter feedback must provide a direct clear-search action");
assert.match(androidTaskListSource, /strings\.showAllTasks/, "Android active-filter feedback must provide a direct show-all action");
assert.match(androidTaskListSource, /TaskListSyncHealthBar\(/, "Android task list must show sync health near the task list, not only in settings");
assertOrder(
  androidTaskListSource,
  "TaskListSyncHealthBar(",
  "TaskFilterSummaryBar(",
  "Android task-list sync health should appear before filter feedback and the list",
);
assert.match(androidTaskListSource, /taskListSyncHealthText\(/, "Android task list must derive sync health through a focused policy helper");
assert.doesNotMatch(androidTaskListSource, /onOpenDetails = \{ onSettingsClick\(\) \}/, "Android task-list sync health action must not stop at the settings home screen");
assert.match(
  androidMainActivitySource,
  /Routes\.settings\("sync-recovery"\)/,
  "Android task-list sync health action must navigate directly to sync recovery",
);
assert.match(
  androidSettingsSource,
  /initialSection:\s*String\?\s*=\s*null/,
  "Android settings must accept an initial section target",
);
assert.match(
  androidSettingsSource,
  /initialSection == "sync-recovery"[\s\S]{0,180}supportToolsOpen = true/,
  "Android settings must auto-open sync recovery tools when reached from sync health",
);
assert.match(
  androidSettingsSource,
  /syncRecoveryToolsVisible = supportToolsOpen \|\| recoverableSyncIssueCount > 0 \|\| conflictTaskCount > 0/,
  "Android sync issue actions must become visible automatically when recoverable sync problems exist",
);
assert.match(
  androidSettingsSource,
  /conflictTaskCount = conflictTaskCount/,
  "Android sync recovery summary must include unresolved conflict tasks",
);
assert.match(
  androidSettingsSource,
  /syncRecoveryConflictActionText\(isEnglish\)/,
  "Android settings sync recovery tools must include a direct conflict-review action",
);
assert.match(
  androidSettingsSource,
  /onOpenConflictTasks\(\)/,
  "Android settings conflict-review action must navigate directly to conflict tasks",
);
assert.match(
  androidMainActivitySource,
  /Routes\.tasks\("conflict"\)/,
  "Android settings conflict-review route must open the task list with the conflict filter",
);
assert.match(androidSettingsSource, /syncRecoveryToolsTitle\(isEnglish\)/, "Android settings sync recovery title copy must be centralized in a helper");
assert.match(androidSettingsSource, /syncRecoveryToolsToggleText\(/, "Android settings sync recovery toggle copy must be centralized in a helper");
assert.match(androidTaskListSource, /private fun TaskListSyncHealthBar/, "Android task-list sync health bar must be a focused composable");
assert.match(androidTaskListSource, /syncHealth\.needsAttention/, "Android task-list sync health bar must visually distinguish attention states");
assert.match(androidTaskListSource, /allTasks \+ trashTasks/, "Android task-list sync health must evaluate all local tasks, including trash");
assert.match(androidTaskListSource, /strings\.syncHealthAction/, "Android task-list sync health action must use localized copy");
assert.match(androidTaskListSource, /text = syncHealth\.title/, "Android task-list sync health must use the derived state title instead of one static heading");
assert.match(androidTaskListSource, /text = syncHealth\.body/, "Android task-list sync health must always show the derived short body");
assert.match(
  androidTaskListSource,
  /if \(syncHealth\.needsAttention\) \{[\s\S]{0,180}TaskListSyncHealthBar/,
  "Android task-list sync health must only interrupt the task workflow when an item needs attention",
);
assert.match(androidI18nSource, /syncHealthAction/, "Android i18n must include task-list sync detail action copy");
assert.match(androidI18nSource, /syncHealthTitle = "同步问题"/, "Android i18n must keep sync-problem wording consistent for settings and support surfaces");
assert.match(androidI18nSource, /syncHealthTitle = "Sync issues"/, "Android English i18n must keep sync-problem wording consistent for settings and support surfaces");
assert.match(androidI18nSource, /taskBodyDetails = "添加备注和清单"/, "Android editor body disclosure copy must live in i18n");
assert.match(androidI18nSource, /taskArrangementSettings = "时间与安排"/, "Android editor schedule disclosure copy must live in i18n");
assert.doesNotMatch(androidEditorSource, /return if \(isEnglish\) "Add notes and checklist"/, "Android editor must not hard-code notes/checklist copy outside i18n");
assert.doesNotMatch(androidEditorSource, /return if \(isEnglish\) "Time and schedule"/, "Android editor must not hard-code schedule disclosure copy outside i18n");
assert.doesNotMatch(
  androidI18nSource,
  /quickAddPlaceholder = "[^"]*(?:#工作|#work|P3)/,
  "Android quick-add placeholder must not make shortcut syntax look required",
);
assert.match(
  androidI18nSource,
  /quickAddPlaceholder = "例如：写周报"/,
  "Android Chinese quick-add placeholder must start with a plain task title",
);
assert.match(
  androidI18nSource,
  /quickAddPlaceholder = "Example: write weekly report"/,
  "Android English quick-add placeholder must start with a plain task title",
);
assert.match(
  androidI18nSource,
  /advancedConnectionSettings = "排障：自定义连接地址"/,
  "Android Chinese advanced connection heading must frame custom URLs as troubleshooting",
);
assert.match(
  androidI18nSource,
  /advancedConnectionSettings = "Troubleshooting: custom connection URLs"/,
  "Android English advanced connection heading must frame custom URLs as troubleshooting",
);
assert.match(readmeSource, /普通使用不需要阅读开发者说明/, "README must clearly tell ordinary users where the developer section starts");
assert.match(
  readmeSource,
  /安装包可能带有默认服务器地址；如果登录页地址不对/,
  "README ordinary user copy must explain how to change bundled default server addresses",
);
assert.match(
  readmeSource,
  /如果你只是使用别人部署好的 TaskBridge，请先向管理员或部署者索取服务器地址/,
  "README no-server path must give non-technical users an administrator/deployer path before deployment commands",
);
const readmeOpeningSource = readmeSource.split(/\r?\n/).slice(0, 25).join("\n");
assert.match(
  readmeOpeningSource,
  /如果你只是使用别人部署好的 TaskBridge，请先向管理员或部署者索取服务器地址和账号/,
  "README must put the ordinary no-server path in the opening decision area",
);
assert.match(
  readmeOpeningSource,
  /\| 我已经有服务器地址和账号 \|[\s\S]*\| 我还没有服务器地址 \|[\s\S]*\| 我要维护或部署服务 \|/,
  "README opening must use one clear decision table without duplicating the hosted-service path",
);
assertOrder(
  readmeOpeningSource,
  "如果你只是使用别人部署好的 TaskBridge，请先向管理员或部署者索取服务器地址和账号",
  "本机试用",
  "README opening no-server path must route ordinary users to an administrator before local trial or self-hosting",
);
assert.match(
  userQuickStartDocSource,
  /如果你不是部署者，请先向管理员或部署者索取服务器地址和账号/,
  "ordinary quick-start must tell non-technical users to ask for the server address instead of starting deployment",
);
assert.match(
  webLocalTrialGuideSource,
  /第一步：先确认你是不是普通使用者/,
  "Web local-trial guide must start by helping ordinary users decide whether they should deploy anything",
);
assert.match(
  webLocalTrialGuideSource,
  /如果只是使用别人部署好的 TaskBridge，请先找管理员或部署者要服务器地址/,
  "Web local-trial guide must route non-deploying users to an administrator or deployer before showing commands",
);
assert.match(
  webLocalTrialGuideSource,
  /Windows 桌面端[\s\S]{0,120}http:\/\/127\.0\.0\.1:8000/,
  "Web local-trial guide must give a plain same-computer Windows address",
);
assert.match(
  webLocalTrialGuideSource,
  /Android 真机[\s\S]{0,160}局域网 IP/,
  "Web local-trial guide must explain the Android phone address without making users infer it from Docker output",
);
assert.match(
  webLocalTrialGuideSource,
  /Step 1: check whether you are a regular user/,
  "Web local-trial guide must include the same ordinary-user decision path in English",
);
assert.match(
  webLocalTrialGuideSource,
  /<body[^>]*data-language="zh-CN"/,
  "Web local-trial guide must declare the active language so only one language is shown at a time",
);
assert.match(
  webLocalTrialGuideSource,
  /id="localTrialLanguageSelect"/,
  "Web local-trial guide must expose a language selector instead of showing two full guides at once",
);
assert.match(
  webGuideLanguageSource,
  /function setGuideLanguage\(/,
  "Web local-trial guide must switch visible language sections through a focused helper",
);
assert.match(webLocalTrialGuideSource, /src="\.\/guide-language\.js\?v=/, "Web local-trial guide must load the CSP-safe shared language helper");
assert.match(
  webSelfHostingGuideSource,
  /<body[^>]*data-language="zh-CN"/,
  "Web self-hosting guide must declare the active language so ordinary users do not see two full guides at once",
);
assert.match(
  webSelfHostingGuideSource,
  /<main[^>]*class="[^"]*local-trial-page[^"]*"[^>]*data-language="zh-CN"/,
  "Web self-hosting guide must reuse the single-language guide shell",
);
assert.match(
  webSelfHostingGuideSource,
  /id="selfHostingLanguageSelect"/,
  "Web self-hosting guide must expose a language selector like the local-trial guide",
);
assert.match(
  webSelfHostingGuideSource,
  /data-lang="zh-CN"/,
  "Web self-hosting guide Chinese sections must be marked so they can be hidden when English is active",
);
assert.match(
  webGuideLanguageSource,
  /function setGuideLanguage\(/,
  "Web self-hosting guide must switch visible language sections through a focused helper",
);
assert.match(webSelfHostingGuideSource, /src="\.\/guide-language\.js\?v=/, "Web self-hosting guide must load the CSP-safe shared language helper");
assert.match(
  webSelfHostingGuideSource,
  /我只是使用别人部署好的 TaskBridge/,
  "Web self-hosting guide must first separate ordinary users from deployers",
);
assert.match(
  webSelfHostingGuideSource,
  /If you use someone else's TaskBridge service/,
  "Web self-hosting guide must include the ordinary-user decision path in English",
);
assertOrder(
  webSelfHostingGuideSource,
  "我只是使用别人部署好的 TaskBridge",
  '<ol class="local-trial-steps" data-lang="zh-CN">',
  "Web self-hosting guide must route ordinary users before showing deployment commands",
);
assertOrder(
  webSelfHostingGuideSource,
  "返回登录页填写地址",
  '<ol class="local-trial-steps" data-lang="zh-CN">',
  "Web self-hosting guide ordinary-user sign-in action must appear before deployment commands",
);
assertOrder(
  webSelfHostingGuideSource,
  "Back to sign-in with that address",
  "<ol class=\"local-trial-steps\">",
  "Web self-hosting guide English ordinary-user sign-in action must appear before deployment commands",
);
assert.match(
  webStylesSource,
  /\.local-trial-page\[data-language="zh-CN"\][\s\S]{0,220}\[lang="en"\]/,
  "Web local-trial guide CSS must hide English content while Chinese is active",
);
assert.match(
  webStylesSource,
  /\.local-trial-page\[data-language="en-US"\][\s\S]{0,220}\[data-lang="zh-CN"\]/,
  "Web local-trial guide CSS must hide Chinese content while English is active",
);
assert.doesNotMatch(webAppSource, /"auth\.localTrial":|"auth\.localTrialDocs":|"auth\.localTrialSameDevice":|"auth\.localTrialStartBackend":|"auth\.selfHost":|"auth\.selfHostHint":|"auth\.selfHostFirstAccount":/, "Web sign-in i18n must not keep unused nested setup-guide copy after moving setup guidance into dedicated pages");
assert.match(webHtmlSource, /id="offlineTaskLimitNotice"/, "Web offline task list must reserve visible space for local-cache limit feedback");
assert.match(webHtmlSource, /id="offlineTaskLimitLoadMoreButton"/, "Web offline task limit notice must offer a visible load-more action");
assert.match(webAppSource, /cachedTaskTotalCount/, "Web offline cache hydration must remember the total local task count before applying the render limit");
assert.match(webAppSource, /offlineTaskRenderLimit/, "Web offline cache hydration must keep a user-expandable render limit");
assert.match(webAppSource, /function increaseOfflineTaskRenderLimit\(/, "Web offline task list must expose a focused load-more helper");
assert.match(webAppSource, /function renderOfflineTaskLimitNotice\(/, "Web must render a clear notice when the offline cache has more tasks than the list limit");
assert.match(webAppSource, /"task\.offlineLimitNotice"/, "Web i18n must include offline task limit notice copy");
assert.match(webAppSource, /"task\.offlineLimitLoadMore"/, "Web i18n must include offline task load-more copy");
assert.match(
  webAppSource,
  /offlineTaskLimitLoadMoreButton[\s\S]{0,220}increaseOfflineTaskRenderLimit\(\)/,
  "Web offline task limit load-more button must expand the cached task render limit",
);
assert.match(
  webAppSource,
  /renderOfflineTaskLimitNotice\(\)/,
  "Web render cycle must refresh the offline task limit notice with task state changes",
);
assert.match(
  androidTaskListSource,
  /private fun TaskListSearchField\(/,
  "Android task list search field must be a focused composable instead of being hidden inside the filter panel",
);
assertOrder(
  androidTaskListSource,
  "TaskListSearchField(",
  "TextButton(onClick = { listToolsOpen = !listToolsOpen }",
  "Android task list must show search before the optional filter tools toggle",
);
assert.match(
  desktopLoginSource,
  /const registrationConnectionHint = computed/,
  "Desktop login must derive an explicit registration status hint near the connection controls",
);
assertOrder(
  desktopLoginSource,
  "{{ registrationConnectionHint }}",
  '<div class="segment-control"',
  "Desktop registration status hint must appear before the login/register segmented control",
);
assert.match(
  desktopI18nSource,
  /"auth\.registrationConnectionHint"[\s\S]{0,240}检查服务器地址[\s\S]{0,240}管理员创建账号/,
  "Desktop Chinese registration connection hint must tell users to check the server address and ask an admin for account creation",
);
assert.match(
  desktopI18nSource,
  /"auth\.registrationConnectionHint"[\s\S]{0,260}Check the server address[\s\S]{0,260}administrator to create an account/,
  "Desktop English registration connection hint must tell users to check the server address and ask an admin for account creation",
);
assert.doesNotMatch(
  desktopLoginSource,
  /<p v-if="registrationBlocked" class="form-error">\{\{ registrationUnavailableText \}\}<\/p>/,
  "Desktop login must not repeat the registration status warning below the segmented control",
);
assert.doesNotMatch(
  desktopLoginSource,
  /<p v-else-if="!auth\.registrationStatusKnown" class="form-message form-message-info">\{\{ registrationUnavailableText \}\}<\/p>/,
  "Desktop login must keep unknown registration status guidance in one place instead of duplicating it below the segmented control",
);
assert.match(
  troubleshootingDocSource,
  /普通用户排障到这里就够了/,
  "troubleshooting docs must clearly separate ordinary-user troubleshooting from maintainer-only sections",
);
assert.match(
  troubleshootingDocSource,
  /HTTP \/ WS 与 HTTPS \/ WSS[\s\S]{0,520}不会因为端点使用 `http:\/\/` 或 `ws:\/\/` 而失败/,
  "Troubleshooting docs must explain that HTTP and WS endpoints are supported",
);
assert.match(
  troubleshootingDocSource,
  /高级连接设置什么时候需要改[\s\S]{0,520}大多数用户只需要填写服务器地址/,
  "Troubleshooting docs must keep advanced connection settings secondary",
);
assert.match(
  developmentDocSource,
  /WEB_CORS_ORIGINS=http:\/\/taskbridge\.example\.com[\s\S]{0,80}WEB_CORS_ORIGINS=https:\/\/taskbridge\.example\.com/,
  "Development docs must show explicit HTTP or HTTPS CORS origins instead of a wildcard",
);
assert.match(
  deployReadmeSource,
  /WEB_CORS_ORIGINS=http:\/\/taskbridge\.example\.com[\s\S]{0,120}WEB_CORS_ORIGINS=https:\/\/taskbridge\.example\.com/,
  "Deploy README production CORS guidance must allow explicit HTTP or HTTPS origins instead of a wildcard",
);
assert.match(
  rootPackageSource,
  /"check:user-experience":\s*"npm --prefix desktop run check:user-experience"/,
  "Workspace root must expose the UX check so maintainers do not have to know it lives under desktop/",
);

console.log("user experience optimization check passed");
