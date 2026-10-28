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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.first
import java.time.Instant

private val syncRepositoryGson = Gson()

data class SyncChanges(val workspaceId: String?, val localIds: Set<String>)

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
    private val onTasksChanged: suspend (workspaceId: String, localIds: Set<String>) -> Unit = { _, _ -> },
) {
    private val syncHealthReporter = SyncHealthReporter(
        currentWorkspaceId = { tokenDataStore.currentWorkspace.first()?.id },
        hasAccessToken = { tokenDataStore.hasAccessToken() },
        readHealth = { syncQueueDao.syncHealthSnapshot(it) },
        sendHealth = { report, workspaceId ->
            apiService.reportSyncHealth(report, workspaceId)
            Unit
        },
    )
    private companion object {
        const val PUSH_BATCH_SIZE = 100
        const val MAX_PUSH_BATCHES = 25
        const val PULL_PAGE_SIZE = 200
    }

    suspend fun syncNow(deviceId: String): Result<SyncChanges> {
        return try {
            val workspace = activeWorkspace() ?: return Result.success(SyncChanges(null, emptySet()))
            val changedIds = mutableSetOf<String>()
            var succeeded = false
            try {
                ensureDeviceRegistered(deviceId, workspace)
                pushPendingChanges(deviceId, workspace, changedIds)
                pullChanges(workspace, changedIds)
                succeeded = true
                Result.success(SyncChanges(workspace.id, changedIds.toSet()))
            } finally {
                // Earlier committed pages still need effects if a later network request fails.
                if (changedIds.isNotEmpty()) onTasksChanged(workspace.id, changedIds)
                currentCoroutineContext().ensureActive()
                syncHealthReporter.report(workspace.id, deviceId, succeeded)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Result.failure(failure)
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
        val changedIds = mutableSetOf<String>()
        try {
            pullChanges(workspace, changedIds)
        } finally {
            if (changedIds.isNotEmpty()) onTasksChanged(workspace.id, changedIds)
        }
    }

    private suspend fun pullChanges(workspace: WorkspaceIdentity, changedIds: MutableSet<String>) {
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
            if (remoteTasks.isNotEmpty()) {
                ensureWorkspaceUnchanged(workspace)
                val pageChanges = database.withTransaction {
                    val existingByServerId = taskDao.getByServerIds(workspace.id, remoteTasks.map { it.id })
                        .mapNotNull { entity -> entity.serverId?.let { serverId -> serverId to entity } }
                        .toMap()
                    val entities = remoteTasks.map { remoteTask ->
                        val existing = existingByServerId[remoteTask.id]
                        if (existing != null && (remoteTask.version < existing.version ||
                            (remoteTask.version == existing.version && shouldPreserveLocalTaskOnPull(existing)))) {
                            // A pending edit is based on this acknowledged version, not a conflict with it.
                            existing
                        } else if (existing != null && shouldPreserveLocalTaskOnPull(existing)) {
                            existing.copy(
                                serverId = remoteTask.id,
                                version = remoteTask.version,
                                syncStatus = SyncStatus.Conflict.wireName,
                                conflictServerJson = syncRepositoryGson.toJson(remoteTask),
                                conflictLocalJson = existing.conflictLocalJson ?: syncRepositoryGson.toJson(existing),
                                lastSyncAt = data.serverTime,
                            )
                        } else {
                            remoteTask.toEntity(
                                workspaceId = workspace.id,
                                ownerUserId = workspace.userId,
                                localId = existing?.localId ?: remoteTaskLocalId(workspace, remoteTask.id),
                                syncStatus = SyncStatus.Synced,
                                lastSyncAt = data.serverTime,
                            )
                        }
                    }.filter { entity ->
                        val previous = existingByServerId[entity.serverId]
                        previous == null || entity.copy(lastSyncAt = previous.lastSyncAt) != previous
                    }
                    if (entities.isNotEmpty()) taskDao.upsertAll(entities)
                    entities.map { it.localId }
                }
                changedIds += pageChanges
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

    private suspend fun pushPendingChanges(deviceId: String, workspace: WorkspaceIdentity, changedIds: MutableSet<String>) {
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
            val batchChanges = mutableSetOf<String>()
            database.withTransaction {
                data.results.forEach { result ->
                    val queued = pendingByLocalId[result.localId] ?: return@forEach
                    val currentQueue = syncQueueDao.getLatestForTask(workspace.id, result.localId) ?: return@forEach
                    if (currentQueue.id != queued.id) {
                        // The user replaced the sent snapshot while its response was in flight.
                        // Keep every newer field and only advance the acknowledged server identity.
                        if (result.status == "applied") {
                            val current = taskDao.getByLocalId(workspace.id, result.localId) ?: return@forEach
                            val serverId = result.serverId ?: result.task?.id ?: current.serverId
                            val version = result.version ?: result.task?.version ?: current.version
                            taskDao.upsert(current.copy(
                                serverId = serverId,
                                version = version,
                                syncStatus = when {
                                    currentQueue.action == "delete" -> SyncStatus.PendingDelete.wireName
                                    serverId == null -> SyncStatus.PendingCreate.wireName
                                    else -> SyncStatus.PendingUpdate.wireName
                                },
                                lastSyncAt = data.serverTime,
                            ))
                            syncQueueDao.enqueue(currentQueue.copy(
                                serverId = serverId,
                                version = version,
                                action = if (currentQueue.action == "create" && serverId != null) "update" else currentQueue.action,
                            ))
                            batchChanges += result.localId
                        }
                        return@forEach
                    }
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
                            batchChanges += result.localId
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
                            batchChanges += result.localId
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
                            batchChanges += result.localId
                        }

                        else -> syncQueueDao.incrementAttempt(workspace.id, queued.id)
                    }
                }
            }
            changedIds += batchChanges

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
