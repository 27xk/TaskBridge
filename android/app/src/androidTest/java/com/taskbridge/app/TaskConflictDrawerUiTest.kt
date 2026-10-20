package com.taskbridge.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.TaskBridgeLanguageProvider
import com.taskbridge.app.ui.i18n.stringsFor
import com.taskbridge.app.ui.task.ConflictSnapshotSummary
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class TaskConflictDrawerUiTest {
    @get:Rule val compose = createComposeRule()
    private val strings = stringsFor(AppLanguage.English)

    @Test
    fun reviewingAndCancellingDoesNotResolveUntilTheNestedConfirmationIsAccepted() {
        val choices = mutableListOf<String>()
        showConflict(onUseServer = { choices += "server" }, onOverwriteServer = { choices += "device" })

        compose.onNodeWithText("Review conflicting versions").performClick()
        compose.onNodeWithTag("app_drawer").assertIsDisplayed()
        compose.onNodeWithText(strings.keepServerVersion).performClick()
        compose.onNodeWithTag("app_popconfirm").assertIsDisplayed()
        compose.runOnIdle { assertEquals(emptyList<String>(), choices) }
        compose.onNodeWithText(strings.cancel).performClick()
        compose.onAllNodesWithTag("app_popconfirm").assertCountEquals(0)
        compose.onNodeWithTag("app_drawer").assertIsDisplayed()
        compose.runOnIdle { assertEquals(emptyList<String>(), choices) }

        compose.onNodeWithText(strings.keepDeviceVersion).performClick()
        compose.onNode(hasText(strings.keepDeviceVersion) and hasAnyAncestor(hasTestTag("app_popconfirm"))).performClick()
        compose.onAllNodesWithTag("app_popconfirm").assertCountEquals(0)
        compose.onAllNodesWithTag("app_drawer").assertCountEquals(0)
        compose.runOnIdle { assertEquals(listOf("device"), choices) }
    }

    @Test
    fun missingServerSnapshotCannotBeSelected() {
        showConflict(serverSnapshot = null)
        compose.onNodeWithText("Review conflicting versions").performClick()
        compose.onNodeWithText(strings.keepServerVersion).assertIsNotEnabled()
        compose.onNodeWithText("Close").performClick()
        compose.onAllNodesWithTag("app_drawer").assertCountEquals(0)
    }

    private fun showConflict(
        serverSnapshot: String? = """{"title":"Synced title","content":"Synced content"}""",
        onUseServer: () -> Unit = {},
        onOverwriteServer: () -> Unit = {},
    ) {
        val task = Task(
            localId = "conflict-drawer", serverId = 1, title = "Conflict task", content = "Device content",
            status = TaskStatus.Todo, priority = 0, tag = null, project = null, listType = "inbox",
            dueTime = null, remindTime = null, repeatRule = null, plannedDate = null, completedAt = null,
            snoozedUntil = null, parentServerId = null, checklistJson = "[]", isTemplate = false,
            templateName = null, sortOrder = 0, version = 1, isDeleted = false, syncStatus = SyncStatus.Conflict,
            conflictServerJson = serverSnapshot,
            conflictLocalJson = """{"title":"Device title","content":"Device content"}""",
            createdAt = "2026-10-20T00:00:00Z", updatedAt = "2026-10-20T00:00:00Z", lastSyncAt = null,
        )
        compose.setContent {
            MaterialTheme {
                TaskBridgeLanguageProvider(AppLanguage.English) {
                    ConflictSnapshotSummary(task, strings, "en-US", onUseServer, onOverwriteServer)
                }
            }
        }
    }
}
