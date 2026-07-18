import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeLineEndings } from "../scripts/script-helpers.mjs";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "..");

async function source(path) {
  return normalizeLineEndings(await readFile(resolve(repoRoot, path), "utf8"));
}

test("desktop navigation protects dirty task editors", async () => {
  const [app, todayView, taskView] = await Promise.all([
    source("desktop/src/App.vue"),
    source("desktop/src/views/TodayView.vue"),
    source("desktop/src/views/TaskView.vue"),
  ]);

  assert.match(app, /const editorDirty = ref\(false\)/);
  assert.match(app, /async function requestViewChange/);
  assert.match(app, /task\.discardChangesConfirm/);
  assert.match(app, /beforeunload/);
  assert.doesNotMatch(app, /@click="activeView = '(?:today|tasks|settings)'"/);
  assert.match(todayView, /editorDirtyChange/);
  assert.match(taskView, /editorDirtyChange/);
});

test("desktop login preserves custom API and websocket endpoints across retries", async () => {
  const [loginView, connectionEndpoints] = await Promise.all([
    source("desktop/src/views/LoginView.vue"),
    source("desktop/shared/connection-endpoints.ts"),
  ]);

  assert.match(connectionEndpoints, /export function hasCustomConnectionEndpoints/);
  assert.match(loginView, /hasCustomConnectionEndpoints\([\s\S]{0,120}serverUrlDraft\.value,[\s\S]{0,80}settings\.baseUrl,[\s\S]{0,80}settings\.wsUrl/);
  assert.match(loginView, /advancedEndpointsEdited\.value = hasCustomConnectionEndpoints/);
  assert.doesNotMatch(loginView, /advancedEndpointsEdited\.value = false;\s*\n}\s*\n\s*function applyServerUrl/);
});

test("desktop keeps valid stored endpoints after logout and routes empty connections to login", async () => {
  const [electronState, authStore] = await Promise.all([
    source("desktop/electron/state.ts"),
    source("desktop/src/stores/auth.ts"),
  ]);

  assert.doesNotMatch(electronState, /hasStoredSessionCredentials/);
  assert.match(electronState, /migrateStringSetting\([\s\S]{0,220}isHttpUrl,[\s\S]{0,40}true,/);
  assert.match(electronState, /migrateStringSetting\([\s\S]{0,220}isWebSocketUrl,[\s\S]{0,40}true,/);
  assert.match(authStore, /const settings = await bridge\(\)\.app\.getSettings\(\)/);
  assert.match(authStore, /if \(!settings\.baseUrl\.trim\(\) \|\| !settings\.wsUrl\.trim\(\)\)/);
  assert.match(authStore, /authenticated\.value = false/);
});

test("desktop settings connection drafts participate in navigation protection", async () => {
  const [app, settingsView, i18n] = await Promise.all([
    source("desktop/src/App.vue"),
    source("desktop/src/views/SettingsView.vue"),
    source("desktop/src/i18n.ts"),
  ]);

  assert.match(app, /const settingsConnectionDirty = ref\(false\)/);
  assert.match(app, /@connection-dirty-change="updateSettingsConnectionDirty"/);
  assert.match(app, /settings\.discardConnectionChangesConfirm/);
  assert.match(settingsView, /connectionDirtyChange: \[dirty: boolean\]/);
  assert.match(settingsView, /const connectionDraftDirty = computed/);
  assert.match(settingsView, /emit\("connectionDirtyChange", dirty\)/);
  assert.match(i18n, /"settings\.discardConnectionChangesConfirm"/);
});

test("desktop task drawers implement modal keyboard and focus behavior once", async () => {
  const [drawer, taskView, todayView] = await Promise.all([
    source("desktop/src/components/EditorDrawer.vue"),
    source("desktop/src/views/TaskView.vue"),
    source("desktop/src/views/TodayView.vue"),
  ]);

  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /trapDialogFocus/);
  assert.match(drawer, /previousActiveElement/);
  assert.match(taskView, /<EditorDrawer/);
  assert.match(todayView, /<EditorDrawer/);
  assert.doesNotMatch(taskView, /class="drawer-layer"/);
  assert.doesNotMatch(todayView, /class="drawer-layer"/);
});

test("desktop settings requests select a persistent category without anchor scrolling", async () => {
  const [settingsView, metadataPanel] = await Promise.all([
    source("desktop/src/views/SettingsView.vue"),
    source("desktop/src/components/settings/SettingsMetadataPanel.vue"),
  ]);

  assert.match(settingsView, /const activeSettingsSection = ref<SettingsSectionId>\("account-display"\)/);
  assert.match(settingsView, /function showSettingsSection\(sectionId: string\): void/);
  assert.match(settingsView, /activeSettingsSection\.value = target\.sectionId/);
  assert.match(settingsView, /if \(target\.sectionId === "metadata"\) metadataOpen\.value = false/);
  assert.match(settingsView, /if \(!request\) return;\s*showSettingsSection\(request\.sectionId\)/);
  assert.match(settingsView, /if \(request\.sectionId === "sync-recovery"\) syncDiagnosticsOpen\.value = true/);
  assert.match(settingsView, /v-show="activeSettingsSection === 'metadata'"/);
  assert.match(settingsView, /v-model:open="metadataOpen"/);
  assert.doesNotMatch(settingsView, /scrollIntoView|scrollToSettingsSection/);
  assert.match(metadataPanel, /defineModel<boolean>\("open"/);
  assert.match(metadataPanel, /:open="open"/);
});

test("desktop auth mode buttons use button-group semantics", async () => {
  const loginView = await source("desktop/src/views/LoginView.vue");

  assert.match(loginView, /class="segment-control" role="group"/);
  assert.match(loginView, /:aria-pressed="mode === 'login'"/);
  assert.doesNotMatch(loginView, /role="tab(?:list)?"|aria-selected/);
});

test("desktop and web server fields let application code normalize missing protocols", async () => {
  const [desktopLogin, desktopConnection, webHtml] = await Promise.all([
    source("desktop/src/views/LoginView.vue"),
    source("desktop/src/components/settings/SettingsConnectionPanel.vue"),
    source("web/index.html"),
  ]);

  assert.match(desktopLogin, /v-model\.trim="serverUrlDraft"[\s\S]{0,120}type="text"[\s\S]{0,120}inputmode="url"/);
  assert.doesNotMatch(desktopConnection, /type="url"/);
  assert.match(webHtml, /id="serverBaseUrl"[\s\S]{0,160}type="text"[\s\S]{0,160}inputmode="url"/);
});

test("desktop bootstrap leaves an unconfigured server visibly empty", async () => {
  const [electronState, electronVite, desktopLogin, desktopSettings] = await Promise.all([
    source("desktop/electron/state.ts"),
    source("desktop/electron.vite.config.ts"),
    source("desktop/src/views/LoginView.vue"),
    source("desktop/src/views/SettingsView.vue"),
  ]);

  assert.match(electronState, /const FALLBACK_BASE_URL = ""/);
  assert.match(electronState, /const FALLBACK_WS_URL = ""/);
  assert.match(electronVite, /const FALLBACK_BASE_URL = ""/);
  assert.match(electronVite, /const FALLBACK_WS_URL = ""/);
  assert.doesNotMatch(desktopLogin, /catch \{\s*return "http:\/\/127\.0\.0\.1:8000"/);
  assert.doesNotMatch(desktopSettings, /catch \{\s*return "http:\/\/127\.0\.0\.1:8000"/);
});

test("login forms put sign-in controls before optional setup guidance", async () => {
  const [desktopLogin, webHtml, androidLogin] = await Promise.all([
    source("desktop/src/views/LoginView.vue"),
    source("web/index.html"),
    source("android/app/src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt"),
  ]);

  assert.ok(desktopLogin.indexOf("auth-main-form") < desktopLogin.indexOf("first-use-guide"));
  assert.ok(webHtml.indexOf('id="authForm"') < webHtml.indexOf('id="serverSetupHelp"'));
  assert.ok(androidLogin.indexOf("SignInPanel(") < androidLogin.indexOf("FirstUseGuide("));
});

test("web offers an explicit cached offline resume path without persisting tokens", async () => {
  const [webApp, webHtml, securityDoc] = await Promise.all([
    source("web/app.js"),
    source("web/index.html"),
    source("docs/security.md"),
  ]);

  assert.match(webHtml, /id="resumeOfflineButton"/);
  assert.match(webApp, /offlineMode: false/);
  assert.match(webApp, /function persistOfflineProfile/);
  assert.match(webApp, /async function resumeOfflineSession/);
  assert.match(webApp, /state\.offlineMode \|\| \(hasSession\(\) && !navigator\.onLine\)/);
  assert.match(securityDoc, /继续离线使用/);
  assert.doesNotMatch(webApp, /localStorage\.setItem\([^\n]*(?:accessToken|refreshToken)/);
});

test("web registration remains actionable until the server explicitly disables it", async () => {
  const webApp = await source("web/app.js");

  assert.match(webApp, /button\.disabled = registrationBlocked/);
  assert.doesNotMatch(webApp, /button\.disabled = !registerAvailable/);
});

test("responsive task workspaces place tasks before secondary diagnostics", async () => {
  const [webStyles, desktopToday, androidTaskList] = await Promise.all([
    source("web/styles.css"),
    source("desktop/src/views/TodayView.vue"),
    source("android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"),
  ]);

  const responsiveWorkspaceCss = webStyles.slice(
    webStyles.indexOf("@media (max-width: 960px)"),
    webStyles.indexOf("@media (max-width: 760px)"),
  );
  assert.match(
    responsiveWorkspaceCss,
    /\.workspace\s*\{[\s\S]*?grid-template-areas:\s*"mobile-actions"\s*"main"\s*"sidebar"/,
  );
  assert.doesNotMatch(responsiveWorkspaceCss, /\.(?:main-panel|sidebar)\s*\{[^}]*\border\s*:/);
  assert.doesNotMatch(desktopToday, /class="today-overview"/);
  assert.doesNotMatch(desktopToday, /TaskSyncHealthBar/);
  assert.match(await source("desktop/src/App.vue"), /<WorkspaceStatusBanner[\s\S]{0,160}v-if="auth\.isAuthenticated && workspaceStatus\.banner !== 'none'"/);
  assert.match(androidTaskList, /if \(!localWorkspaceMode && syncHealth\.needsAttention\)[\s\S]{0,180}TaskListSyncHealthBar/);
});

test("Android top-level navigation, task actions and dropdowns use platform conventions", async () => {
  const [mainActivity, taskDetail, appUi] = await Promise.all([
    source("android/app/src/main/java/com/taskbridge/app/MainActivity.kt"),
    source("android/app/src/main/java/com/taskbridge/app/ui/task/TaskDetailScreen.kt"),
    source("android/app/src/main/java/com/taskbridge/app/ui/components/AppUi.kt"),
  ]);

  assert.match(mainActivity, /fun NavHostController\.navigateTopLevel/);
  assert.match(mainActivity, /popUpTo\(Routes\.Today\)/);
  assert.match(mainActivity, /launchSingleTop = true/);
  assert.doesNotMatch(mainActivity, /onTodayClick = \{ navController\.navigate\(Routes\.Today\) \}/);
  assert.match(taskDetail, /TextButton\([\s\S]{0,220}pendingTaskDelete = true/);
  assert.match(taskDetail, /color = MaterialTheme\.colorScheme\.error/);
  assert.match(appUi, /contentDescription = fieldDescription/);
  assert.match(appUi, /clearAndSetSemantics/);
  assert.doesNotMatch(appUi, /text = "v"/);
});

test("Android settings expose the installed version and a release update entry", async () => {
  const settings = await source("android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt");

  assert.match(settings, /BuildConfig\.VERSION_NAME/);
  assert.match(settings, /https:\/\/github\.com\/27xk\/TaskBridge\/releases\/latest/);
});

test("Android release permits user-configured HTTP and WS endpoints", async () => {
  const build = await source("android/app/build.gradle.kts");

  assert.match(build, /manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*true/);
  assert.doesNotMatch(build, /manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*taskBridgeUsesCleartext/);
});

test("Android authentication initialization does not flash an interactive login route", async () => {
  const mainActivity = await source("android/app/src/main/java/com/taskbridge/app/MainActivity.kt");

  assert.match(mainActivity, /sealed interface AuthenticationState/);
  assert.match(mainActivity, /AuthenticationState\.Loading/);
  assert.match(mainActivity, /AuthenticationLoadingScreen\(\)/);
  assert.match(mainActivity, /val startDestination = remember\(navController\) \{[\s\S]{0,100}if \(token\.isNullOrBlank\(\)\) Routes\.Login else Routes\.Today/);
  assert.match(mainActivity, /TaskBridgeNavHost\([\s\S]{0,320}startDestination = startDestination/);
  assert.match(mainActivity, /NavHost\(navController = navController, startDestination = startDestination\)/);
  assert.match(mainActivity, /currentRoute == Routes\.Login \|\| currentRoute == Routes\.Register/);
  assert.match(mainActivity, /else if \(!localWorkspaceMode\)[\s\S]{0,220}navigateToAuthentication\(\)/);
});

test("Android restored editor drafts are not overwritten by replayed share intents", async () => {
  const mainActivity = await source("android/app/src/main/java/com/taskbridge/app/MainActivity.kt");

  assert.match(mainActivity, /savedInstanceState\?\.getBoolean\(WIDGET_LAUNCH_HANDLED_STATE_KEY\) == true[\s\S]{0,180}WidgetLaunchTarget\.fromIntent\(intent\)/);
  assert.match(mainActivity, /val sharedTextHandled = savedInstanceState\?\.getBoolean\(SHARED_TEXT_HANDLED_STATE_KEY\) == true/);
  assert.match(mainActivity, /if \(!sharedTextHandled\) loadSharedText\(intent\)/);
  assert.match(mainActivity, /private fun loadSharedText\(intent: Intent\?\)[\s\S]{0,320}sharedTextFromIntent\(applicationContext, intent\)/);
  assert.match(mainActivity, /override fun onSaveInstanceState\(outState: Bundle\)[\s\S]{0,320}widgetLaunchState\?\.value == null[\s\S]{0,180}sharedTextState\?\.value == null/);
  assert.match(mainActivity, /viewModel\.updateContent\(draft\.content\)[\s\S]{0,120}sharedTextState\.value = null/);
});

test("Android authenticated deep links build Today as the root destination", async () => {
  const mainActivity = await source("android/app/src/main/java/com/taskbridge/app/MainActivity.kt");

  assert.match(mainActivity, /fun NavHostController\.navigateAfterAuthentication/);
  assert.match(mainActivity, /navigate\(Routes\.Today\)[\s\S]{0,220}inclusive = true/);
  assert.match(mainActivity, /if \(targetRoute != Routes\.Today\)[\s\S]{0,120}navigate\(targetRoute\)/);
  assert.match(mainActivity, /widgetLaunchTarget\?\.toRoute\(\) \?: Routes\.Today/);
});

test("Android editor drafts survive process recreation and clear after completion", async () => {
  const editorViewModel = await source("android/app/src/main/java/com/taskbridge/app/ui/editor/EditorViewModel.kt");

  assert.match(editorViewModel, /SavedStateHandle/);
  assert.match(editorViewModel, /savedStateHandle\[EDITOR_DRAFT_ID_KEY\]/);
  assert.match(editorViewModel, /FileEditorDraftStore\(appContext\)/);
  assert.match(editorViewModel, /restoreJob = restoredDraftId\?\.let/);
  assert.match(editorViewModel, /draftStore\.delete\(draftId\)/);
  assert.match(editorViewModel, /fun discardDraft\(\)/);
  assert.match(editorViewModel, /extras\.createSavedStateHandle\(\)/);
  assert.match(editorViewModel, /override fun <T : ViewModel> create\([\s\S]{0,160}CreationExtras/);
});

test("Android external links report missing handlers instead of crashing", async () => {
  const [helper, login, register, settings, i18n] = await Promise.all([
    source("android/app/src/main/java/com/taskbridge/app/ui/components/ExternalUri.kt"),
    source("android/app/src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt"),
    source("android/app/src/main/java/com/taskbridge/app/ui/login/RegisterScreen.kt"),
    source("android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt"),
    source("android/app/src/main/java/com/taskbridge/app/ui/i18n/TaskBridgeI18n.kt"),
  ]);

  assert.match(helper, /runCatching\s*\{\s*uriHandler\.openUri\(uri\)\s*}/);
  assert.match(login, /tryOpenExternalUri/);
  assert.match(register, /tryOpenExternalUri/);
  assert.match(settings, /tryOpenExternalUri/);
  assert.match(i18n, /externalLinkFailed/);
});

test("release compose serves the Web client and proxies API and WebSocket routes", async () => {
  const [compose, webProxy] = await Promise.all([
    source("deploy/docker-compose.release.yml"),
    source("deploy/nginx.web.conf"),
  ]);

  assert.match(compose, /\n  web:\n/);
  assert.match(compose, /nginx:/);
  assert.match(compose, /nginx\.web\.conf/);
  assert.match(webProxy, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(webProxy, /location \/api\//);
  assert.match(webProxy, /location \/ws\//);
});

test("README does not present legacy screenshots as the current interface", async () => {
  const readme = await source("README.md");

  assert.doesNotMatch(readme, /docs\/assets\/screenshots\/(?:PC|APP)/);
});
