package com.taskbridge.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.taskbridge.app.ui.editor.EditorScreen
import com.taskbridge.app.ui.editor.EditorViewModelFactory
import com.taskbridge.app.ui.login.LoginScreen
import com.taskbridge.app.ui.login.LoginViewModelFactory
import com.taskbridge.app.ui.login.RegisterScreen
import com.taskbridge.app.ui.login.RegisterViewModelFactory
import com.taskbridge.app.ui.settings.SettingsScreen
import com.taskbridge.app.ui.task.TaskDetailScreen
import com.taskbridge.app.ui.task.TaskListScreen
import com.taskbridge.app.ui.task.TaskListViewModelFactory
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.launch

private object Routes {
    const val Login = "login"
    const val Register = "register"
    const val Tasks = "tasks"
    const val Today = "today"
    const val Editor = "editor"
    const val Settings = "settings"
    const val TaskDetailPattern = "task-detail/{localId}"

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
        sharedTextState = mutableStateOf(sharedTextFromIntent(intent))

        setContent {
            TaskBridgeTheme {
                TaskBridgeApp(
                    container,
                    widgetLaunchState ?: mutableStateOf<WidgetLaunchTarget?>(null),
                    sharedTextState ?: mutableStateOf<String?>(null),
                )
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        widgetLaunchState?.value = WidgetLaunchTarget.fromIntent(intent)
        sharedTextState?.value = sharedTextFromIntent(intent)
    }
}

@Composable
fun TaskBridgeApp(
    container: AppContainer,
    widgetLaunchState: MutableState<WidgetLaunchTarget?>,
    sharedTextState: MutableState<String?>,
) {
    val navController = rememberNavController()
    val appContext = LocalContext.current.applicationContext
    val token by container.tokenDataStore.accessToken.collectAsStateWithLifecycle(initialValue = null)
    val widgetLaunchTarget = widgetLaunchState.value
    val sharedText = sharedTextState.value

    ForegroundWebSocketLifecycle(container)

    LaunchedEffect(token, widgetLaunchTarget) {
        if (token.isNullOrBlank()) return@LaunchedEffect

        val targetRoute = widgetLaunchTarget?.toRoute() ?: Routes.Tasks
        if (widgetLaunchTarget != null || navController.currentDestination?.route == Routes.Login) {
            navController.navigate(targetRoute) {
                popUpTo(Routes.Login) { inclusive = true }
            }
            widgetLaunchState.value = null
        }
    }

    LaunchedEffect(token, sharedText) {
        if (token.isNullOrBlank() || sharedText.isNullOrBlank()) return@LaunchedEffect
        if (sharedText.contains("\"tasks\"")) {
            container.taskRepository.importBackupJson(sharedText)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            container.syncManager.enqueueNetworkSync()
            container.syncManager.syncNow()
            sharedTextState.value = null
            return@LaunchedEffect
        }
        navController.navigate(Routes.Editor)
    }

    TaskBridgeNavHost(container, navController, sharedTextState)
}

@Composable
private fun TaskBridgeNavHost(
    container: AppContainer,
    navController: NavHostController,
    sharedTextState: MutableState<String?>,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    NavHost(navController = navController, startDestination = Routes.Login) {
        composable(Routes.Login) {
            val viewModel = viewModel<com.taskbridge.app.ui.login.LoginViewModel>(
                factory = LoginViewModelFactory(container.authRepository, container.syncManager),
            )
            LoginScreen(
                viewModel = viewModel,
                onLoginSuccess = {
                    navController.navigate(Routes.Tasks) {
                        popUpTo(Routes.Login) { inclusive = true }
                    }
                },
                onRegisterClick = { navController.navigate(Routes.Register) },
            )
        }

        composable(Routes.Register) {
            val viewModel = viewModel<com.taskbridge.app.ui.login.RegisterViewModel>(
                factory = RegisterViewModelFactory(container.authRepository, container.syncManager),
            )
            RegisterScreen(
                viewModel = viewModel,
                onRegisterSuccess = {
                    navController.navigate(Routes.Tasks) {
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
                ),
            )
            TaskListScreen(
                viewModel = viewModel,
                todayOnly = false,
                onAddClick = { navController.navigate(Routes.Editor) },
                onSettingsClick = { navController.navigate(Routes.Settings) },
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
                ),
            )
            TaskListScreen(
                viewModel = viewModel,
                todayOnly = true,
                onAddClick = { navController.navigate(Routes.Editor) },
                onSettingsClick = { navController.navigate(Routes.Settings) },
                onTodayClick = { },
                onAllClick = { navController.navigate(Routes.Tasks) },
            )
        }

        composable(Routes.Editor) {
            val viewModel = viewModel<com.taskbridge.app.ui.editor.EditorViewModel>(
                factory = EditorViewModelFactory(
                    context.applicationContext,
                    container.taskRepository,
                    container.syncManager,
                ),
            )
            LaunchedEffect(sharedTextState.value) {
                val text = sharedTextState.value ?: return@LaunchedEffect
                viewModel.updateTitle(text.take(255))
            }
            EditorScreen(
                viewModel = viewModel,
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
                onBack = { navController.popBackStack() },
                onAddClick = { navController.navigate(Routes.Editor) },
                onTaskChanged = {
                    TodayTaskWidgetUpdateWorker.enqueue(context.applicationContext)
                    container.syncManager.enqueueNetworkSync()
                    container.syncManager.syncNow()
                },
            )
        }

        composable(Routes.Settings) {
            SettingsScreen(
                taskRepository = container.taskRepository,
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

private fun sharedTextFromIntent(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return null
    return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotBlank() }
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
        primary = Color(0xFF137C6B),
        secondary = Color(0xFF52645F),
        surface = Color(0xFFF8FAF9),
        surfaceVariant = Color(0xFFE2EBE8),
        background = Color(0xFFF4F7F6),
    )
    MaterialTheme(colorScheme = colors, content = content)
}

data class WidgetLaunchTarget(
    val target: String,
    val localId: String?,
) {
    fun toRoute(): String {
        return when (target) {
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
