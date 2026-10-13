package com.taskbridge.app.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.taskbridge.app.appContainer
import kotlinx.coroutines.launch

class ReminderRescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!isReminderRebuildAction(intent.action)) return
        val pendingResult = goAsync()
        context.appContainer.applicationScope.launch {
            try {
                val container = context.appContainer
                container.reminderManager.ensureChannel()
                runCatching { container.reminderManager.rebuildAll() }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
