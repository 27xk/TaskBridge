package com.taskbridge.app.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class SyncManager(
    private val context: Context,
    private val syncRepository: SyncRepository,
    private val tokenDataStore: TokenDataStore,
    private val reminderManager: ReminderManager,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val deviceIdProvider = DeviceIdProvider(context)
    private val webSocketClient = WebSocketClient(
        scope = scope,
        webSocketUrlProvider = { tokenDataStore.webSocketUrl.first() },
        ticketProvider = { deviceId -> syncRepository.createWebSocketTicket(deviceId).getOrNull() },
    )
    private val syncMutex = Mutex()
    private var syncDebounceJob: Job? = null
    private val _syncState = MutableStateFlow<SyncRunState>(SyncRunState.Idle)
    val syncState: StateFlow<SyncRunState> = _syncState

    init {
        scope.launch {
            combine(tokenDataStore.currentWorkspace, tokenDataStore.accessToken) { workspace, accessToken ->
                workspace?.id to accessToken.isNullOrBlank()
            }
                .distinctUntilChanged()
                .drop(1)
                .collect {
                    syncDebounceJob?.cancel()
                    webSocketClient.disconnect()
                    _syncState.value = SyncRunState.Idle
                }
        }
    }

    fun enqueueNetworkSync() {
        scope.launch {
            val authContext = tokenDataStore.requestAuthContext()
            val workspace = authContext.workspace ?: return@launch
            if (authContext.accessToken.isNullOrBlank()) {
                _syncState.value = SyncRunState.Offline
                return@launch
            }
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setInputData(workDataOf(SyncWorker.INPUT_WORKSPACE_ID to workspace.id))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "taskbridge-sync-${workspace.preferenceSuffix}",
                ExistingWorkPolicy.KEEP,
                request,
            )
        }
    }

    fun syncNow() {
        syncDebounceJob?.cancel()
        syncDebounceJob = scope.launch {
            delay(500)
            performSync()
        }
    }

    suspend fun syncNowAndWait(): SyncRunState {
        syncDebounceJob?.cancel()
        return withContext(Dispatchers.IO) { performSync() }
    }

    private suspend fun performSync(): SyncRunState = syncMutex.withLock {
        val authContext = tokenDataStore.requestAuthContext()
        if (authContext.workspace == null) {
            _syncState.value = SyncRunState.Idle
            return@withLock SyncRunState.Idle
        }
        if (authContext.accessToken.isNullOrBlank()) {
            _syncState.value = SyncRunState.Offline
            return@withLock SyncRunState.Offline
        }
        val networkAvailable = isNetworkAvailable()
        if (!networkAvailable) {
            _syncState.value = SyncRunState.Offline
            return@withLock SyncRunState.Offline
        }

        _syncState.value = SyncRunState.Syncing
        val result = syncRepository.syncNow(deviceIdProvider.getDeviceId())
        val terminal = terminalSyncState(networkAvailable = true, failure = result.exceptionOrNull())
        if (result.isSuccess) {
            runCatching { reminderManager.rebuildAll() }
            TodayTaskWidgetUpdateWorker.enqueue(context)
        }
        _syncState.value = terminal
        terminal
    }

    private fun isNetworkAvailable(): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun connectForegroundWebSocket() {
        scope.launch {
            val authContext = tokenDataStore.requestAuthContext()
            if (authContext.workspace == null || authContext.accessToken.isNullOrBlank()) {
                _syncState.value = if (authContext.workspace == null) SyncRunState.Idle else SyncRunState.Offline
                webSocketClient.disconnect()
                return@launch
            }
            webSocketClient.connect(deviceIdProvider.getDeviceId()) {
                performSync()
            }
        }
    }

    fun disconnectForegroundWebSocket() {
        webSocketClient.disconnect()
    }
}
