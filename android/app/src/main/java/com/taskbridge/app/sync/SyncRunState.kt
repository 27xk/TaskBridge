package com.taskbridge.app.sync

sealed interface SyncRunState {
    data object Idle : SyncRunState
    data object Syncing : SyncRunState
    data object Success : SyncRunState
    data object Offline : SyncRunState
    data class Failure(val cause: Throwable) : SyncRunState
}

fun terminalSyncState(networkAvailable: Boolean, failure: Throwable?): SyncRunState {
    if (!networkAvailable) return SyncRunState.Offline
    return if (failure == null) SyncRunState.Success else SyncRunState.Failure(failure)
}
