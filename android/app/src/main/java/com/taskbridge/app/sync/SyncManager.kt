package com.taskbridge.app.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex

class SyncManager(
    private val context: Context,
    private val syncRepository: SyncRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val deviceIdProvider = DeviceIdProvider(context)
    private val webSocketClient = WebSocketClient(scope) { deviceId ->
        syncRepository.createWebSocketTicket(deviceId).getOrNull()
    }
    private val syncMutex = Mutex()
    @Volatile
    private var syncRequested = false
    private var syncDebounceJob: Job? = null

    fun enqueueNetworkSync() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "taskbridge-sync",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun syncNow() {
        if (syncMutex.isLocked) {
            syncRequested = true
            return
        }
        syncDebounceJob?.cancel()
        syncDebounceJob = scope.launch {
            delay(500)
            if (!syncMutex.tryLock()) {
                syncRequested = true
                return@launch
            }
            try {
                do {
                    syncRequested = false
                    syncRepository.syncNow(deviceIdProvider.getDeviceId())
                        .onSuccess { TodayTaskWidgetUpdateWorker.enqueue(context) }
                } while (syncRequested)
            } finally {
                syncMutex.unlock()
            }
        }
    }

    fun connectForegroundWebSocket() {
        scope.launch {
            webSocketClient.connect(deviceIdProvider.getDeviceId()) {
                syncRepository.pullChanges()
                TodayTaskWidgetUpdateWorker.enqueue(context)
            }
        }
    }

    fun disconnectForegroundWebSocket() {
        webSocketClient.disconnect()
    }
}
