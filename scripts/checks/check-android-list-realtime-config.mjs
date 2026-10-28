import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "../lib/script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  taskRepositorySource,
  websocketSource,
  taskListScreenSource,
  apiServiceSource,
  tokenDataStoreSource,
  authRepositorySource,
  retrofitSource,
  syncManagerSource,
  loginViewModelSource,
  loginScreenSource,
  registerViewModelSource,
  registerScreenSource,
  mainActivitySource,
  settingsScreenSource,
  taskListDataSource,
  taskListPagerSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/TaskRepository.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/sync/WebSocketClient.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/remote/ApiService.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/datastore/TokenDataStore.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/AuthRepository.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/sync/SyncManager.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/LoginViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/RegisterViewModel.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/login/RegisterScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/MainActivity.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/local/TaskListDataSource.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListPager.kt"), "utf8"),
]);

assert.doesNotMatch(taskRepositorySource, /(?:ACTIVE|TODAY|SEARCH)_TASK_LIMIT/, "Android list and search must not use a fixed total limit");
assert.match(taskRepositorySource, /fun observeTaskPage\(query: TaskListQuery\)/, "Android task lists must expose complete pagination");
assert.match(taskRepositorySource, /TaskListDataSource\(database\)\.observe\(workspace\.id, query\)/, "Android pages must retain workspace isolation");
assert.match(taskListDataSource, /visible AS \(SELECT \* FROM normalized WHERE \$where\)/, "Android filters and search must run before pagination");
assert.match(taskListDataSource, /SELECT COUNT\(\*\) total/, "Android task counts must include the full filtered result");
assert.match(taskListDataSource, /LIMIT \? OFFSET \?/, "Android task pages must use bounded SQL reads");
assert.match(taskListPagerSource, /\.flatMapLatest\(load\)/, "Android view changes must cancel the previous page subscription");
assert.match(taskListPagerSource, /WhileSubscribed\(stopTimeoutMillis = 0, replayExpirationMillis = 0\)/, "Android pages must release unused subscriptions immediately");
assert.match(taskListScreenSource, /val page by viewModel\.page\.collectAsStateWithLifecycle\(\)/, "Android list screens must collect only the current page");

assert.match(websocketSource, /private var reconnectJob: Job\? = null/, "Android websocket must track a reconnect job");
assert.match(websocketSource, /private var reconnectAttempt = 0/, "Android websocket must track reconnect attempts");
assert.match(websocketSource, /private var shouldReconnect = false/, "Android websocket must suppress reconnects after manual disconnect");
assert.match(websocketSource, /private fun scheduleReconnect\(\)/, "Android websocket must centralize reconnect scheduling");
assert.match(websocketSource, /override fun onFailure[\s\S]*?scheduleReconnect\(\)/, "Android websocket failure must schedule reconnect");
assert.match(websocketSource, /override fun onClosed[\s\S]*?scheduleReconnect\(\)/, "Android websocket close must schedule reconnect unless disconnected");
assert.match(websocketSource, /reconnectAttempt = 0/, "Android websocket must reset backoff after a successful open");
assert.match(websocketSource, /delay\(delayMillis\)/, "Android websocket reconnect must use delayed backoff");

assert.match(taskListScreenSource, /FlowRow/, "Android task row actions must wrap instead of hiding actions in horizontal scroll");
assert.match(taskListScreenSource, /ExperimentalLayoutApi/, "Android task action FlowRow must explicitly opt in to experimental layout APIs");
assert.doesNotMatch(taskListScreenSource, /horizontalScroll|rememberScrollState/, "Android task row actions must not require horizontal scrolling");
assert.match(taskListScreenSource, /DropdownMenu/, "Android task row low-frequency actions must live in a more-actions menu");
assert.match(taskListScreenSource, /moreMenuExpanded/, "Android task row must track the expanded state of the more-actions menu");
assert.match(taskListScreenSource, /DropdownMenuItem[\s\S]*onPlanToday/, "Android plan-today action must move into the more-actions menu");
assert.match(taskListScreenSource, /DropdownMenuItem[\s\S]*onDelete/, "Android delete action must move into the more-actions menu");

assert.match(tokenDataStoreSource, /val serverBaseUrl: Flow<String>/, "Android must persist a user-facing server base URL");
assert.match(tokenDataStoreSource, /val apiBaseUrl: Flow<String>/, "Android must persist an editable API base URL");
assert.match(tokenDataStoreSource, /val webSocketUrl: Flow<String>/, "Android must persist an editable WebSocket URL");
assert.match(tokenDataStoreSource, /saveNetworkEndpoints/, "Android must save runtime network endpoints");
assert.match(tokenDataStoreSource, /saveServerBaseUrl/, "Android must derive and save endpoints from one server address");
assert.match(tokenDataStoreSource, /deriveNetworkEndpoints/, "Android must centralize server-to-API/WebSocket derivation");
assert.match(apiServiceSource, /@GET\("sync\/status"\)/, "Android API service must expose the unauthenticated sync status endpoint");
assert.match(authRepositorySource, /testConnection/, "Android auth repository must expose a connection test");
assert.match(authRepositorySource, /apiService\.syncStatus\(\)/, "Android connection test must hit sync/status");
assert.match(retrofitSource, /EndpointInterceptor/, "Android HTTP client must rewrite requests to the saved API endpoint");
assert.match(retrofitSource, /tokenDataStore\.requestAuthContext\(\)/, "Android HTTP endpoint interceptor must read endpoint and auth state from one preference snapshot");
assert.match(retrofitSource, /endpointUri\(requestContext\.apiBaseUrl\)/, "Android HTTP endpoint interceptor must use the latest saved API URL from the request context");
assert.match(syncManagerSource, /webSocketUrlProvider = \{ tokenDataStore\.webSocketUrl\.first\(\) \}/, "Android WebSocket must read the latest saved URL before connecting");
assert.match(loginScreenSource, /strings\.connectionSettings|Connection settings|连接设置/, "Android login screen must expose connection settings before sign-in");
assert.match(registerScreenSource, /strings\.connectionSettings|Connection settings|连接设置/, "Android register screen must expose connection settings before registration");
assert.match(settingsScreenSource, /strings\.connectionAndSync|Connection and sync|连接与同步/, "Android settings screen must expose runtime connection settings");
for (const source of [loginViewModelSource, registerViewModelSource]) {
  assert.match(source, /serverBaseUrl/, "Android auth screens must use one user-facing server address");
  assert.match(source, /applyServerBaseUrl/, "Android auth screens must derive endpoints from the server address");
  assert.match(source, /testConnection/, "Android auth screens must let users test the server before signing in");
}
assert.match(mainActivitySource, /authRepository = container\.authRepository/, "Android settings screen must receive authRepository for connection tests");
assert.match(settingsScreenSource, /serverBaseUrlDraft/, "Android settings screen must expose one server address field");
assert.match(settingsScreenSource, /testConnection/, "Android settings screen must let users test the server address");
assert.match(settingsScreenSource, /saveServerBaseUrl/, "Android settings screen must save derived endpoints from the server address");

console.log("Android list and realtime config passed");
