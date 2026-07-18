package com.taskbridge.app.data.repository

import androidx.room.withTransaction
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.datastore.WorkspaceIdentity
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.SyncQueueDao
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.local.WorkspaceMigrationCoordinator
import com.taskbridge.app.data.remote.ApiService
import com.taskbridge.app.data.remote.dto.DeviceRegisterRequestDto
import com.taskbridge.app.data.remote.dto.SyncPushRequestDto
import com.taskbridge.app.data.remote.dto.WebSocketTicketRequestDto
import com.taskbridge.app.domain.model.SyncStatus
import com.google.gson.Gson
import kotlinx.coroutines.flow.first
import java.time.Instant

private val syncRepositoryGson = Gson()

class SyncRepository(
    private val apiService: ApiService,
    private val database: AppDatabase,
    private val taskDao: TaskDao,
    private val syncQueueDao: SyncQueueDao,
    private val tokenDataStore: TokenDataStore,
    private val workspaceMigration: WorkspaceMigrationCoordinator = WorkspaceMigrationCoordinator(
        database,
        taskDao,
        syncQueueDao,
        tokenDataStore,
    ),
) {
    private companion object {
        const val PUSH_BATCH_SIZE = 100
        const val MAX_PUSH_BATCHES = 25
        const val PULL_PAGE_SIZE = 200
    }

    suspend fun syncNow(deviceId: String): Result<Unit> {
        return runCatching {
            val workspace = activeWorkspace() ?: return@runCatching
            ensureDeviceRegistered(deviceId, workspace)
            pushPendingChanges(deviceId, workspace)
            pullChanges(workspace)
        }
    }

    suspend fun createWebSocketTicket(deviceId: String): Result<String> {
        return runCatching {
            val workspace = activeWorkspace() ?: error("active workspace required")
            ensureDeviceRegistered(deviceId, workspace)
            apiService.createWebSocketTicket(WebSocketTicketRequestDto(deviceId), workspace.id)
                .data
                ?.ticket
                ?: error("missing websocket ticket")
        }
    }

    private suspend fun ensureDeviceRegistered(deviceId: String, workspace: WorkspaceIdentity) {
        apiService.registerDevice(
            DeviceRegisterRequestDto(
                deviceId = deviceId,
                deviceName = "Android phone",
                deviceType = "android",
            ),
            workspace.id,
        )
    }

    suspend fun pullChanges() {
        val workspace = activeWorkspace() ?: return
        pullChanges(workspace)
    }

    private suspend fun pullChanges(workspace: WorkspaceIdentity) {
        val lastSyncTime = tokenDataStore.lastSyncTimeFor(workspace) ?: "1970-01-01T00:00:00Z"
        var cursorUpdatedAt: String? = null
        var cursorId: Int? = null

        while (true) {
            val data = apiService.pullSync(
                lastSyncTime = lastSyncTime,
                limit = PULL_PAGE_SIZE,
                cursorUpdatedAt = cursorUpdatedAt,
                cursorId = cursorId,
                expectedWorkspaceId = workspace.id,
            ).data ?: return

            val remoteTasks = data.changedTasks + data.deletedTasks
            val existingByServerId: Map<Int, TaskEntity> = if (remoteTasks.isEmpty()) {
                emptyMap()
            } else {
                taskDao.getByServerIds(workspace.id, remoteTasks.map { it.id })
                    .mapNotNull { entity -> entity.serverId?.let { serverId -> serverId to entity } }
                    .toMap()
            }
            val entities = remoteTasks.map { remoteTask ->
                remoteTask.toEntity(
                    workspaceId = workspace.id,
                    ownerUserId = workspace.userId,
                    localId = existingByServerId[remoteTask.id]?.localId ?: remoteTaskLocalId(workspace, remoteTask.id),
                    syncStatus = SyncStatus.Synced,
                    lastSyncAt = data.serverTime,
                )
            }
            if (entities.isNotEmpty()) {
                database.withTransaction {
                    taskDao.upsertAll(entities)
                }
            }

            if (!data.hasMore) {
                ensureWorkspaceUnchanged(workspace)
                tokenDataStore.saveLastSyncTime(workspace, data.serverTime)
                return
            }
            cursorUpdatedAt = data.nextCursorUpdatedAt
                ?: error("sync pull response is missing the next cursor")
            cursorId = data.nextCursorId
                ?: error("sync pull response is missing the next cursor")
        }
    }

    private suspend fun pushPendingChanges(deviceId: String, workspace: WorkspaceIdentity) {
        var processedBatches = 0

        while (processedBatches < MAX_PUSH_BATCHES) {
            val pending = syncQueueDao.pendingChanges(workspace.id, PUSH_BATCH_SIZE)
            if (pending.isEmpty()) return

            val data = apiService.pushSync(
                SyncPushRequestDto(
                    deviceId = deviceId,
                    changes = pending.map { it.toDto() },
                ),
                workspace.id,
            ).data ?: return

            ensureWorkspaceUnchanged(workspace)

            val pendingByLocalId = pending.associateBy { it.localId }
            database.withTransaction {
                data.results.forEach { result ->
                    val queued = pendingByLocalId[result.localId] ?: return@forEach
                    when (result.status) {
                        "applied" -> {
                            result.task?.let { task ->
                                taskDao.upsert(
                                    task.toEntity(
                                        workspaceId = workspace.id,
                                        ownerUserId = workspace.userId,
                                        localId = result.localId,
                                        syncStatus = SyncStatus.Synced,
                                        lastSyncAt = data.serverTime,
                                    ),
                                )
                            } ?: taskDao.markSynced(
                                workspaceId = workspace.id,
                                localId = result.localId,
                                serverId = result.serverId,
                                version = result.version ?: queued.version,
                                updatedAt = Instant.now().toString(),
                                syncedAt = data.serverTime,
                            )
                            syncQueueDao.deleteById(workspace.id, queued.id)
                        }

                        "conflict" -> {
                            val localTask = taskDao.getByLocalId(workspace.id, result.localId)
                            if (localTask != null) {
                                taskDao.upsert(
                                    localTask.copy(
                                        serverId = result.serverId ?: result.serverTask?.id ?: localTask.serverId,
                                        version = result.version ?: result.serverTask?.version ?: localTask.version,
                                        syncStatus = SyncStatus.Conflict.wireName,
                                        conflictServerJson = result.serverTask?.let { syncRepositoryGson.toJson(it) },
                                        conflictLocalJson = syncRepositoryGson.toJson(localTask),
                                        lastSyncAt = data.serverTime,
                                    ),
                                )
                            } else {
                                result.serverTask?.let { task ->
                                    taskDao.upsert(
                                        task.toEntity(
                                            workspaceId = workspace.id,
                                            ownerUserId = workspace.userId,
                                            localId = result.localId,
                                            syncStatus = SyncStatus.Conflict,
                                            lastSyncAt = data.serverTime,
                                            conflictServerJson = syncRepositoryGson.toJson(task),
                                            conflictLocalJson = null,
                                        ),
                                    )
                                } ?: taskDao.updateSyncStatus(workspace.id, result.localId, SyncStatus.Conflict.wireName)
                            }
                            syncQueueDao.deleteById(workspace.id, queued.id)
                        }

                        "failed" -> {
                            val localTask = taskDao.getByLocalId(workspace.id, result.localId)
                            if (localTask != null) {
                                taskDao.upsert(
                                    localTask.copy(
                                        syncStatus = SyncStatus.Failed.wireName,
                                        conflictServerJson = null,
                                        conflictLocalJson = null,
                                    ),
                                )
                            } else {
                                taskDao.updateSyncStatus(workspace.id, result.localId, SyncStatus.Failed.wireName)
                            }
                            syncQueueDao.incrementAttempt(workspace.id, queued.id)
                        }

                        else -> syncQueueDao.incrementAttempt(workspace.id, queued.id)
                    }
                }
            }

            processedBatches += 1
            if (pending.size < PUSH_BATCH_SIZE) return
        }
    }

    private suspend fun activeWorkspace(): WorkspaceIdentity? {
        val workspace = tokenDataStore.currentWorkspace.first() ?: return null
        workspaceMigration.ensureWorkspace(workspace)
        return workspace
    }

    private suspend fun ensureWorkspaceUnchanged(expected: WorkspaceIdentity) {
        check(tokenDataStore.currentWorkspace.first() == expected) { "workspace changed during sync" }
    }
}

fun remoteTaskLocalId(workspace: WorkspaceIdentity, serverId: Int): String {
    return "${workspace.preferenceSuffix}-server-$serverId"
}
