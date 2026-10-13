package com.taskbridge.app.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async

/** Callers await the application-owned run; cancelling an Activity/Worker does not fork it. */
class SyncCoordinator(
    private val scope: CoroutineScope,
    private val sync: suspend (workspaceId: String) -> SyncRunState,
) {
    private val lock = Any()
    private var active: Pair<String, Deferred<SyncRunState>>? = null

    suspend fun run(workspaceId: String): SyncRunState {
        val deferred = synchronized(lock) {
            active?.takeIf { it.first == workspaceId && !it.second.isCompleted }?.second ?: run {
                active?.second?.cancel()
                scope.async(start = CoroutineStart.LAZY) { sync(workspaceId) }.also { created ->
                    active = workspaceId to created
                    created.invokeOnCompletion {
                        synchronized(lock) {
                            if (active?.second === created) active = null
                        }
                    }
                    created.start()
                }
            }
        }
        return deferred.await()
    }

    fun cancel() = synchronized(lock) {
        active?.second?.cancel()
        active = null
    }
}
