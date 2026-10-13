package com.taskbridge.app.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.taskbridge.app.CoalescingWorkScheduler
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.SyncRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.Closeable
import java.util.UUID
import java.util.concurrent.TimeoutException

class SyncManager(
    private val context: Context,
    private val syncRepository: SyncRepository,
    private val tokenDataStore: TokenDataStore,
    private val scope: CoroutineScope,
    private val workScheduler: CoalescingWorkScheduler,
) : Closeable {
    private val deviceIdProvider = DeviceIdProvider(context)
    private val webSocketClient = WebSocketClient(
        scope = scope,
        webSocketUrlProvider = { tokenDataStore.webSocketUrl.first() },
        ticketProvider = { deviceId -> syncRepository.createWebSocketTicket(deviceId).getOrNull() },
    )
    private val coordinator = SyncCoordinator(scope, ::performSync)
    private var socketConnectionJob: Job? = null
    @Volatile private var foreground = false
    private val _syncState = MutableStateFlow<SyncRunState>(SyncRunState.Idle)
    val syncState: StateFlow<SyncRunState> = _syncState
    private val sessionObserver = scope.launch {
        combine(tokenDataStore.currentWorkspace, tokenDataStore.accessToken) { workspace, accessToken ->
            workspace?.id to accessToken.isNullOrBlank()
        }.distinctUntilChanged().drop(1).collect {
            coordinator.cancel()
            socketConnectionJob?.cancel()
            webSocketClient.disconnect()
            _syncState.value = SyncRunState.Idle
            if (foreground) connectForegroundWebSocket()
        }
    }

    /** One durable path for startup, edits, manual refresh and WebSocket notifications. */
    fun requestSync(followUpIfRunning: Boolean = false) {
        scope.launch { enqueueSync(followUpIfRunning) }
    }

    private suspend fun enqueueSync(followUpIfRunning: Boolean): UUID? {
        val authContext = tokenDataStore.requestAuthContext()
        val workspace = authContext.workspace ?: return null
        if (authContext.accessToken.isNullOrBlank()) {
            _syncState.value = SyncRunState.Offline
            return null
        }
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(workDataOf(SyncWorker.INPUT_WORKSPACE_ID to workspace.id))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        if (!isNetworkAvailable()) _syncState.value = SyncRunState.Offline
        // A running job gets one waiting successor, so edits after its push snapshot are retained.
        return workScheduler.enqueue("taskbridge-sync-${workspace.preferenceSuffix}", request, followUpIfRunning)
    }

    suspend fun syncNowAndWait(): SyncRunState {
        val id = enqueueSync(followUpIfRunning = true) ?: return _syncState.value
        if (!isNetworkAvailable()) return SyncRunState.Offline
        val result = withTimeoutOrNull(45_000) {
            WorkManager.getInstance(context).getWorkInfoByIdFlow(id).filterNotNull().first { info ->
                info.state.isFinished || (info.state == WorkInfo.State.ENQUEUED && info.runAttemptCount > 0)
            }
        }
        return if (result == null) {
            if (isNetworkAvailable()) SyncRunState.Failure(TimeoutException("sync is still queued")) else SyncRunState.Offline
        } else _syncState.value
    }

    suspend fun runWorkerSync(expectedWorkspaceId: String): SyncRunState = coordinator.run(expectedWorkspaceId)

    private suspend fun performSync(expectedWorkspaceId: String): SyncRunState {
        val authContext = tokenDataStore.requestAuthContext()
        if (authContext.workspace?.id != expectedWorkspaceId) return SyncRunState.Idle
        if (authContext.accessToken.isNullOrBlank() || !isNetworkAvailable()) {
            _syncState.value = SyncRunState.Offline
            return SyncRunState.Offline
        }
        _syncState.value = SyncRunState.Syncing
        val result = syncRepository.syncNow(deviceIdProvider.getDeviceId())
        result.exceptionOrNull()?.let { if (it is CancellationException) throw it }
        val terminal = terminalSyncState(networkAvailable = isNetworkAvailable(), failure = result.exceptionOrNull())
        if (tokenDataStore.currentWorkspace.first()?.id == expectedWorkspaceId) _syncState.value = terminal
        return terminal
    }

    private fun isNetworkAvailable(): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun connectForegroundWebSocket() {
        foreground = true
        if (socketConnectionJob?.isActive == true) return
        socketConnectionJob = scope.launch {
            val authContext = tokenDataStore.requestAuthContext()
            if (authContext.workspace == null || authContext.accessToken.isNullOrBlank()) {
                _syncState.value = if (authContext.workspace == null) SyncRunState.Idle else SyncRunState.Offline
                webSocketClient.disconnect()
                return@launch
            }
            if (foreground) webSocketClient.connect(deviceIdProvider.getDeviceId()) { requestSync(followUpIfRunning = true) }
        }
    }

    fun disconnectForegroundWebSocket() {
        foreground = false
        socketConnectionJob?.cancel()
        socketConnectionJob = null
        webSocketClient.disconnect()
    }

    override fun close() {
        disconnectForegroundWebSocket()
        sessionObserver.cancel()
        coordinator.cancel()
        webSocketClient.close()
    }
}
