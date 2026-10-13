package com.taskbridge.app.widget

import android.app.Application
import android.content.Context
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import com.taskbridge.app.needsFollowUpWork
import com.taskbridge.app.CoalescingWorkScheduler
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class WidgetSchedulingBehaviorTest {
    private lateinit var workerExecutor: ExecutorService

    @Before
    fun setUp() {
        workerExecutor = Executors.newSingleThreadExecutor()
        WorkManagerTestInitHelper.initializeTestWorkManager(
            RuntimeEnvironment.getApplication(), Configuration.Builder().setExecutor(workerExecutor).build(),
        )
    }

    @After
    fun tearDown() {
        BlockingUpdateWorker.release.countDown()
        workerExecutor.shutdown()
        assertTrue(workerExecutor.awaitTermination(10, TimeUnit.SECONDS))
        WorkManager.getInstance(RuntimeEnvironment.getApplication()).cancelAllWork().result.get()
        WorkManagerTestInitHelper.closeWorkDatabase()
    }

    @Test
    fun noInstalledWidgetDoesNotCreateBackgroundWork() {
        val context = RuntimeEnvironment.getApplication()
        repeat(20) { TodayTaskWidgetUpdateWorker.enqueue(context) }
        assertTrue(WorkManager.getInstance(context).getWorkInfosForUniqueWork(WidgetConstants.UPDATE_WORK_NAME).get().isEmpty())
    }

    @Test
    fun pendingWorkIsReusedButARunningUpdateGetsOneFollowUp() {
        assertEquals(false, needsFollowUpWork(listOf(WorkInfo.State.ENQUEUED)))
        assertEquals(false, needsFollowUpWork(listOf(WorkInfo.State.RUNNING, WorkInfo.State.BLOCKED)))
        assertEquals(true, needsFollowUpWork(listOf(WorkInfo.State.RUNNING)))
        assertEquals(true, needsFollowUpWork(listOf(WorkInfo.State.SUCCEEDED)))
    }

    @Test
    fun burstsShareOneQueuedWorkRequest() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        val scheduler = CoalescingWorkScheduler(context)
        val ids = (1..20).map {
            scheduler.enqueue("test-burst", OneTimeWorkRequestBuilder<BlockingUpdateWorker>().setInitialDelay(1, TimeUnit.HOURS).build())
        }
        assertEquals(1, ids.toSet().size)
        assertEquals(1, WorkManager.getInstance(context).getWorkInfosForUniqueWork("test-burst").get().size)
    }

    @Test
    fun aMutationDuringRunningWorkRetainsExactlyOneSuccessor() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        BlockingUpdateWorker.started = CountDownLatch(1)
        BlockingUpdateWorker.release = CountDownLatch(1)
        val scheduler = CoalescingWorkScheduler(context)
        try {
            scheduler.enqueue("test-running", OneTimeWorkRequestBuilder<BlockingUpdateWorker>().build())
            assertTrue(BlockingUpdateWorker.started.await(5, TimeUnit.SECONDS))
            val ids = (1..20).map {
                scheduler.enqueue("test-running", OneTimeWorkRequestBuilder<BlockingUpdateWorker>().setInitialDelay(1, TimeUnit.HOURS).build())
            }
            assertEquals(1, ids.toSet().size)
            val work = WorkManager.getInstance(context).getWorkInfosForUniqueWork("test-running").get()
            assertEquals(2, work.size)
            assertTrue(work.any { it.state == WorkInfo.State.RUNNING })
            assertTrue(work.any { it.state == WorkInfo.State.BLOCKED })
        } finally {
            BlockingUpdateWorker.release.countDown()
        }
    }

    @Test
    fun refreshesJoinTheRunningWorkWithoutAnExtraSync() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        BlockingUpdateWorker.started = CountDownLatch(1)
        BlockingUpdateWorker.release = CountDownLatch(1)
        val scheduler = CoalescingWorkScheduler(context)
        try {
            val first = scheduler.enqueue("test-refresh", OneTimeWorkRequestBuilder<BlockingUpdateWorker>().build())
            assertTrue(BlockingUpdateWorker.started.await(5, TimeUnit.SECONDS))
            repeat(20) {
                assertEquals(first, scheduler.enqueue("test-refresh", OneTimeWorkRequestBuilder<BlockingUpdateWorker>().build(), followUpIfRunning = false))
            }
            assertEquals(1, WorkManager.getInstance(context).getWorkInfosForUniqueWork("test-refresh").get().size)
        } finally {
            BlockingUpdateWorker.release.countDown()
        }
    }
}

class BlockingUpdateWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        started.countDown()
        release.await(10, TimeUnit.SECONDS)
        return Result.success()
    }

    companion object {
        var started = CountDownLatch(1)
        var release = CountDownLatch(1)
    }
}
