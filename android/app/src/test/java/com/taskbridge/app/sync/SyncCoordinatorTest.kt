package com.taskbridge.app.sync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SyncCoordinatorTest {
    @Test
    fun concurrentForegroundAndWorkerRequestsShareOneRun() = runTest {
        val release = CompletableDeferred<Unit>()
        var calls = 0
        val coordinator = SyncCoordinator(backgroundScope) { _: String ->
            calls += 1
            release.await()
            SyncRunState.Success
        }
        val first = async { coordinator.run("workspace") }
        val second = async { coordinator.run("workspace") }
        runCurrent()
        assertEquals(1, calls)
        release.complete(Unit)
        assertEquals(SyncRunState.Success, first.await())
        assertEquals(SyncRunState.Success, second.await())
        assertEquals(SyncRunState.Success, coordinator.run("workspace"))
        assertEquals(2, calls)
    }

    @Test
    fun cancellingAnObserverDoesNotCancelTheSharedWorker() = runTest {
        val release = CompletableDeferred<Unit>()
        var calls = 0
        val coordinator = SyncCoordinator(backgroundScope) { _: String ->
            calls += 1
            release.await()
            SyncRunState.Success
        }
        val activity = async { coordinator.run("workspace") }
        runCurrent()
        activity.cancel()
        val worker = async { coordinator.run("workspace") }
        runCurrent()
        release.complete(Unit)
        assertEquals(SyncRunState.Success, worker.await())
        assertEquals(1, calls)
    }
}
