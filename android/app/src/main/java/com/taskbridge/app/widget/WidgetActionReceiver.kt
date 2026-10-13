package com.taskbridge.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.taskbridge.app.appContainer
import com.taskbridge.app.notification.ReminderManager
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(WidgetConstants.ACTION_COMPLETE, WidgetConstants.ACTION_SNOOZE)) return
        val localId = intent.getStringExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID) ?: return
        val container = context.appContainer
        val pendingResult = goAsync()
        container.applicationScope.launch {
            try {
                val expectedWorkspace = intent.getStringExtra(ReminderManager.EXTRA_WORKSPACE_ID)
                if (expectedWorkspace != null && container.tokenDataStore.currentWorkspace.first()?.id != expectedWorkspace) return@launch
                when (intent.action) {
                    WidgetConstants.ACTION_COMPLETE -> container.taskRepository.completeTask(localId)
                    WidgetConstants.ACTION_SNOOZE -> container.taskRepository.snoozeTask(localId, Instant.now().plusSeconds(3_600).toString())
                }
                container.syncManager.requestSync(followUpIfRunning = true)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
