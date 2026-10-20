package com.taskbridge.app.ui.task

import com.taskbridge.app.ui.components.SyncStatusMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskFeedbackTest {
    @Test
    fun repeatedActionsProduceDistinctToastEvents() {
        val first = TaskListUiState().withSyncMessage(SyncStatusMessage.CompletionQueued)
        val second = first.withSyncMessage(SyncStatusMessage.CompletionQueued)

        assertEquals(SyncStatusMessage.CompletionQueued, second.feedback?.message)
        assertNotEquals(first.feedback?.id, second.feedback?.id)
        assertEquals(first.feedbackId + 1L, second.feedbackId)
    }

    @Test
    fun backgroundStatusesDoNotCreateToastsOrReplaceActionFeedback() {
        var state = TaskListUiState()
        listOf(SyncStatusMessage.LocalCacheReady, SyncStatusMessage.Syncing, SyncStatusMessage.Offline).forEach {
            state = state.withSyncMessage(it)
            assertNull(state.feedback)
        }
        val completed = state.withSyncMessage(SyncStatusMessage.CompletionQueued)
        val syncing = completed.withSyncMessage(SyncStatusMessage.Syncing)
        assertEquals(completed.feedback, syncing.feedback)
        assertEquals(SyncStatusMessage.Syncing, syncing.syncMessage)
    }

    @Test
    fun dismissingAnOlderToastKeepsTheNewerResult() {
        val first = TaskListUiState().withSyncMessage(SyncStatusMessage.CompletionQueued)
        val second = first.withSyncMessage(SyncStatusMessage.DeleteQueued)

        assertEquals(second.feedback, second.dismissFeedback(first.feedback!!.id).feedback)
        assertNull(second.dismissFeedback(second.feedback!!.id).feedback)
    }

    @Test
    fun onlyActionAndSyncFailuresUseErrorFeedback() {
        listOf(SyncStatusMessage.PurgeFailed, SyncStatusMessage.PurgeRequiresConnection, SyncStatusMessage.SyncFailed).forEach {
            assertTrue(TaskListUiState().withSyncMessage(it).feedback!!.isError)
        }
        listOf(SyncStatusMessage.Purged, SyncStatusMessage.SyncSucceeded, SyncStatusMessage.BatchDeleted(2)).forEach {
            assertFalse(TaskListUiState().withSyncMessage(it).feedback!!.isError)
        }
    }
}
