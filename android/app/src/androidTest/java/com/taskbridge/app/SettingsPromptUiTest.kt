package com.taskbridge.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import com.taskbridge.app.ui.components.AppFeedbackHost
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import com.taskbridge.app.ui.settings.SettingsScreen
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class SettingsPromptUiTest {
    @get:Rule val compose = createComposeRule()

    private val container
        get() = ApplicationProvider.getApplicationContext<TaskBridgeApplication>().container
    private val settingsVisible = mutableStateOf(false)
    private var contentInstalled = false
    private var previousApi: String? = null
    private var previousSocket: String? = null

    @Before
    fun prepareWorkspace(): Unit = runBlocking {
        val tokens = container.tokenDataStore
        previousApi = tokens.apiBaseUrl.first()
        previousSocket = tokens.webSocketUrl.first()
        container.syncManager.disconnectForegroundWebSocket()
        // A debug workspace requires a persisted origin, not only a user ID and tokens.
        // Port 9 also keeps synthetic sessions isolated from a configured server.
        tokens.saveNetworkEndpoints("http://127.0.0.1:9/api/v1/", "ws://127.0.0.1:9/ws/sync")
        tokens.saveTokens(
            "synthetic-settings-prompts", "synthetic-settings-refresh", userId = 987654327,
        )
        val workspace = checkNotNull(tokens.currentWorkspace.first()) { "Test workspace was not established" }
        check(workspace.serverOrigin == "http://127.0.0.1:9")
        check(workspace.userId == "987654327")
        container.taskRepository.getSyncQueueCounts()
        settingsVisible.value = true
    }

    @After
    fun clearWorkspace() {
        try {
            if (contentInstalled) {
                compose.runOnUiThread { settingsVisible.value = false }
                compose.waitForIdle()
            }
        } finally {
            runBlocking {
                container.syncManager.disconnectForegroundWebSocket()
                container.tokenDataStore.clear()
                val api = previousApi
                val socket = previousSocket
                if (api != null && socket != null) {
                    container.tokenDataStore.saveNetworkEndpoints(api, socket)
                }
            }
        }
    }

    @Test
    fun dismissedValidationFeedbackDoesNotReplayOnCategoryReturnAndCanRepeat() {
        showSettings("connection")
        compose.waitUntil(5_000) {
            compose.onAllNodes(hasSetTextAction()).fetchSemanticsNodes()
                .singleOrNull()?.config?.get(SemanticsProperties.EditableText)?.text?.isNotBlank() == true
        }
        compose.onNode(hasSetTextAction()).performTextReplacement("")
        compose.onNodeWithText("检查连接").performClick()
        compose.onNodeWithTag("app_toast").assertIsDisplayed()
        compose.onNodeWithText("关闭").performClick()
        compose.onNodeWithTag("app_toast").assertDoesNotExist()

        selectCategory("连接", "偏好")
        selectCategory("偏好", "连接")
        compose.onNodeWithTag("app_toast").assertDoesNotExist()

        compose.onNodeWithText("检查连接").performClick()
        compose.onNodeWithTag("app_toast").assertIsDisplayed()
    }

    @Test
    fun exportRequiresExplicitConfirmationAndCanBeCancelled() {
        showSettings("data")
        compose.onNodeWithText("导出本地备份").performScrollTo().performClick()
        compose.onNodeWithTag("app_popconfirm").assertIsDisplayed()
        compose.onNodeWithTag("app_drawer").assertDoesNotExist()
        compose.onNodeWithText("取消").performClick()
        compose.onNodeWithTag("app_popconfirm").assertDoesNotExist()
        compose.onNodeWithContentDescription("设置分类: 数据与备份").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun technicalDiagnosticsUsesADismissibleDrawer() {
        showSettings("sync-recovery")
        compose.onNodeWithText("查看高级诊断").performScrollTo().performClick()
        compose.onNodeWithTag("app_drawer").assertIsDisplayed()
        compose.onNodeWithTag("app_popconfirm").assertDoesNotExist()
        compose.onNodeWithText("关闭").performClick()
        compose.onNodeWithTag("app_drawer").assertDoesNotExist()
        compose.onNodeWithContentDescription("设置分类: 同步问题").performScrollTo().assertIsDisplayed()
    }

    private fun selectCategory(current: String, next: String) {
        compose.onNodeWithContentDescription("设置分类: $current").performScrollTo().performClick()
        compose.onNodeWithText(next).performClick()
    }

    private fun showSettings(section: String) {
        contentInstalled = true
        compose.setContent {
            if (settingsVisible.value) {
                MaterialTheme {
                    TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                        AppFeedbackHost {
                            SettingsScreen(
                                taskRepository = container.taskRepository,
                                authRepository = container.authRepository,
                                syncManager = container.syncManager,
                                tokenDataStore = container.tokenDataStore,
                                language = AppLanguage.Chinese,
                                initialSection = section,
                                onLanguageChange = {},
                                onBack = {},
                                onOpenConflictTasks = {},
                                onLogout = {},
                                onTodayClick = {},
                                onAllClick = {},
                            )
                        }
                    }
                }
            }
        }
    }
}
