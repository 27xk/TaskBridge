package com.taskbridge.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.taskbridge.app.appContainer

class SyncWorker(appContext: Context, workerParameters: WorkerParameters) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val container = applicationContext.appContainer
        val tokenDataStore = container.tokenDataStore
        tokenDataStore.initializeLegacyWorkspaceOwnership()
        val authContext = tokenDataStore.requestAuthContext()
        val workspace = authContext.workspace ?: return Result.success()
        if (authContext.accessToken.isNullOrBlank()) return Result.success()
        val expectedWorkspaceId = inputData.getString(INPUT_WORKSPACE_ID) ?: workspace.id
        if (workspace.id != expectedWorkspaceId) return Result.success()
        return when (container.syncManager.runWorkerSync(expectedWorkspaceId)) {
            SyncRunState.Success, SyncRunState.Idle -> Result.success()
            else -> Result.retry()
        }
    }

    companion object {
        const val INPUT_WORKSPACE_ID = "taskbridge.sync.workspace_id"
    }
}
