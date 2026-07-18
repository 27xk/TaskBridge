package com.taskbridge.app.data.local

import androidx.room.withTransaction
import com.taskbridge.app.data.datastore.WorkspaceIdentity
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.datastore.legacyWorkspaceId
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class WorkspaceMigrationCoordinator(
    private val database: AppDatabase,
    private val taskDao: TaskDao,
    private val syncQueueDao: SyncQueueDao,
    private val tokenDataStore: TokenDataStore,
) {
    private val mutex = Mutex()
    private val initializedWorkspaces = mutableSetOf<String>()

    suspend fun ensureWorkspace(workspace: WorkspaceIdentity) {
        if (workspace.id in initializedWorkspaces) return
        mutex.withLock {
            if (workspace.id in initializedWorkspaces) return
            database.withTransaction {
                claim(legacyWorkspaceId(workspace.userId), workspace)
                claim(legacyWorkspaceId("legacy"), workspace)
            }
            initializedWorkspaces += workspace.id
        }
    }

    private suspend fun claim(legacyId: String, workspace: WorkspaceIdentity) {
        val legacyOwnerUserId = legacyId.removePrefix("legacy:")
        val claimAllowed = tokenDataStore.canClaimLegacyWorkspace(legacyOwnerUserId, workspace)
        if (!claimAllowed) return
        taskDao.claimLegacyWorkspace(legacyId, workspace.id, workspace.userId)
        syncQueueDao.claimLegacyWorkspace(legacyId, workspace.id, workspace.userId)
    }
}
