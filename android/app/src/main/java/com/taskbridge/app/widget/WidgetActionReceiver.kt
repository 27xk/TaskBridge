package com.taskbridge.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.taskbridge.app.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            WidgetConstants.ACTION_COMPLETE -> {
                val localId = intent.getStringExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID) ?: return
                val pendingResult = goAsync()
                CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                    try {
                        val container = AppContainer(context.applicationContext)
                        container.taskRepository.completeTask(localId)
                        TodayTaskWidgetUpdateWorker.enqueue(context)
                        container.syncManager.enqueueNetworkSync()
                        container.syncManager.syncNow()
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
            WidgetConstants.ACTION_SNOOZE -> {
                val localId = intent.getStringExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID) ?: return
                val pendingResult = goAsync()
                CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                    try {
                        val container = AppContainer(context.applicationContext)
                        container.taskRepository.snoozeTask(
                            localId,
                            Instant.now().plusSeconds(3_600).toString(),
                        )
                        TodayTaskWidgetUpdateWorker.enqueue(context)
                        container.syncManager.enqueueNetworkSync()
                        container.syncManager.syncNow()
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }
}
