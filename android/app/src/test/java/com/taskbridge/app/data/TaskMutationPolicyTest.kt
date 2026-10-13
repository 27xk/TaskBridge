package com.taskbridge.app.data

import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import com.taskbridge.app.data.repository.mergeCreatedOccurrence
import com.taskbridge.app.data.repository.postponeTaskSnapshot
import com.taskbridge.app.notification.reminderTrigger
import com.taskbridge.app.widget.TodayTaskWidgetRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Test
import java.time.Instant

class TaskMutationPolicyTest {
    private val now = "2026-05-20T00:00:00Z"
    private val tomorrow = "2026-05-21T01:00:00Z"

    @Test
    fun postponingMovesOldRemindersOutOfTodayAndClearsSnooze() {
        listOf(null, "2026-05-19T07:00:00Z", "2026-05-20T08:00:00Z").forEach { reminder ->
            val original = task().copy(
                listType = "today",
                plannedDate = "2026-05-20",
                dueTime = "2026-05-20T09:00:00Z",
                remindTime = reminder,
                snoozedUntil = "2026-05-20T10:00:00Z",
            )
            val next = postponeTaskSnapshot(original, tomorrow, null, "2026-05-21", now)
            assertEquals("inbox", next.listType)
            assertEquals("pending_update", next.syncStatus)
            assertEquals(null, next.snoozedUntil)
            assertEquals(if (reminder == null) null else tomorrow, next.remindTime)
            assertEquals(tomorrow, reminderTrigger(next.remindTime, next.dueTime, next.snoozedUntil, Instant.parse(now)))
            assertFalse(TodayTaskWidgetRepository.isWidgetCandidate(
                task = TodayWidgetTaskProjection(
                    localId = next.localId, title = next.title, status = next.status, priority = next.priority,
                    dueTime = next.dueTime, remindTime = next.remindTime, plannedDate = next.plannedDate,
                    completedAt = next.completedAt, sortOrder = next.sortOrder, updatedAt = next.updatedAt,
                ),
                today = "2026-05-20", now = Instant.parse(now),
            ))
            assertEquals(reminder, original.remindTime)
        }
    }

    @Test
    fun postponingHonorsCustomRemindersAndRetainsUnsyncedCreation() {
        val next = postponeTaskSnapshot(task().copy(serverId = null), tomorrow, "2026-05-21T00:45:00Z", "2026-05-21", now)
        assertEquals("2026-05-21T00:45:00Z", next.remindTime)
        assertEquals("pending_create", next.syncStatus)
    }

    @Test
    fun repeatedNextOccurrencePreservesEveryUnresolvedLocalSnapshot() {
        val remote = task().copy(localId = "remote-child", title = "Server title", version = 8)
        listOf("pending_create", "pending_update", "pending_delete", "sync_failed", "conflict").forEach { status ->
            val local = task().copy(
                syncStatus = status,
                title = "Local edited child",
                content = "Local notes",
                conflictLocalJson = "local snapshot",
                conflictServerJson = "server snapshot",
                isDeleted = status == "pending_delete",
            )
            assertSame(local, mergeCreatedOccurrence(remote, local))
        }
    }

    @Test
    fun newAndSyncedOccurrencesAcceptRemoteFieldsWhilePreservingLocalIdentity() {
        val remote = task().copy(localId = "remote-child", title = "New server title", version = 8)
        assertEquals(remote, mergeCreatedOccurrence(remote, null))
        assertEquals(remote.copy(localId = "local-child"), mergeCreatedOccurrence(remote, task()))
    }

    @Test
    fun delayedOccurrencesDoNotRollBackAlreadySyncedNewerVersions() {
        val existing = task().copy(title = "Synced newer edit", version = 5)
        val delayed = task().copy(localId = "remote-child", title = "Old server title", version = 4)
        assertSame(existing, mergeCreatedOccurrence(delayed, existing))
    }

    private fun task() = TaskEntity(
        localId = "local-child", workspaceId = "workspace", ownerUserId = "1", serverId = 42,
        title = "Task", content = null, status = "todo", priority = 0, tag = null, project = null,
        listType = "inbox", dueTime = null, remindTime = null, repeatRule = "daily", plannedDate = null,
        completedAt = null, snoozedUntil = null, parentServerId = 41, checklistJson = "[]",
        isTemplate = false, templateName = null, sortOrder = 0, version = 1, isDeleted = false,
        syncStatus = "synced", conflictServerJson = null, conflictLocalJson = null,
        createdAt = now, updatedAt = now, lastSyncAt = null,
    )
}
