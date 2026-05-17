package com.taskbridge.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.remote.RetrofitClient
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker

class SyncWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val tokenDataStore = TokenDataStore(applicationContext)
        val database = AppDatabase.getInstance(applicationContext)
        val apiService = RetrofitClient.create(applicationContext, tokenDataStore)
        val repository = SyncRepository(
            apiService = apiService,
            taskDao = database.taskDao(),
            syncQueueDao = database.syncQueueDao(),
            tokenDataStore = tokenDataStore,
        )
        val deviceId = DeviceIdProvider(applicationContext).getDeviceId()

        return repository.syncNow(deviceId).fold(
            onSuccess = {
                TodayTaskWidgetUpdateWorker.enqueue(applicationContext)
                Result.success()
            },
            onFailure = { Result.retry() },
        )
    }
}
