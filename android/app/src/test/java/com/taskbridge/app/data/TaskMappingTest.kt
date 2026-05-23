package com.taskbridge.app.data

import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.domain.model.toDomain
import org.junit.Assert.assertEquals
import org.junit.Test

class TaskMappingTest {
    @Test
    fun taskEntityMapsToDomainModel() {
        val entity = TaskEntity(
            localId = "local-1",
            serverId = 10,
            title = "Sync Android app",
            content = "Build Room and Retrofit layers",
            status = "completed",
            priority = 2,
            tag = "android",
            project = null,
            listType = "inbox",
            dueTime = "2026-05-17T12:00:00Z",
            remindTime = null,
            repeatRule = null,
            plannedDate = null,
            completedAt = null,
            snoozedUntil = null,
            parentServerId = null,
            checklistJson = "[]",
            isTemplate = false,
            templateName = null,
            sortOrder = 0,
            version = 4,
            isDeleted = false,
            syncStatus = "synced",
            createdAt = "2026-05-17T10:00:00Z",
            updatedAt = "2026-05-17T11:00:00Z",
            lastSyncAt = "2026-05-17T11:30:00Z",
        )

        val task = entity.toDomain()

        assertEquals("local-1", task.localId)
        assertEquals(10, task.serverId)
        assertEquals(TaskStatus.Completed, task.status)
        assertEquals(SyncStatus.Synced, task.syncStatus)
    }
}
