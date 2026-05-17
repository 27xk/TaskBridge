package com.taskbridge.app.notification

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.taskbridge.app.MainActivity
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import java.time.Instant

class ReminderManager(
    private val context: Context,
) {
    fun ensureChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Task reminders",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "TaskBridge due task reminders"
        }
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    fun schedule(task: Task) {
        val remindAt = task.remindTime ?: task.dueTime ?: return
        if (task.status == TaskStatus.Completed || task.isDeleted) return
        val triggerAt = runCatching { Instant.parse(remindAt).toEpochMilli() }.getOrNull() ?: return
        if (triggerAt <= System.currentTimeMillis()) return

        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(EXTRA_TASK_LOCAL_ID, task.localId)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            task.localId.hashCode(),
            intent,
            pendingIntentFlags(),
        )
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
    }

    fun cancel(task: Task) {
        val intent = Intent(context, ReminderReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            task.localId.hashCode(),
            intent,
            pendingIntentFlags(),
        )
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
    }

    fun showReminder(task: Task) {
        TodayTaskWidgetUpdateWorker.enqueue(context)

        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(task.title)
            .setContentText(task.content ?: "Task reminder")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openTaskIntent(task.localId))
            .addAction(0, "完成", actionIntent(task.localId, WidgetConstants.ACTION_COMPLETE, 11_000))
            .addAction(0, "稍后 1 小时", actionIntent(task.localId, WidgetConstants.ACTION_SNOOZE, 12_000))
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context)
            .notify(task.localId.hashCode(), notification)
    }

    private fun openTaskIntent(localId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(WidgetConstants.EXTRA_WIDGET_TARGET, WidgetConstants.TARGET_TASK)
            putExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID, localId)
        }
        return PendingIntent.getActivity(context, localId.hashCode(), intent, pendingIntentFlags())
    }

    private fun actionIntent(localId: String, action: String, requestBase: Int): PendingIntent {
        val intent = Intent(context, com.taskbridge.app.widget.WidgetActionReceiver::class.java).apply {
            this.action = action
            putExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID, localId)
        }
        return PendingIntent.getBroadcast(
            context,
            requestBase + (localId.hashCode() and 0x3fff),
            intent,
            pendingIntentFlags(),
        )
    }

    private fun pendingIntentFlags(): Int {
        return PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    }

    companion object {
        const val CHANNEL_ID = "taskbridge_reminders"
        const val EXTRA_TASK_LOCAL_ID = "taskbridge.reminder.extra.TASK_LOCAL_ID"
    }
}
