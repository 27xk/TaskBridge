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
import com.taskbridge.app.data.local.ReminderTaskProjection
import com.taskbridge.app.data.local.TaskDao
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.stringsFor
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.time.Instant

class ReminderManager(
    private val context: Context,
    private val tokenDataStore: TokenDataStore,
    private val taskDao: TaskDao,
) {
    private val mutex = Mutex()
    private val preferences = context.getSharedPreferences("taskbridge_reminder_schedule", Context.MODE_PRIVATE)

    suspend fun ensureChannel() = ensureChannel(reminderCopy())

    private fun ensureChannel(copy: ReminderCopy) {
        val channel = NotificationChannel(CHANNEL_ID, copy.channelName, NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = copy.channelDescription
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    suspend fun updateTasks(expectedWorkspaceId: String, localIds: Set<String>) = mutex.withLock {
        val workspaceId = tokenDataStore.currentWorkspace.first()?.id ?: return@withLock
        if (workspaceId != expectedWorkspaceId) return@withLock
        val previous = scheduleForWorkspace(workspaceId)
        val tasks = localIds.chunked(400).flatMap { taskDao.getReminderTasks(workspaceId, it) }
        applyChanges(workspaceId, reminderChanges(previous, tasks, localIds, Instant.now()))
    }

    suspend fun schedule(task: Task) = mutex.withLock {
        val workspaceId = tokenDataStore.currentWorkspace.first()?.id ?: return@withLock
        val projection = ReminderTaskProjection(task.localId, task.status.wireName, task.isDeleted, task.dueTime, task.remindTime, task.snoozedUntil)
        applyChanges(workspaceId, reminderChanges(scheduleForWorkspace(workspaceId), listOf(projection), setOf(task.localId), Instant.now()))
    }

    suspend fun cancel(task: Task) = mutex.withLock {
        val workspaceId = tokenDataStore.currentWorkspace.first()?.id ?: return@withLock
        applyChanges(workspaceId, reminderChanges(scheduleForWorkspace(workspaceId), emptyList(), setOf(task.localId), Instant.now()))
    }

    /** Full reconciliation is for process/system recovery and workspace/timezone changes only. */
    suspend fun rebuildAll() = mutex.withLock {
        val workspaceId = tokenDataStore.currentWorkspace.first()?.id
        val previous = scheduleForWorkspace(workspaceId)
        if (workspaceId == null) return@withLock
        val tasks = taskDao.getReminderCandidates(workspaceId)
        applyChanges(workspaceId, reminderChanges(previous, tasks, previous.keys + tasks.map { it.localId }, Instant.now(), forceSchedule = true))
    }

    private fun scheduleForWorkspace(workspaceId: String?): Map<String, Long> {
        val previousWorkspace = preferences.getString("workspace", null)
        val previous = runCatching {
            val json = JSONObject(preferences.getString("alarms", "{}").orEmpty())
            json.keys().asSequence().associateWith { json.getLong(it) }
        }.getOrDefault(emptyMap())
        if (previousWorkspace == workspaceId) return previous
        previousWorkspace?.let { old -> previous.keys.forEach { cancelAlarm(old, it) } }
        preferences.edit().putString("workspace", workspaceId).putString("alarms", "{}").apply()
        return emptyMap()
    }

    private fun applyChanges(workspaceId: String, changes: ReminderChanges) {
        changes.cancel.forEach { cancelAlarm(workspaceId, it) }
        changes.schedule.forEach { (localId, triggerAt) -> scheduleAlarm(workspaceId, localId, triggerAt) }
        if (changes.schedule.isNotEmpty() || changes.cancel.isNotEmpty()) {
            preferences.edit().putString("workspace", workspaceId).putString("alarms", JSONObject(changes.next).toString()).apply()
        }
    }

    private fun scheduleAlarm(workspaceId: String, localId: String, triggerAt: Long) {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(EXTRA_TASK_LOCAL_ID, localId)
            putExtra(EXTRA_WORKSPACE_ID, workspaceId)
        }
        val pendingIntent = PendingIntent.getBroadcast(context, reminderRequestCode(workspaceId, localId), intent, pendingIntentFlags())
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }

    private fun cancelAlarm(workspaceId: String, localId: String) {
        val pendingIntent = PendingIntent.getBroadcast(
            context, reminderRequestCode(workspaceId, localId), Intent(context, ReminderReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        ) ?: return
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent)
        pendingIntent.cancel()
        NotificationManagerCompat.from(context).cancel(localId.hashCode())
    }

    suspend fun showReminder(task: Task) {
        if (task.status == TaskStatus.Completed || task.isDeleted) return
        TodayTaskWidgetUpdateWorker.enqueue(context)
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val workspaceId = tokenDataStore.currentWorkspace.first()?.id ?: return
        val copy = reminderCopy()
        ensureChannel(copy)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(task.title)
            .setContentText(task.content ?: copy.fallbackContent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openTaskIntent(task.localId))
            .addAction(0, copy.completeAction, actionIntent(workspaceId, task.localId, WidgetConstants.ACTION_COMPLETE, 11_000))
            .addAction(0, copy.snoozeAction, actionIntent(workspaceId, task.localId, WidgetConstants.ACTION_SNOOZE, 12_000))
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(task.localId.hashCode(), notification)
    }

    private fun openTaskIntent(localId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(WidgetConstants.EXTRA_WIDGET_TARGET, WidgetConstants.TARGET_TASK)
            putExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID, localId)
        }
        return PendingIntent.getActivity(context, localId.hashCode(), intent, pendingIntentFlags())
    }

    private fun actionIntent(workspaceId: String, localId: String, action: String, requestBase: Int): PendingIntent {
        val intent = Intent(context, com.taskbridge.app.widget.WidgetActionReceiver::class.java).apply {
            this.action = action
            putExtra(WidgetConstants.EXTRA_TASK_LOCAL_ID, localId)
            putExtra(EXTRA_WORKSPACE_ID, workspaceId)
        }
        return PendingIntent.getBroadcast(context, requestBase + (localId.hashCode() and 0x3fff), intent, pendingIntentFlags())
    }

    private fun pendingIntentFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    private fun reminderRequestCode(workspaceId: String, localId: String): Int = "$workspaceId|$localId".hashCode()

    private suspend fun reminderCopy(): ReminderCopy {
        val appLanguage = AppLanguage.fromCode(tokenDataStore.language.first())
        val strings = stringsFor(appLanguage)
        val isEnglish = appLanguage == AppLanguage.English
        return ReminderCopy(
            channelName = if (isEnglish) "Reminders" else "任务提醒",
            channelDescription = if (isEnglish) "Due task notifications" else "到期任务通知",
            fallbackContent = if (isEnglish) strings.reminder else "任务提醒",
            completeAction = strings.complete,
            snoozeAction = strings.snoozeOneHour,
        )
    }

    private data class ReminderCopy(val channelName: String, val channelDescription: String, val fallbackContent: String, val completeAction: String, val snoozeAction: String)

    companion object {
        const val CHANNEL_ID = "taskbridge_reminders"
        const val EXTRA_TASK_LOCAL_ID = "taskbridge.reminder.extra.TASK_LOCAL_ID"
        const val EXTRA_WORKSPACE_ID = "taskbridge.reminder.extra.WORKSPACE_ID"
    }
}
