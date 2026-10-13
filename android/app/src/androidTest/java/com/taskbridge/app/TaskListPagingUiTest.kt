package com.taskbridge.app

import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.time.Instant

class TaskListPagingUiTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun all260TasksAreReachableAndSelectionIsLimitedToTheCurrentPage() = runBlocking {
        val application = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
        val container = application.container
        val tokens = container.tokenDataStore
        val oldApi = tokens.apiBaseUrl.first()
        val oldSocket = tokens.webSocketUrl.first()
        tokens.saveNetworkEndpoints("http://127.0.0.1:9/api/v1/", "ws://127.0.0.1:9/ws/sync")
        tokens.saveTokens("synthetic-ui", "synthetic-ui-refresh", userId = 987654323)
        tokens.expireSession()
        tokens.saveDisplayTimeZone("Asia/Shanghai")
        val workspace = checkNotNull(tokens.currentWorkspace.first())
        val database = AppDatabase.getInstance(application)
        val now = Instant.now().toString()
        val rows = (1..260).map { number ->
            TaskEntity(
                localId = "remediation-ui-$number", workspaceId = workspace.id, ownerUserId = workspace.userId, serverId = null,
                title = "SyntheticTask-${number.toString().padStart(3, '0')}", content = "Full body $number", status = "todo",
                priority = 0, tag = null, project = null, listType = "today", dueTime = null, remindTime = null,
                repeatRule = null, plannedDate = ShanghaiTime.todayString(), completedAt = null, snoozedUntil = null,
                parentServerId = null, checklistJson = "[]", isTemplate = false, templateName = null, sortOrder = number,
                version = 0, isDeleted = false, syncStatus = "synced", conflictServerJson = null, conflictLocalJson = null,
                createdAt = now, updatedAt = now, lastSyncAt = null,
            )
        }
        database.taskDao().upsertAll(rows)
        val store = ViewModelStore()
        val viewModel = ViewModelProvider(store, TaskListViewModelFactory(application, container.taskRepository, container.syncManager, tokens))[TaskListViewModel::class.java]
        try {
            compose.setContent {
                MaterialTheme {
                    TaskBridgeLanguageProvider(AppLanguage.Chinese) {
                        TaskListScreen(
                            viewModel = viewModel, todayOnly = true, localWorkspaceMode = true,
                            onAddClick = {}, onTaskClick = {}, onEditClick = {}, onSettingsClick = {},
                            onSyncDetailsClick = {}, onSignInToSync = {}, onTodayClick = {}, onAllClick = {},
                        )
                    }
                }
            }
            waitForText("1–100 / 260")
            if (androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("capturePss") == "true") {
                compose.waitForIdle()
                delayForBaseline()
                val directory = File(application.getExternalFilesDir(null), "remediation").apply { mkdirs() }
                val memory = android.os.Debug.MemoryInfo().also(android.os.Debug::getMemoryInfo)
                File(directory, "paging-pss.json").writeText(org.json.JSONObject().apply {
                    put("capturedAt", Instant.now().toString())
                    put("totalPssKb", memory.totalPss)
                    put("memoryStats", org.json.JSONObject(memory.memoryStats))
                    put("api", android.os.Build.VERSION.SDK_INT)
                    put("model", android.os.Build.MODEL)
                    put("variant", "debug-with-instrumentation")
                    put("tasks", 260)
                    put("pageSize", 100)
                }.toString(2))
                File(directory, "paging-pss.png").outputStream().use { output ->
                    compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, output)
                }
            }
            compose.onNodeWithText("SyntheticTask-001").performTouchInput { longClick() }
            compose.onNodeWithText("全选本页").performClick()
            compose.onNodeWithText(stringsFor(AppLanguage.Chinese).selectedCount.format(100)).assertIsDisplayed()
            compose.onNodeWithText("下一页").performClick()
            waitForText("101–200 / 260")
            compose.onNodeWithText("全选本页").assertDoesNotExist()
            compose.onNodeWithText("下一页").performClick()
            waitForText("201–260 / 260")
            compose.onNodeWithText("下一页").assertIsNotEnabled()
            val directory = File(application.getExternalFilesDir(null), "remediation").apply { mkdirs() }
            File(directory, "paging-last.png").outputStream().use { output ->
                compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, output)
            }
            compose.onNode(hasSetTextAction()).performTextInput("SyntheticTask-260")
            compose.waitUntil(10_000) { compose.onAllNodesWithText("下一页").fetchSemanticsNodes().isEmpty() }
            compose.onNode(hasText("SyntheticTask-260") and hasSetTextAction().not()).assertIsDisplayed()
            compose.onNodeWithText("下一页").assertDoesNotExist()
        } finally {
            store.clear()
            database.withTransaction { rows.forEach { database.taskDao().deleteByLocalId(workspace.id, it.localId) } }
            tokens.clear()
            tokens.saveNetworkEndpoints(oldApi, oldSocket)
        }
    }

    private fun waitForText(text: String) {
        compose.waitUntil(10_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }

    private suspend fun delayForBaseline() = kotlinx.coroutines.delay(2_000)
}
