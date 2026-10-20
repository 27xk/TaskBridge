package com.taskbridge.app

import android.graphics.Bitmap
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.SoftwareKeyboardController
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.room.withTransaction
import androidx.test.core.app.ApplicationProvider
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import com.taskbridge.app.ui.i18n.stringsFor
import com.taskbridge.app.ui.task.TaskListScreen
import com.taskbridge.app.ui.task.TaskListViewModel
import com.taskbridge.app.ui.task.TaskListViewModelFactory
import com.taskbridge.app.utils.ShanghaiTime
import java.io.File
import java.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class TaskHomeLayoutUiTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun shortScreenWithLargeTextKeepsTasksSearchAndPrimaryActionsReachable(): Unit = runBlocking {
        val application = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
        val container = application.container
        val tokens = container.tokenDataStore
        val oldApi = tokens.apiBaseUrl.first()
        val oldSocket = tokens.webSocketUrl.first()
        tokens.saveNetworkEndpoints("http://127.0.0.1:9/api/v1/", "ws://127.0.0.1:9/ws/sync")
        tokens.saveTokens("synthetic-home-ui", "synthetic-home-refresh", userId = 987654324)
        tokens.expireSession()
        tokens.saveDisplayTimeZone("Asia/Shanghai")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val database = AppDatabase.getInstance(application)
        val now = Instant.now().toString()
        val rows = listOf("Design target", "Another task").mapIndexed { index, title ->
            TaskEntity(
                localId = "home-layout-ui-$index", workspaceId = workspace.id, ownerUserId = workspace.userId, serverId = null,
                title = title, content = "Synthetic layout regression", status = "todo",
                priority = 0, tag = null, project = null, listType = "today", dueTime = null, remindTime = null,
                repeatRule = null, plannedDate = ShanghaiTime.todayString(), completedAt = null, snoozedUntil = null,
                parentServerId = null, checklistJson = "[]", isTemplate = false, templateName = null, sortOrder = index,
                version = 0, isDeleted = false, syncStatus = "synced", conflictServerJson = null, conflictLocalJson = null,
                createdAt = now, updatedAt = now, lastSyncAt = null,
            )
        }
        database.taskDao().upsertAll(rows)
        val store = ViewModelStore()
        val viewModel = ViewModelProvider(
            store, TaskListViewModelFactory(application, container.taskRepository, container.syncManager, tokens),
        )[TaskListViewModel::class.java]
        var openedTask: String? = null
        var adds = 0
        var todayVisits = 0
        var settingsVisits = 0
        var keyboard: SoftwareKeyboardController? = null
        val strings = stringsFor(AppLanguage.Chinese)
        try {
            compose.setContent {
                val density = LocalDensity.current
                keyboard = LocalSoftwareKeyboardController.current
                // This fixture represents an already cropped viewport, not the entire window.
                // Full-window IME behavior is checked separately by TaskHomeNavigationUiTest.
                Box(Modifier.requiredSize(width = 360.dp, height = 480.dp)
                    .consumeWindowInsets(WindowInsets.safeDrawing)) {
                    CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 1.6f)) {
                        MaterialTheme {
                            TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                                TaskListScreen(
                                    viewModel = viewModel, todayOnly = false, localWorkspaceMode = true,
                                    onAddClick = { adds++ }, onTaskClick = { openedTask = it }, onEditClick = {},
                                    onSettingsClick = { settingsVisits++ }, onSyncDetailsClick = {}, onSignInToSync = {},
                                    onTodayClick = { todayVisits++ }, onAllClick = {},
                                )
                            }
                        }
                    }
                }
            }
            compose.waitUntil(10_000) { viewModel.page.value.total == rows.size }
            compose.onNodeWithTag("home-nav-today").assertIsDisplayed().performClick()
            compose.onNodeWithTag("home-nav-settings").assertIsDisplayed().performClick()
            compose.onNodeWithTag("home-add-task").assertIsDisplayed().performClick()
            compose.runOnIdle {
                assertEquals(1, todayVisits)
                assertEquals(1, settingsVisits)
                assertEquals(1, adds)
            }

            val list = compose.onNodeWithTag("task-home-list")
            list.performScrollToNode(hasSetTextAction())
            compose.onNodeWithTag("home-filter").performClick()
            val filterDescription = "${strings.filter}: ${strings.all}"
            list.performScrollToNode(hasContentDescription(filterDescription))
            compose.onNodeWithContentDescription(filterDescription).performClick()
            compose.onNodeWithText(strings.overdue).performClick()
            compose.waitUntil(10_000) { viewModel.page.value.total == 0 }
            list.performScrollToNode(hasText(strings.showAllTasks))
            compose.onNodeWithText(strings.showAllTasks).performClick()
            compose.waitUntil(10_000) { viewModel.page.value.total == rows.size }

            list.performScrollToNode(hasText("Design target"))
            compose.onNodeWithText("Design target").assertIsDisplayed().performClick()
            compose.runOnIdle { assertEquals(rows.first().localId, openedTask) }

            // Selection must remain usable after scrolling the large header out of view.
            compose.onNodeWithText("Design target").performTouchInput { longClick() }
            compose.onNodeWithText(strings.selectedCount.format(1)).assertIsDisplayed()
            compose.onNodeWithText("取消选择").performClick()

            // The search field must still be reachable when it lives inside the scroll content.
            list.performScrollToNode(hasSetTextAction())
            compose.onNode(hasSetTextAction()).performTextInput("Design target")
            compose.waitUntil(10_000) { viewModel.page.value.total == 1 }
            compose.runOnIdle { keyboard?.hide() }
            list.performScrollToNode(hasText("Design target") and hasSetTextAction().not())
            compose.onNode(hasText("Design target") and hasSetTextAction().not()).assertIsDisplayed()
            compose.onAllNodesWithText("Another task").assertCountEquals(0)
            compose.onNodeWithTag("home-nav-settings").assertIsDisplayed()
            compose.onNodeWithTag("home-add-task").assertIsDisplayed()

            val directory = File(application.getExternalFilesDir(null), "home-layout").apply { mkdirs() }
            File(directory, "short-large-text.png").outputStream().use { output ->
                compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, output)
            }
        } finally {
            store.clear()
            database.withTransaction { rows.forEach { database.taskDao().deleteByLocalId(workspace.id, it.localId) } }
            tokens.clear()
            tokens.saveNetworkEndpoints(oldApi, oldSocket)
        }
    }
}
