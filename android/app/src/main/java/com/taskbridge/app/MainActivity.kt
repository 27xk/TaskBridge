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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.google.gson.JsonParser
import com.taskbridge.app.ui.editor.EditorEntryPreset
import com.taskbridge.app.ui.editor.EditorScreen
import com.taskbridge.app.ui.editor.sharedTextToEditorDraft
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import com.taskbridge.app.ui.editor.EditorViewModelFactory
import com.taskbridge.app.ui.login.LoginScreen
import com.taskbridge.app.ui.login.LoginViewModelFactory
import com.taskbridge.app.ui.login.RegisterScreen
import com.taskbridge.app.ui.login.RegisterViewModelFactory
import com.taskbridge.app.ui.settings.SettingsScreen
import com.taskbridge.app.ui.task.TaskDetailScreen
import com.taskbridge.app.ui.task.TaskListScreen
import com.taskbridge.app.ui.task.TaskListViewModelFactory
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

private const val MAX_SHARED_TEXT_BYTES = 20_000_000

private object Routes {
    const val Login = "login"
    const val Register = "register"
    const val Tasks = "tasks"
    const val Today = "today"
    const val Editor = "editor"
    const val EditorToday = "editor-today"
    const val EditorPattern = "editor/{localId}"
    const val Settings = "settings"
    const val SettingsPattern = "settings?section={section}"
    const val TaskDetailPattern = "task-detail/{localId}"

    fun settings(section: String? = null): String = if (section.isNullOrBlank()) Settings else "$Settings?section=$section"
    fun editTask(localId: String): String = "editor/$localId"
    fun taskDetail(localId: String): String = "task-detail/$localId"
}

class MainActivity : ComponentActivity() {
    private var widgetLaunchState: MutableState<WidgetLaunchTarget?>? = null
    private var sharedTextState: MutableState<String?>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer(applicationContext)
        container.reminderManager.ensureChannel()
        TodayTaskWidgetUpdateWorker.enqueue(this)
        widgetLaunchState = mutableStateOf(WidgetLaunchTarget.fromIntent(intent))
        sharedTextState = mutableStateOf(sharedTextFromIntent(applicationContext, intent))

        setContent {
            TaskBridgeTheme {
                val fallbackWidgetLaunchState = remember { mutableStateOf<WidgetLaunchTarget?>(null) }
                val fallbackSharedTextState = remember { mutableStateOf<String?>(null) }
                TaskBridgeApp(
                    container,
                    widgetLaunchState ?: fallbackWidgetLaunchState,
                    sharedTextState ?: fallbackSharedTextState,
                    onRequestNotificationPermission = ::requestNotificationPermissionIfNeeded,
                )
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        widgetLaunchState?.value = WidgetLaunchTarget.fromIntent(intent)
        sharedTextState?.value = sharedTextFromIntent(applicationContext, intent)
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
    onRequestNotificationPermission: () -> Unit,
) {
    val navController = rememberNavController()
    val appContext = LocalContext.current.applicationContext
    val token by container.tokenDataStore.accessToken.collectAsStateWithLifecycle(initialValue = null)
    val languageCode by container.tokenDataStore.language.collectAsStateWithLifecycle(initialValue = AppLanguage.Chinese.code)
    val language = AppLanguage.fromCode(languageCode)
    val widgetLaunchTarget = widgetLaunchState.value
    val sharedText = sharedTextState.value
    val scope = rememberCoroutineScope()

    ForegroundWebSocketLifecycle(container)

    LaunchedEffect(token, widgetLaunchTarget) {
        if (token.isNullOrBlank()) return@LaunchedEffect

        val targetRoute = widgetLaunchTarget?.toRoute() ?: Routes.Today
        if (widgetLaunchTarget != null || navController.currentDestination?.route == Routes.Login) {
            navController.navigate(targetRoute) {
                popUpTo(Routes.Login) { inclusive = true }
            }
            widgetLaunchState.value = null
        }
    }

    LaunchedEffect(token, sharedText) {
        if (token.isNullOrBlank() || sharedText.isNullOrBlank()) return@LaunchedEffect
        if (isTaskBridgeBackupText(sharedText)) return@LaunchedEffect
        navController.navigate(Routes.Editor)
    }

    TaskBridgeLanguageProvider(language) {
        TaskBridgeNavHost(container, navController, sharedTextState, language, onRequestNotificationPermission)
        val pendingBackupText = sharedText
        if (!token.isNullOrBlank() && pendingBackupText != null && isTaskBridgeBackupText(pendingBackupText)) {
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
    onRequestNotificationPermission: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val displayTimeZone by container.tokenDataStore.displayTimeZone.collectAsStateWithLifecycle(
        initialValue = ShanghaiTime.DEFAULT_ZONE_ID,
    )

    NavHost(navController = navController, startDestination = Routes.Login) {
        composable(Routes.Login) {
            val viewModel = viewModel<com.taskbridge.app.ui.login.LoginViewModel>(
                factory = LoginViewModelFactory(container.authRepository, container.syncManager, container.tokenDataStore),
            )
            LoginScreen(
                viewModel = viewModel,
                onLanguageChange = { nextLanguage ->
                    scope.launch {
                        container.tokenDataStore.saveLanguage(nextLanguage.code)
                    }
                },
                onLoginSuccess = {
                    navController.navigate(Routes.Today) {
                        popUpTo(Routes.Login) { inclusive = true }
                    }
                },
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
                    navController.navigate(Routes.Today) {
                        popUpTo(Routes.Login) { inclusive = true }
                    }
                },
                onLoginClick = { navController.popBackStack() },
            )
        }

        composable(Routes.Tasks) {
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
                onAddClick = { navController.navigate(Routes.Editor) },
                onTaskClick = { navController.navigate(Routes.taskDetail(it)) },
                onEditClick = { navController.navigate(Routes.editTask(it)) },
                onSettingsClick = { navController.navigate(Routes.Settings) },
                onSyncDetailsClick = { navController.navigate(Routes.settings("sync-recovery")) },
                onTodayClick = { navController.navigate(Routes.Today) },
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
                onAddClick = { navController.navigate(Routes.EditorToday) },
                onTaskClick = { navController.navigate(Routes.taskDetail(it)) },
                onEditClick = { navController.navigate(Routes.editTask(it)) },
                onSettingsClick = { navController.navigate(Routes.Settings) },
                onSyncDetailsClick = { navController.navigate(Routes.settings("sync-recovery")) },
                onTodayClick = { },
                onAllClick = { navController.navigate(Routes.Tasks) },
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
                onLogout = {
                    scope.launch {
                        container.authRepository.logout()
                        navController.navigate(Routes.Login) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                inclusive = true
                            }
                        }
                    }
                },
            )
        }
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
    val inlineText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotBlank() }
    if (inlineText != null) return inlineText

    val streamUri = sharedStreamUri(intent) ?: return null
    return readSharedStreamText(context, streamUri)?.trim()?.takeIf { it.isNotBlank() }
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

private fun readSharedStreamText(context: Context, uri: Uri): String? {
    return runCatching {
        context.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var totalBytes = 0
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                totalBytes += read
                if (totalBytes > MAX_SHARED_TEXT_BYTES) {
                    throw IllegalArgumentException("Shared payload is too large")
                }
                output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }.getOrNull()
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
            WidgetConstants.TARGET_ALL -> Routes.Tasks
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
