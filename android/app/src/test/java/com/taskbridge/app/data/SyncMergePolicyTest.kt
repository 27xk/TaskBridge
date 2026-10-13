package com.taskbridge.app.data

import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.repository.shouldPreserveLocalTaskOnPull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncMergePolicyTest {
    @Test
    fun preservesEveryLocalStateThatHasNotBeenSafelySynced() {
        assertTrue(task("pending_update").let(::shouldPreserveLocalTaskOnPull))
        assertTrue(task("pending_delete").let(::shouldPreserveLocalTaskOnPull))
        assertTrue(task("sync_failed").let(::shouldPreserveLocalTaskOnPull))
        assertTrue(task("conflict").let(::shouldPreserveLocalTaskOnPull))
        assertFalse(task("synced").let(::shouldPreserveLocalTaskOnPull))
    }

    private fun task(status: String): TaskEntity = TaskEntity(
        localId = "local-1",
        workspaceId = "workspace",
        ownerUserId = "1",
        serverId = 1,
        title = "Task",
        content = null,
        status = "todo",
        priority = 0,
        tag = null,
        project = null,
        listType = "inbox",
        dueTime = null,
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
        version = 1,
        isDeleted = false,
        syncStatus = status,
        conflictServerJson = null,
        conflictLocalJson = null,
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-01T00:00:00Z",
        lastSyncAt = null,
    )
}
