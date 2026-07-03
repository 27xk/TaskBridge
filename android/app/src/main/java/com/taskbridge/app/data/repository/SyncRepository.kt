package com.taskbridge.app.data.repository

import androidx.room.withTransaction
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.SyncQueueDao
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.local.TaskEntity
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
) {
    private companion object {
        const val PUSH_BATCH_SIZE = 100
        const val MAX_PUSH_BATCHES = 25
        const val PULL_PAGE_SIZE = 200
    }

    suspend fun syncNow(deviceId: String): Result<Unit> {
        return runCatching {
            val ownerUserId = ownerUserId() ?: return@runCatching
            ensureDeviceRegistered(deviceId)
            pushPendingChanges(deviceId, ownerUserId)
            pullChanges(ownerUserId)
        }
    }

    suspend fun createWebSocketTicket(deviceId: String): Result<String> {
        return runCatching {
            ensureDeviceRegistered(deviceId)
            apiService.createWebSocketTicket(WebSocketTicketRequestDto(deviceId))
                .data
                ?.ticket
                ?: error("missing websocket ticket")
        }
    }

    private suspend fun ensureDeviceRegistered(deviceId: String) {
        apiService.registerDevice(
            DeviceRegisterRequestDto(
                deviceId = deviceId,
                deviceName = "Android phone",
                deviceType = "android",
            ),
        )
    }

    suspend fun pullChanges() {
        val ownerUserId = ownerUserId() ?: return
        pullChanges(ownerUserId)
    }

    private suspend fun pullChanges(ownerUserId: String) {
        val lastSyncTime = tokenDataStore.lastSyncTime.first() ?: "1970-01-01T00:00:00Z"
        var cursorUpdatedAt: String? = null
        var cursorId: Int? = null

        while (true) {
            val data = apiService.pullSync(
                lastSyncTime = lastSyncTime,
                limit = PULL_PAGE_SIZE,
                cursorUpdatedAt = cursorUpdatedAt,
                cursorId = cursorId,
            ).data ?: return

            val remoteTasks = data.changedTasks + data.deletedTasks
            val existingByServerId: Map<Int, TaskEntity> = if (remoteTasks.isEmpty()) {
                emptyMap()
            } else {
                taskDao.getByServerIds(ownerUserId, remoteTasks.map { it.id })
                    .mapNotNull { entity -> entity.serverId?.let { serverId -> serverId to entity } }
                    .toMap()
            }
            val entities = remoteTasks.map { remoteTask ->
                remoteTask.toEntity(
                    ownerUserId = ownerUserId,
                    localId = existingByServerId[remoteTask.id]?.localId ?: "server-${remoteTask.id}",
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
                tokenDataStore.saveLastSyncTime(data.serverTime)
                return
            }
            cursorUpdatedAt = data.nextCursorUpdatedAt
                ?: error("sync pull response is missing the next cursor")
            cursorId = data.nextCursorId
                ?: error("sync pull response is missing the next cursor")
        }
    }

    private suspend fun pushPendingChanges(deviceId: String, ownerUserId: String) {
        var processedBatches = 0

        while (processedBatches < MAX_PUSH_BATCHES) {
            val pending = syncQueueDao.pendingChanges(ownerUserId, PUSH_BATCH_SIZE)
            if (pending.isEmpty()) return

            val data = apiService.pushSync(
                SyncPushRequestDto(
                    deviceId = deviceId,
                    changes = pending.map { it.toDto() },
                ),
            ).data ?: return

            val pendingByLocalId = pending.associateBy { it.localId }
            database.withTransaction {
                data.results.forEach { result ->
                    val queued = pendingByLocalId[result.localId] ?: return@forEach
                    when (result.status) {
                        "applied" -> {
                            result.task?.let { task ->
                                taskDao.upsert(
                                    task.toEntity(
                                        ownerUserId = ownerUserId,
                                        localId = result.localId,
                                        syncStatus = SyncStatus.Synced,
                                        lastSyncAt = data.serverTime,
                                    ),
                                )
                            } ?: taskDao.markSynced(
                                ownerUserId = ownerUserId,
                                localId = result.localId,
                                serverId = result.serverId,
                                version = result.version ?: queued.version,
                                updatedAt = Instant.now().toString(),
                                syncedAt = data.serverTime,
                            )
                            syncQueueDao.deleteById(ownerUserId, queued.id)
                        }

                        "conflict" -> {
                            val localTask = taskDao.getByLocalId(ownerUserId, result.localId)
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
                                            ownerUserId = ownerUserId,
                                            localId = result.localId,
                                            syncStatus = SyncStatus.Conflict,
                                            lastSyncAt = data.serverTime,
                                            conflictServerJson = syncRepositoryGson.toJson(task),
                                            conflictLocalJson = null,
                                        ),
                                    )
                                } ?: taskDao.updateSyncStatus(ownerUserId, result.localId, SyncStatus.Conflict.wireName)
                            }
                            syncQueueDao.deleteById(ownerUserId, queued.id)
                        }

                        "failed" -> {
                            val localTask = taskDao.getByLocalId(ownerUserId, result.localId)
                            if (localTask != null) {
                                taskDao.upsert(
                                    localTask.copy(
                                        syncStatus = SyncStatus.Failed.wireName,
                                        conflictServerJson = null,
                                        conflictLocalJson = null,
                                    ),
                                )
                            } else {
                                taskDao.updateSyncStatus(ownerUserId, result.localId, SyncStatus.Failed.wireName)
                            }
                            syncQueueDao.incrementAttempt(ownerUserId, queued.id)
                        }

                        else -> syncQueueDao.incrementAttempt(ownerUserId, queued.id)
                    }
                }
            }

            processedBatches += 1
            if (pending.size < PUSH_BATCH_SIZE) return
        }
    }

    private suspend fun ownerUserId(): String? {
        return tokenDataStore.currentUserId.first()?.takeIf { it.isNotBlank() }
    }
}
