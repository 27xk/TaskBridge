package com.taskbridge.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Shapes
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.google.gson.JsonParser
import com.taskbridge.app.ui.editor.EditorEntryPreset
import com.taskbridge.app.ui.editor.EditorScreen
import com.taskbridge.app.ui.editor.requireSharedPayloadWithinLimit
import com.taskbridge.app.ui.editor.sharedTextToEditorDraft
import com.taskbridge.app.ui.editor.sharedPayloadReadLimit
import com.taskbridge.app.ui.editor.readUtf8TextWithLimit
import com.taskbridge.app.ui.editor.ExternalEditorNavigationDecision
import com.taskbridge.app.ui.editor.externalEditorNavigationDecision
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import com.taskbridge.app.ui.editor.EditorViewModelFactory
import com.taskbridge.app.ui.login.LoginScreen
import com.taskbridge.app.ui.login.LoginViewModelFactory
import com.taskbridge.app.ui.login.RegisterScreen
import com.taskbridge.app.ui.login.RegisterViewModelFactory
import com.taskbridge.app.ui.settings.SettingsScreen
import com.taskbridge.app.ui.task.TaskDetailScreen
import com.taskbridge.app.ui.task.TaskListFilter
import com.taskbridge.app.ui.task.TaskListScreen
import com.taskbridge.app.ui.task.TaskListViewModelFactory
import com.taskbridge.app.data.datastore.WorkspaceIdentity
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.combine

private const val WIDGET_LAUNCH_HANDLED_STATE_KEY = "taskbridge.widget_launch_handled"
private const val SHARED_TEXT_HANDLED_STATE_KEY = "taskbridge.shared_text_handled"

private sealed interface AuthenticationState {
    data object Loading : AuthenticationState
    data class Ready(val token: String?, val workspace: WorkspaceIdentity?) : AuthenticationState
}

private data class EditorNavigationGuardState(
    val hasUnsavedChanges: Boolean = false,
    val discardDraft: (() -> Unit)? = null,
)

private object Routes {
    const val Login = "login"
    const val Register = "register"
    const val Tasks = "tasks"
    const val TasksPattern = "tasks?filter={filter}"
    const val Today = "today"
    const val Editor = "editor"
    const val EditorToday = "editor-today"
    const val EditorPattern = "editor/{localId}"
    const val Settings = "settings"
    const val SettingsPattern = "settings?section={section}"
    const val TaskDetailPattern = "task-detail/{localId}"

    fun tasks(filter: String? = null): String = if (filter.isNullOrBlank()) Tasks else "$Tasks?filter=$filter"
    fun settings(section: String? = null): String = if (section.isNullOrBlank()) Settings else "$Settings?section=$section"
    fun editTask(localId: String): String = "editor/$localId"
    fun taskDetail(localId: String): String = "task-detail/$localId"
}

class MainActivity : ComponentActivity() {
    private var widgetLaunchState: MutableState<WidgetLaunchTarget?>? = null
    private var sharedTextState: MutableState<String?>? = null
    private var sharedTextErrorState: MutableState<Boolean>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer(applicationContext)
        container.reminderManager.ensureChannel()
        TodayTaskWidgetUpdateWorker.enqueue(this)
        val widgetLaunchHandled = savedInstanceState?.getBoolean(WIDGET_LAUNCH_HANDLED_STATE_KEY) == true
        widgetLaunchState = mutableStateOf(
            if (widgetLaunchHandled) null else WidgetLaunchTarget.fromIntent(intent),
        )
        val sharedTextHandled = savedInstanceState?.getBoolean(SHARED_TEXT_HANDLED_STATE_KEY) == true
        sharedTextState = mutableStateOf(null)
        sharedTextErrorState = mutableStateOf(false)

        setContent {
            TaskBridgeTheme {
                val fallbackWidgetLaunchState = remember { mutableStateOf<WidgetLaunchTarget?>(null) }
                val fallbackSharedTextState = remember { mutableStateOf<String?>(null) }
                val fallbackSharedTextErrorState = remember { mutableStateOf(false) }
                TaskBridgeApp(
                    container,
                    widgetLaunchState ?: fallbackWidgetLaunchState,
                    sharedTextState ?: fallbackSharedTextState,
                    sharedTextErrorState ?: fallbackSharedTextErrorState,
                    onRequestNotificationPermission = ::requestNotificationPermissionIfNeeded,
                )
            }
        }
        if (!sharedTextHandled) loadSharedText(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean(WIDGET_LAUNCH_HANDLED_STATE_KEY, widgetLaunchState?.value == null)
        outState.putBoolean(SHARED_TEXT_HANDLED_STATE_KEY, sharedTextState?.value == null)
        super.onSaveInstanceState(outState)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        widgetLaunchState?.value = WidgetLaunchTarget.fromIntent(intent)
        loadSharedText(intent)
    }

    private fun loadSharedText(intent: Intent?) {
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { sharedTextFromIntent(applicationContext, intent) }
            }
            result.onSuccess { text ->
                sharedTextErrorState?.value = false
                sharedTextState?.value = text
            }.onFailure {
                sharedTextState?.value = null
                sharedTextErrorState?.value = true
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATION_PERMISSION)
    }

    companion object {
        private const val REQUEST_NOTIFICATION_PERMISSION = 2401
    }
}

@Composable
fun TaskBridgeApp(
    container: AppContainer,
    widgetLaunchState: MutableState<WidgetLaunchTarget?>,
    sharedTextState: MutableState<String?>,
    sharedTextErrorState: MutableState<Boolean>,
    onRequestNotificationPermission: () -> Unit,
) {
    val navController = rememberNavController()
    val appContext = LocalContext.current.applicationContext
    val authenticationStateFlow: Flow<AuthenticationState> = remember(container.tokenDataStore) {
        flow {
            container.tokenDataStore.initializeLegacyWorkspaceOwnership()
            emitAll(
                combine(
                    container.tokenDataStore.accessToken,
                    container.tokenDataStore.currentWorkspace,
                ) { token, workspace ->
                    AuthenticationState.Ready(token, workspace)
                },
            )
        }
    }
    val authenticationState by authenticationStateFlow.collectAsStateWithLifecycle(
        initialValue = AuthenticationState.Loading,
    )
    val languageCode by container.tokenDataStore.language.collectAsStateWithLifecycle(initialValue = AppLanguage.Chinese.code)
    val language = AppLanguage.fromCode(languageCode)
    val widgetLaunchTarget = widgetLaunchState.value
    val sharedText = sharedTextState.value
    val scope = rememberCoroutineScope()
    val editorNavigationGuard = remember { mutableStateOf(EditorNavigationGuardState()) }
    val pendingExternalRoute = remember { mutableStateOf<String?>(null) }
    var continueWithCachedWorkspace by rememberSaveable { mutableStateOf(false) }

    if (authenticationState is AuthenticationState.Loading) {
        TaskBridgeLanguageProvider(language) {
            AuthenticationLoadingScreen()
        }
        return
    }

    val readyAuthentication = authenticationState as AuthenticationState.Ready
    val token = readyAuthentication.token
    val workspace = readyAuthentication.workspace
    val localWorkspaceMode = token.isNullOrBlank() && workspace != null && continueWithCachedWorkspace
    val workspaceActive = !token.isNullOrBlank() || localWorkspaceMode
    val startDestination = remember(navController) {
        if (token.isNullOrBlank()) Routes.Login else Routes.Today
    }
    if (!token.isNullOrBlank()) {
        ForegroundWebSocketLifecycle(container)
    }

    LaunchedEffect(token, workspace, continueWithCachedWorkspace) {
        if (!token.isNullOrBlank()) {
            continueWithCachedWorkspace = false
        } else if (!localWorkspaceMode) {
            val currentRoute = navController.currentDestination?.route
            if (currentRoute != null && currentRoute != Routes.Login && currentRoute != Routes.Register) {
                navController.navigateToAuthentication()
            }
        }
    }

    LaunchedEffect(workspaceActive, widgetLaunchTarget) {
        if (!workspaceActive) return@LaunchedEffect

        val targetRoute = widgetLaunchTarget?.toRoute() ?: Routes.Today
        val currentRoute = navController.currentDestination?.route
        if (
            widgetLaunchTarget != null ||
            currentRoute == Routes.Login || currentRoute == Routes.Register
        ) {
            if (
                externalEditorNavigationDecision(
                    currentRoute = currentRoute,
                    hasUnsavedChanges = editorNavigationGuard.value.hasUnsavedChanges,
                ) == ExternalEditorNavigationDecision.ConfirmDiscard
            ) {
                pendingExternalRoute.value = targetRoute
            } else {
                navController.navigateAfterAuthentication(targetRoute)
            }
            widgetLaunchState.value = null
        }
    }

    LaunchedEffect(workspaceActive, sharedText) {
        if (!workspaceActive || sharedText.isNullOrBlank()) return@LaunchedEffect
        if (isTaskBridgeBackupText(sharedText)) return@LaunchedEffect
        val currentRoute = navController.currentDestination?.route
        if (currentRoute == Routes.Login || currentRoute == Routes.Register) {
            navController.navigateAfterAuthentication(Routes.Editor)
        } else {
            navController.navigate(Routes.Editor)
        }
    }

    TaskBridgeLanguageProvider(language) {
        TaskBridgeNavHost(
            container = container,
            navController = navController,
            sharedTextState = sharedTextState,
            language = language,
            startDestination = startDestination,
            localWorkspaceMode = localWorkspaceMode,
            canContinueOffline = workspace != null && token.isNullOrBlank(),
            onContinueOffline = {
                if (workspace != null) {
                    continueWithCachedWorkspace = true
                    navController.navigateAfterAuthentication(Routes.Today)
                }
            },
            onSignInToSync = {
                continueWithCachedWorkspace = false
                navController.navigateToAuthentication()
            },
            onRequestNotificationPermission = onRequestNotificationPermission,
            onEditorNavigationGuardChanged = { editorNavigationGuard.value = it },
        )
        val pendingBackupText = sharedText
        if (workspaceActive && pendingBackupText != null && isTaskBridgeBackupText(pendingBackupText)) {
            SharedBackupImportDialog(
                isEnglish = language == AppLanguage.English,
                onDismiss = { sharedTextState.value = null },
                onConfirm = {
                    scope.launch {
                        val imported = container.taskRepository.importBackupJson(pendingBackupText)
                        if (imported > 0) {
                            TodayTaskWidgetUpdateWorker.enqueue(appContext)
                            container.syncManager.enqueueNetworkSync()
                            container.syncManager.syncNow()
                        }
                        sharedTextState.value = null
                    }
                },
            )
        }
        if (sharedTextErrorState.value) {
            AlertDialog(
                onDismissRequest = { sharedTextErrorState.value = false },
                title = { Text(if (language == AppLanguage.English) "Unable to import shared text" else "无法导入分享内容") },
                text = {
                    Text(
                        if (language == AppLanguage.English) {
                            "The shared text is unreadable or larger than 1 MiB. Choose a smaller plain-text file."
                        } else {
                            "分享内容无法读取或超过 1 MiB，请选择更小的纯文本文件。"
                        },
                    )
                },
                confirmButton = {
                    TextButton(onClick = { sharedTextErrorState.value = false }) {
                        Text(if (language == AppLanguage.English) "OK" else "知道了")
                    }
                },
            )
        }
        pendingExternalRoute.value?.let { route ->
            AlertDialog(
                onDismissRequest = { pendingExternalRoute.value = null },
                title = { Text(if (language == AppLanguage.English) "Discard unsaved changes?" else "放弃未保存的修改？") },
                text = {
                    Text(
                        if (language == AppLanguage.English) {
                            "Opening this task will leave the current editor. Your unsaved changes are still available if you keep editing."
                        } else {
                            "打开该任务会离开当前编辑页。选择继续编辑可保留当前未保存内容。"
                        },
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            editorNavigationGuard.value.discardDraft?.invoke()
                            editorNavigationGuard.value = EditorNavigationGuardState()
                            pendingExternalRoute.value = null
                            navController.navigateAfterAuthentication(route)
                        },
                    ) {
                        Text(if (language == AppLanguage.English) "Discard and open" else "放弃并打开")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { pendingExternalRoute.value = null }) {
                        Text(if (language == AppLanguage.English) "Keep editing" else "继续编辑")
                    }
                },
            )
        }
    }
}

@Composable
private fun AuthenticationLoadingScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun SharedBackupImportDialog(
    isEnglish: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(if (isEnglish) "Import backup?" else "\u5BFC\u5165\u5907\u4EFD\uFF1F")
        },
        text = {
            Text(
                if (isEnglish) {
                    "This shared file contains TaskBridge tasks. Importing will add them to local data and sync after confirmation."
                } else {
                    "\u8BE5\u5206\u4EAB\u5185\u5BB9\u5305\u542B TaskBridge \u4EFB\u52A1\u3002\u786E\u8BA4\u540E\u624D\u4F1A\u5199\u5165\u672C\u5730\u5E76\u540C\u6B65\u3002"
                },
            )
        },
        confirmButton = {
            Button(onClick = onConfirm) {
                Text(if (isEnglish) "Import" else "\u5BFC\u5165")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(if (isEnglish) "Cancel" else "\u53D6\u6D88")
            }
        },
    )
}

@Composable
private fun TaskBridgeNavHost(
    container: AppContainer,
    navController: NavHostController,
    sharedTextState: MutableState<String?>,
    language: AppLanguage,
    startDestination: String,
    localWorkspaceMode: Boolean,
    canContinueOffline: Boolean,
    onContinueOffline: () -> Unit,
    onSignInToSync: () -> Unit,
    onRequestNotificationPermission: () -> Unit,
    onEditorNavigationGuardChanged: (EditorNavigationGuardState) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val displayTimeZone by container.tokenDataStore.displayTimeZone.collectAsStateWithLifecycle(
        initialValue = ShanghaiTime.DEFAULT_ZONE_ID,
    )

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.Login) {
            val viewModel = viewModel<com.taskbridge.app.ui.login.LoginViewModel>(
                factory = LoginViewModelFactory(container.authRepository, container.syncManager, container.tokenDataStore),
            )
            LoginScreen(
                viewModel = viewModel,
                canContinueOffline = canContinueOffline,
                onLanguageChange = { nextLanguage ->
                    scope.launch {
                        container.tokenDataStore.saveLanguage(nextLanguage.code)
                    }
                },
                onLoginSuccess = {
                    navController.navigateAfterAuthentication(Routes.Today)
                },
                onContinueOffline = onContinueOffline,
                onRegisterClick = { navController.navigate(Routes.Register) },
            )
        }

        composable(Routes.Register) {
            val viewModel = viewModel<com.taskbridge.app.ui.login.RegisterViewModel>(
                factory = RegisterViewModelFactory(container.authRepository, container.syncManager, container.tokenDataStore),
            )
            RegisterScreen(
                viewModel = viewModel,
                onLanguageChange = { nextLanguage ->
                    scope.launch {
                        container.tokenDataStore.saveLanguage(nextLanguage.code)
                    }
                },
                onRegisterSuccess = {
                    navController.navigateAfterAuthentication(Routes.Today)
                },
                onLoginClick = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.TasksPattern,
            arguments = listOf(navArgument("filter") {
                type = NavType.StringType
                defaultValue = ""
            }),
        ) { backStackEntry ->
            val viewModel = viewModel<com.taskbridge.app.ui.task.TaskListViewModel>(
                factory = TaskListViewModelFactory(
                    context.applicationContext,
                    container.taskRepository,
                    container.syncManager,
                    container.tokenDataStore,
                ),
            )
            TaskListScreen(
                viewModel = viewModel,
                todayOnly = false,
                localWorkspaceMode = localWorkspaceMode,
                initialFilter = taskListFilterFromRoute(backStackEntry.arguments?.getString("filter")),
                onAddClick = { navController.navigate(Routes.Editor) },
                onTaskClick = { navController.navigate(Routes.taskDetail(it)) },
                onEditClick = { navController.navigate(Routes.editTask(it)) },
                onSettingsClick = { navController.navigate(Routes.Settings) },
                onSyncDetailsClick = { navController.navigate(Routes.settings("sync-recovery")) },
                onSignInToSync = onSignInToSync,
                onTodayClick = { navController.navigateTopLevel(Routes.Today) },
                onAllClick = { },
            )
        }

        composable(Routes.Today) {
            val viewModel = viewModel<com.taskbridge.app.ui.task.TaskListViewModel>(
                factory = TaskListViewModelFactory(
                    context.applicationContext,
                    container.taskRepository,
                    container.syncManager,
                    container.tokenDataStore,
                ),
            )
            TaskListScreen(
                viewModel = viewModel,
                todayOnly = true,
                localWorkspaceMode = localWorkspaceMode,
                onAddClick = { navController.navigate(Routes.EditorToday) },
                onTaskClick = { navController.navigate(Routes.taskDetail(it)) },
                onEditClick = { navController.navigate(Routes.editTask(it)) },
                onSettingsClick = { navController.navigate(Routes.Settings) },
                onSyncDetailsClick = { navController.navigate(Routes.settings("sync-recovery")) },
                onSignInToSync = onSignInToSync,
                onTodayClick = { },
                onAllClick = { navController.navigateTopLevel(Routes.tasks()) },
            )
        }

        composable(Routes.Editor) {
            EditorRoute(
                container = container,
                localId = null,
                entryPreset = EditorEntryPreset.Default,
                displayTimeZone = displayTimeZone,
                sharedTextState = sharedTextState,
                onRequestNotificationPermission = onRequestNotificationPermission,
                onNavigationGuardChanged = onEditorNavigationGuardChanged,
                onSaved = {
                    sharedTextState.value = null
                    navController.popBackStack()
                },
                onCancel = {
                    sharedTextState.value = null
                    navController.popBackStack()
                },
            )
        }

        composable(Routes.EditorToday) {
            EditorRoute(
                container = container,
                localId = null,
                entryPreset = EditorEntryPreset.Today,
                displayTimeZone = displayTimeZone,
                sharedTextState = sharedTextState,
                onRequestNotificationPermission = onRequestNotificationPermission,
                onNavigationGuardChanged = onEditorNavigationGuardChanged,
                onSaved = {
                    sharedTextState.value = null
                    navController.popBackStack()
                },
                onCancel = {
                    sharedTextState.value = null
                    navController.popBackStack()
                },
            )
        }

        composable(Routes.EditorPattern) { backStackEntry ->
            val localId = backStackEntry.arguments?.getString("localId")
            EditorRoute(
                container = container,
                localId = localId,
                entryPreset = EditorEntryPreset.Default,
                displayTimeZone = displayTimeZone,
                sharedTextState = sharedTextState,
                onRequestNotificationPermission = onRequestNotificationPermission,
                onNavigationGuardChanged = onEditorNavigationGuardChanged,
                onSaved = {
                    sharedTextState.value = null
                    navController.popBackStack()
                },
                onCancel = {
                    sharedTextState.value = null
                    navController.popBackStack()
                },
            )
        }

        composable(Routes.TaskDetailPattern) { backStackEntry ->
            val localId = backStackEntry.arguments?.getString("localId").orEmpty()
            TaskDetailScreen(
                taskRepository = container.taskRepository,
                localId = localId,
                displayTimeZone = displayTimeZone,
                onBack = {
                    if (!navController.popBackStack()) {
                        navController.navigate(Routes.Today) {
                            launchSingleTop = true
                        }
                    }
                },
                onAddClick = { navController.navigate(Routes.Editor) },
                onEditClick = { navController.navigate(Routes.editTask(it)) },
                onTaskChanged = {
                    TodayTaskWidgetUpdateWorker.enqueue(context.applicationContext)
                    container.syncManager.enqueueNetworkSync()
                    container.syncManager.syncNow()
                },
            )
        }

        composable(
            route = Routes.SettingsPattern,
            arguments = listOf(navArgument("section") {
                type = NavType.StringType
                defaultValue = ""
            }),
        ) { backStackEntry ->
            SettingsScreen(
                taskRepository = container.taskRepository,
                authRepository = container.authRepository,
                syncManager = container.syncManager,
                tokenDataStore = container.tokenDataStore,
                language = language,
                initialSection = backStackEntry.arguments?.getString("section"),
                onLanguageChange = { nextLanguage ->
                    scope.launch {
                        container.tokenDataStore.saveLanguage(nextLanguage.code)
                    }
                },
                onBack = { navController.popBackStack() },
                onOpenConflictTasks = { navController.navigate(Routes.tasks("conflict")) },
                onLogout = {
                    scope.launch {
                        container.authRepository.logout()
                        navController.navigateToAuthentication()
                    }
                },
            )
        }
    }
}

private fun NavHostController.navigateTopLevel(route: String) {
    navigate(route) {
        popUpTo(Routes.Today) {
            saveState = true
        }
        launchSingleTop = true
        restoreState = true
    }
}

private fun NavHostController.navigateAfterAuthentication(targetRoute: String) {
    navigate(Routes.Today) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
    if (targetRoute != Routes.Today) {
        navigate(targetRoute) {
            launchSingleTop = true
        }
    }
}

private fun NavHostController.navigateToAuthentication() {
    navigate(Routes.Login) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
}

@Composable
private fun EditorRoute(
    container: AppContainer,
    localId: String?,
    entryPreset: EditorEntryPreset,
    displayTimeZone: String,
    sharedTextState: MutableState<String?>,
    onRequestNotificationPermission: () -> Unit,
    onNavigationGuardChanged: (EditorNavigationGuardState) -> Unit,
    onSaved: () -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val viewModel = viewModel<com.taskbridge.app.ui.editor.EditorViewModel>(
        factory = EditorViewModelFactory(
            context.applicationContext,
            container.taskRepository,
            container.syncManager,
            container.tokenDataStore,
        ),
    )
    val editorState by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(editorState.hasUnsavedChanges) {
        onNavigationGuardChanged(
            EditorNavigationGuardState(
                hasUnsavedChanges = editorState.hasUnsavedChanges,
                discardDraft = viewModel::discardDraft,
            ),
        )
    }
    DisposableEffect(viewModel) {
        onDispose { onNavigationGuardChanged(EditorNavigationGuardState()) }
    }
    LaunchedEffect(localId, entryPreset) {
        if (!localId.isNullOrBlank()) {
            viewModel.loadTask(localId)
        } else {
            viewModel.startNewTask(entryPreset)
        }
    }
    LaunchedEffect(sharedTextState.value) {
        val text = sharedTextState.value ?: return@LaunchedEffect
        if (isTaskBridgeBackupText(text)) return@LaunchedEffect
        val draft = sharedTextToEditorDraft(text)
        viewModel.updateTitle(draft.title)
        viewModel.updateContent(draft.content)
        sharedTextState.value = null
    }
    EditorScreen(
        viewModel = viewModel,
        displayTimeZone = displayTimeZone,
        onRequestNotificationPermission = onRequestNotificationPermission,
        onSaved = onSaved,
        onCancel = onCancel,
    )
}

private fun sharedTextFromIntent(context: Context, intent: Intent?): String? {
    val mimeType = intent?.type ?: return null
    if (intent.action != Intent.ACTION_SEND || mimeType !in setOf("text/plain", "application/json")) return null
    val raw = intent.getStringExtra(Intent.EXTRA_TEXT)
        ?: sharedStreamUri(intent)?.let { streamUri ->
            context.contentResolver.openInputStream(streamUri)?.use { input ->
                readUtf8TextWithLimit(input, sharedPayloadReadLimit(mimeType))
            }
        }
        ?: return null
    val text = raw.trim().takeIf { it.isNotBlank() } ?: return null
    return requireSharedPayloadWithinLimit(text, isTaskBridgeBackupText(text))
}

private fun sharedStreamUri(intent: Intent): Uri? {
    @Suppress("DEPRECATION")
    val extraStream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    if (extraStream != null) return extraStream
    return intent.clipData
        ?.takeIf { it.itemCount > 0 }
        ?.getItemAt(0)
        ?.uri
}

private fun isTaskBridgeBackupText(value: String): Boolean {
    return runCatching {
        val root = JsonParser.parseString(value).asJsonObject
        val format = root.get("format")?.takeIf { !it.isJsonNull }?.asString
        format in setOf(
            "taskbridge.local.backup.v1",
            "taskbridge.android.backup.v1",
            "taskbridge.desktop.backup.v1",
        ) && root.get("tasks")?.isJsonArray == true
    }.getOrDefault(false)
}

@Composable
private fun ForegroundWebSocketLifecycle(container: AppContainer) {
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> container.syncManager.connectForegroundWebSocket()
                Lifecycle.Event.ON_STOP -> container.syncManager.disconnectForegroundWebSocket()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            container.syncManager.disconnectForegroundWebSocket()
        }
    }
}

@Composable
private fun TaskBridgeTheme(content: @Composable () -> Unit) {
    val colors = lightColorScheme(
        primary = Color(0xFF116C5B),
        onPrimary = Color.White,
        primaryContainer = Color(0xFFD8EFE9),
        onPrimaryContainer = Color(0xFF084A3F),
        secondary = Color(0xFF5D6F6B),
        onSecondary = Color.White,
        tertiary = Color(0xFF8E6B2B),
        surface = Color(0xFFFFFFFF),
        surfaceVariant = Color(0xFFE7EEEB),
        background = Color(0xFFF6F8F7),
        onSurface = Color(0xFF1D2624),
        onSurfaceVariant = Color(0xFF5A6663),
        outline = Color(0xFFB6C4BF),
        outlineVariant = Color(0xFFD7E0DD),
    )
    MaterialTheme(
        colorScheme = colors,
        shapes = Shapes(
            extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
            small = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
            extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
        ),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = colors.background,
        ) {
            content()
        }
    }
}

data class WidgetLaunchTarget(
    val target: String,
    val localId: String?,
) {
    fun toRoute(): String {
        return when (target) {
            WidgetConstants.TARGET_ALL -> Routes.tasks()
            WidgetConstants.TARGET_ADD -> Routes.Editor
            WidgetConstants.TARGET_TASK -> localId?.let { Routes.taskDetail(it) } ?: Routes.Today
            else -> Routes.Today
        }
    }

    companion object {
        fun fromIntent(intent: android.content.Intent?): WidgetLaunchTarget? {
            val target = intent?.getStringExtra(WidgetConstants.EXTRA_WIDGET_TARGET) ?: return null
            return WidgetLaunchTarget(
                target = target,
                localId = intent.getStringExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID),
            )
        }
    }
}

private fun taskListFilterFromRoute(filter: String?): TaskListFilter {
    return when (filter?.trim()?.lowercase()) {
        "conflict" -> TaskListFilter.Conflict
        else -> TaskListFilter.All
    }
}
