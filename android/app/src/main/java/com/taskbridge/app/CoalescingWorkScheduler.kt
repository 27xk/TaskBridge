package com.taskbridge.app

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkInfo
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID

fun needsFollowUpWork(states: List<WorkInfo.State>): Boolean = states.none {
    it == WorkInfo.State.ENQUEUED || it == WorkInfo.State.BLOCKED
}

/** Keep at most one waiting update, and retain a follow-up if data changes during a running job. */
class CoalescingWorkScheduler(context: Context) {
    private val context = context.applicationContext
    private val mutex = Mutex()

    suspend fun enqueue(
        name: String,
        request: OneTimeWorkRequest,
        followUpIfRunning: Boolean = true,
    ): UUID = withContext(Dispatchers.IO) {
        mutex.withLock {
            val manager = WorkManager.getInstance(context)
            val existing = manager.getWorkInfosForUniqueWork(name).get()
            if (!needsFollowUpWork(existing.map { it.state })) {
                return@withLock existing.last {
                    it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.BLOCKED
                }.id
            }
            if (!followUpIfRunning) {
                existing.lastOrNull { it.state == WorkInfo.State.RUNNING }?.let { return@withLock it.id }
            }
            manager.enqueueUniqueWork(name, ExistingWorkPolicy.APPEND_OR_REPLACE, request).result.get()
            request.id
        }
    }
}
