package com.taskbridge.app.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class TaskTimelineTest {
    private val now = Instant.parse("2026-05-20T08:00:00Z")

    @Test
    fun marksOnlyOpenPastDueTasksAsOverdue() {
        assertTrue(isTaskOverdue(TaskStatus.Todo.wireName, "2026-05-20T07:59:00Z", now))
        assertFalse(isTaskOverdue(TaskStatus.Todo.wireName, "2026-05-20T08:01:00Z", now))
        assertFalse(isTaskOverdue(TaskStatus.Completed.wireName, "2026-05-20T07:59:00Z", now))
        assertFalse(isTaskOverdue("done", "2026-05-20T07:59:00Z", now))
        assertFalse(isTaskOverdue(TaskStatus.Todo.wireName, null, now))
    }

    @Test
    fun sortsOpenTasksByOverdueThenUpcomingThenPlannedThenUntimedThenCompleted() {
        val tasks = listOf(
            task("done", status = TaskStatus.Completed, dueTime = "2026-05-20T07:00:00Z"),
            task("planned", plannedDate = "2026-05-20"),
            task("upcoming", dueTime = "2026-05-20T09:00:00Z"),
            task("untimed"),
            task("overdue-late", dueTime = "2026-05-20T07:30:00Z"),
            task("overdue-early", dueTime = "2026-05-19T10:00:00Z"),
        )

        val sorted = tasks.sortedByTaskTimeline(now, "Asia/Shanghai")

        assertEquals(
            listOf("overdue-early", "overdue-late", "upcoming", "planned", "untimed", "done"),
            sorted.map { it.localId },
        )
    }

    @Test
    fun sortsCompletedTasksByClosestRecentTimeFirst() {
        val tasks = listOf(
            task(
                "completed-old",
                status = TaskStatus.Completed,
                dueTime = "2026-05-20T07:00:00Z",
                completedAt = "2026-05-18T10:00:00Z",
            ),
            task(
                "completed-new",
                status = TaskStatus.Completed,
                dueTime = "2026-05-18T07:00:00Z",
                completedAt = "2026-05-20T07:30:00Z",
            ),
            task(
                "completed-fallback-updated",
                status = TaskStatus.Completed,
                updatedAt = "2026-05-19T12:00:00Z",
            ),
        )

        val sorted = tasks.sortedByTaskTimeline(now, "Asia/Shanghai")

        assertEquals(
            listOf("completed-new", "completed-fallback-updated", "completed-old"),
            sorted.map { it.localId },
        )
    }

    private fun task(
        id: String,
        status: TaskStatus = TaskStatus.Todo,
        dueTime: String? = null,
        plannedDate: String? = null,
        completedAt: String? = null,
        updatedAt: String = "2026-05-19T00:00:00Z",
    ): Task {
        return Task(
            localId = id,
            serverId = null,
            title = id,
            content = null,
            status = status,
            priority = 0,
            tag = null,
            project = null,
            listType = "inbox",
            dueTime = dueTime,
            remindTime = null,
            repeatRule = null,
            plannedDate = plannedDate,
            completedAt = completedAt,
            snoozedUntil = null,
            parentServerId = null,
            checklistJson = "[]",
            isTemplate = false,
            templateName = null,
            sortOrder = 0,
            version = 0,
            isDeleted = false,
            syncStatus = SyncStatus.Synced,
            createdAt = "2026-05-19T00:00:00Z",
            updatedAt = updatedAt,
            lastSyncAt = null,
        )
    }
}
