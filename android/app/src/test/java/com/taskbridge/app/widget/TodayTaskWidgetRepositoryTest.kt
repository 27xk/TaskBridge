package com.taskbridge.app.widget

import com.taskbridge.app.data.local.TaskEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayTaskWidgetRepositoryTest {
    @Test
    fun includesDueOrReminderTasksForToday() {
        val today = "2026-05-17"

        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(dueTime = "2026-05-17T09:00:00Z"),
                today = today,
            ),
        )
        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(remindTime = "2026-05-17T08:30:00Z"),
                today = today,
            ),
        )
    }

    @Test
    fun includesHighPriorityOpenTasksWithoutTodayTime() {
        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(priority = 3),
                today = "2026-05-17",
            ),
        )
    }

    @Test
    fun excludesDeletedLowPriorityAndCompletedTasks() {
        val today = "2026-05-17"

        assertFalse(TodayTaskWidgetRepository.isWidgetCandidate(task(priority = 1), today))
        assertFalse(TodayTaskWidgetRepository.isWidgetCandidate(task(isDeleted = true), today))
        assertFalse(TodayTaskWidgetRepository.isWidgetCandidate(task(status = "completed"), today))
    }

    private fun task(
        status: String = "todo",
        priority: Int = 0,
        dueTime: String? = null,
        remindTime: String? = null,
        isDeleted: Boolean = false,
    ): TaskEntity {
        return TaskEntity(
            localId = "local-1",
            serverId = null,
            title = "Task",
            content = null,
            status = status,
            priority = priority,
            tag = null,
            dueTime = dueTime,
            remindTime = remindTime,
            repeatRule = null,
            version = 0,
            isDeleted = isDeleted,
            syncStatus = "synced",
            createdAt = "2026-05-17T07:00:00Z",
            updatedAt = "2026-05-17T07:00:00Z",
            lastSyncAt = null,
        )
    }
}
