package com.taskbridge.app.data.repository

import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.SyncQueueDao
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.data.remote.ApiService
import com.taskbridge.app.data.remote.dto.DeviceRegisterRequestDto
import com.taskbridge.app.data.remote.dto.SyncPushRequestDto
import com.taskbridge.app.data.remote.dto.WebSocketTicketRequestDto
import com.taskbridge.app.domain.model.SyncStatus
import kotlinx.coroutines.flow.first
import java.time.Instant

class SyncRepository(
    private val apiService: ApiService,
    private val taskDao: TaskDao,
    private val syncQueueDao: SyncQueueDao,
    private val tokenDataStore: TokenDataStore,
) {
    suspend fun syncNow(deviceId: String): Result<Unit> {
        return runCatching {
            ensureDeviceRegistered(deviceId)
            pushPendingChanges(deviceId)
            pullChanges()
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
        val lastSyncTime = tokenDataStore.lastSyncTime.first() ?: "1970-01-01T00:00:00Z"
        val data = apiService.pullSync(lastSyncTime).data ?: return

        data.changedTasks.forEach { remoteTask ->
            val existing = taskDao.getByServerId(remoteTask.id)
            val localId = existing?.localId ?: "server-${remoteTask.id}"
            taskDao.upsert(
                remoteTask.toEntity(
                    localId = localId,
                    syncStatus = SyncStatus.Synced,
                    lastSyncAt = data.serverTime,
                ),
            )
        }

        data.deletedTasks.forEach { remoteTask ->
            val existing = taskDao.getByServerId(remoteTask.id)
            val localId = existing?.localId ?: "server-${remoteTask.id}"
            taskDao.upsert(
                remoteTask.toEntity(
                    localId = localId,
                    syncStatus = SyncStatus.Synced,
                    lastSyncAt = data.serverTime,
                ),
            )
        }

        tokenDataStore.saveLastSyncTime(data.serverTime)
    }

    private suspend fun pushPendingChanges(deviceId: String) {
        val pending = syncQueueDao.pendingChanges(100)
        if (pending.isEmpty()) return

        val data = apiService.pushSync(
            SyncPushRequestDto(
                deviceId = deviceId,
                changes = pending.map { it.toDto() },
            ),
        ).data ?: return

        val pendingByLocalId = pending.associateBy { it.localId }
        data.results.forEach { result ->
            val queued = pendingByLocalId[result.localId] ?: return@forEach
            when (result.status) {
                "applied" -> {
                    result.task?.let { task ->
                        taskDao.upsert(
                            task.toEntity(
                                localId = result.localId,
                                syncStatus = SyncStatus.Synced,
                                lastSyncAt = data.serverTime,
                            ),
                        )
                    } ?: taskDao.markSynced(
                        localId = result.localId,
                        serverId = result.serverId,
                        version = result.version ?: queued.version,
                        updatedAt = Instant.now().toString(),
                        syncedAt = data.serverTime,
                    )
                    syncQueueDao.delete(queued)
                }

                "conflict" -> {
                    result.serverTask?.let { task ->
                        taskDao.upsert(
                            task.toEntity(
                                localId = result.localId,
                                syncStatus = SyncStatus.Conflict,
                                lastSyncAt = data.serverTime,
                            ),
                        )
                    } ?: taskDao.updateSyncStatus(result.localId, SyncStatus.Conflict.wireName)
                    syncQueueDao.delete(queued)
                }

                else -> syncQueueDao.incrementAttempt(queued.id)
            }
        }
    }
}
