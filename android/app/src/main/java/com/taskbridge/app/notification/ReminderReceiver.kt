package com.taskbridge.app.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.taskbridge.app.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val localId = intent.getStringExtra(ReminderManager.EXTRA_TASK_LOCAL_ID) ?: return
        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val container = AppContainer(context.applicationContext)
                val task = container.taskRepository.getTask(localId) ?: return@launch
                container.reminderManager.showReminder(task)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
