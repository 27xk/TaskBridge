package com.taskbridge.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.remote.RetrofitClient
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.data.local.WorkspaceMigrationCoordinator
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.flow.first

class SyncWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val tokenDataStore = TokenDataStore(applicationContext)
        tokenDataStore.initializeLegacyWorkspaceOwnership()
        val authContext = tokenDataStore.requestAuthContext()
        if (authContext.workspace == null || authContext.accessToken.isNullOrBlank()) {
            return Result.success()
        }
        val expectedWorkspaceId = inputData.getString(INPUT_WORKSPACE_ID)
        if (
            expectedWorkspaceId != null &&
            authContext.workspace.id != expectedWorkspaceId
        ) {
            return Result.success()
        }
        val database = AppDatabase.getInstance(applicationContext)
        val apiService = RetrofitClient.create(applicationContext, tokenDataStore)
        val workspaceMigration = WorkspaceMigrationCoordinator(
            database,
            database.taskDao(),
            database.syncQueueDao(),
            tokenDataStore,
        )
        val repository = SyncRepository(
            apiService = apiService,
            database = database,
            taskDao = database.taskDao(),
            syncQueueDao = database.syncQueueDao(),
            tokenDataStore = tokenDataStore,
            workspaceMigration = workspaceMigration,
        )
        val taskRepository = TaskRepository(
            apiService,
            database,
            database.taskDao(),
            database.syncQueueDao(),
            tokenDataStore,
            workspaceMigration,
        )
        val reminderManager = ReminderManager(applicationContext, tokenDataStore, taskRepository)
        val deviceId = DeviceIdProvider(applicationContext).getDeviceId()

        return repository.syncNow(deviceId).fold(
            onSuccess = {
                reminderManager.rebuildAll()
                TodayTaskWidgetUpdateWorker.enqueue(applicationContext)
                Result.success()
            },
            onFailure = { Result.retry() },
        )
    }

    companion object {
        const val INPUT_WORKSPACE_ID = "taskbridge.sync.workspace_id"
    }
}
