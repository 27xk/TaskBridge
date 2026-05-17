package com.taskbridge.app.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters

class TodayTaskWidgetUpdateWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val state = TodayTaskWidgetRepository(applicationContext).loadState()
        TodayTaskWidgetProvider.updateAll(applicationContext, state)

        return Result.success()
    }

    companion object {
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<TodayTaskWidgetUpdateWorker>().build()

            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                WidgetConstants.UPDATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
