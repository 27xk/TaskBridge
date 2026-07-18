package com.taskbridge.app.notification

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.taskbridge.app.MainActivity
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.stringsFor
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import java.time.Instant

class ReminderManager(
    private val context: Context,
    private val tokenDataStore: TokenDataStore,
    private val taskRepository: TaskRepository? = null,
) {
    fun ensureChannel() {
        val copy = reminderCopy()
        val channel = NotificationChannel(
            CHANNEL_ID,
            copy.channelName,
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = copy.channelDescription
        }
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    fun schedule(task: Task) {
        val remindAt = reminderTrigger(task.remindTime, task.dueTime)
        if (remindAt == null || task.status == TaskStatus.Completed || task.isDeleted) {
            cancel(task)
            return
        }
        val triggerAt = runCatching { Instant.parse(remindAt).toEpochMilli() }.getOrNull() ?: return
        if (triggerAt <= System.currentTimeMillis()) {
            cancel(task)
            return
        }
        val workspaceId = currentWorkspaceId() ?: return

        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(EXTRA_TASK_LOCAL_ID, task.localId)
            putExtra(EXTRA_WORKSPACE_ID, workspaceId)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            reminderRequestCode(workspaceId, task.localId),
            intent,
            pendingIntentFlags(),
        )
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }

    fun cancel(task: Task) {
        val workspaceId = currentWorkspaceId() ?: return
        val intent = Intent(context, ReminderReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            reminderRequestCode(workspaceId, task.localId),
            intent,
            pendingIntentFlags(),
        )
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
    }

    fun showReminder(task: Task) {
        if (task.status == TaskStatus.Completed || task.isDeleted) return
        TodayTaskWidgetUpdateWorker.enqueue(context)

        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val copy = reminderCopy()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(task.title)
            .setContentText(task.content ?: copy.fallbackContent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openTaskIntent(task.localId))
            .addAction(0, copy.completeAction, actionIntent(task.localId, WidgetConstants.ACTION_COMPLETE, 11_000))
            .addAction(0, copy.snoozeAction, actionIntent(task.localId, WidgetConstants.ACTION_SNOOZE, 12_000))
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context)
            .notify(task.localId.hashCode(), notification)
    }

    suspend fun rebuildAll() {
        val repository = taskRepository ?: return
        repository.getTasksForReminderRebuild().forEach(::schedule)
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
        return PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    }

    private fun currentWorkspaceId(): String? {
        return runBlocking { tokenDataStore.currentWorkspace.first()?.id }
    }

    private fun reminderRequestCode(workspaceId: String, localId: String): Int {
        return "$workspaceId|$localId".hashCode()
    }

    private fun reminderCopy(): ReminderCopy {
        val language = runBlocking { tokenDataStore.language.first() }
        val appLanguage = AppLanguage.fromCode(language)
        val strings = stringsFor(AppLanguage.fromCode(language))
        val isEnglish = appLanguage == AppLanguage.English
        return ReminderCopy(
            channelName = if (isEnglish) "Reminders" else "任务提醒",
            channelDescription = if (isEnglish) "Due task notifications" else "到期任务通知",
            fallbackContent = if (isEnglish) strings.reminder else "任务提醒",
            completeAction = strings.complete,
            snoozeAction = strings.snoozeOneHour,
        )
    }

    private data class ReminderCopy(
        val channelName: String,
        val channelDescription: String,
        val fallbackContent: String,
        val completeAction: String,
        val snoozeAction: String,
    )

    companion object {
        const val CHANNEL_ID = "taskbridge_reminders"
        const val EXTRA_TASK_LOCAL_ID = "taskbridge.reminder.extra.TASK_LOCAL_ID"
        const val EXTRA_WORKSPACE_ID = "taskbridge.reminder.extra.WORKSPACE_ID"
    }
}
