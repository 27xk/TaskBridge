package com.taskbridge.app.data

import com.taskbridge.app.data.datastore.WorkspaceIdentity
import com.taskbridge.app.data.local.APP_DATABASE_VERSION
import com.taskbridge.app.data.local.SyncQueueEntity
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.repository.remoteTaskLocalId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class WorkspaceEntityContractTest {
    @Test
    fun roomRowsCarryAnExplicitWorkspaceId() {
        check(TaskEntity::class.java.declaredFields.any { it.name == "workspaceId" })
        check(SyncQueueEntity::class.java.declaredFields.any { it.name == "workspaceId" })
        assertEquals(7, APP_DATABASE_VERSION)
    }

    @Test
    fun pulledTaskLocalIdsCannotCollideAcrossServerOrigins() {
        val first = WorkspaceIdentity.create("https://one.example", "5")
        val second = WorkspaceIdentity.create("https://two.example", "5")

        assertNotEquals(remoteTaskLocalId(first, 11), remoteTaskLocalId(second, 11))
        assertEquals(remoteTaskLocalId(first, 11), remoteTaskLocalId(first, 11))
    }
}
