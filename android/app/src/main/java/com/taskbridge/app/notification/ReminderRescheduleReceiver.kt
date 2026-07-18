package com.taskbridge.app.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.taskbridge.app.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ReminderRescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!isReminderRebuildAction(intent.action)) return
        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val container = AppContainer(context.applicationContext)
                container.reminderManager.ensureChannel()
                runCatching { container.reminderManager.rebuildAll() }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
