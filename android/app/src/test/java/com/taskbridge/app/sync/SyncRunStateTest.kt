package com.taskbridge.app.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncRunStateTest {
    @Test
    fun disconnectedRunConvergesToOffline() {
        assertEquals(SyncRunState.Offline, terminalSyncState(networkAvailable = false, failure = null))
    }

    @Test
    fun connectedRunConvergesToSuccessOrFailure() {
        assertEquals(SyncRunState.Success, terminalSyncState(networkAvailable = true, failure = null))
        check(terminalSyncState(networkAvailable = true, failure = IllegalStateException("failed")) is SyncRunState.Failure)
    }
}
