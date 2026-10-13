package com.taskbridge.app.widget

import android.content.Context
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import com.taskbridge.app.appContainer
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class TodayTaskWidgetUpdateWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        if (!hasInstances(applicationContext)) return Result.success()
        val state = applicationContext.appContainer.widgetRepository.loadState()
        TodayTaskWidgetProvider.updateAll(applicationContext, state)

        return Result.success()
    }

    companion object {
        fun enqueue(context: Context) {
            val appContext = context.applicationContext
            if (!hasInstances(appContext)) return
            val container = appContext.appContainer
            container.applicationScope.launch {
                if (!hasInstances(appContext)) return@launch
                val request = OneTimeWorkRequestBuilder<TodayTaskWidgetUpdateWorker>()
                    .setInitialDelay(300, TimeUnit.MILLISECONDS)
                    .build()
                container.workScheduler.enqueue(WidgetConstants.UPDATE_WORK_NAME, request)
            }
        }

        fun hasInstances(context: Context): Boolean = AppWidgetManager.getInstance(context).getAppWidgetIds(
            ComponentName(context, TodayTaskWidgetProvider::class.java),
        ).isNotEmpty()
    }
}
