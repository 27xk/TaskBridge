package com.taskbridge.app.widget

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.domain.model.isTaskOverdue
import com.taskbridge.app.domain.model.taskTimelineSortKey
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.LocalDate

data class TodayTaskWidgetState(
    val isLoggedIn: Boolean,
    val tasks: List<TodayTaskWidgetItem>,
    val opacityPercent: Int,
    val taskScope: String,
)

data class TodayTaskWidgetItem(
    val localId: String,
    val title: String,
    val dueLabel: String,
    val priorityLabel: String,
    val isCompleted: Boolean,
    val isOverdue: Boolean,
)

class TodayTaskWidgetRepository(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val taskDao = AppDatabase.getInstance(appContext).taskDao()
    private val tokenDataStore = TokenDataStore(appContext)

    suspend fun loadState(): TodayTaskWidgetState {
        val accessToken = tokenDataStore.accessToken.first()
        val opacityPercent = tokenDataStore.widgetOpacityPercent.first()
        val displayTimeZone = tokenDataStore.displayTimeZone.first()
        val taskScope = normalizeScope(tokenDataStore.widgetTaskScope.first())
        val completionScope = normalizeCompletionScope(tokenDataStore.widgetCompletionScope.first())
        val today = ShanghaiTime.todayDate(displayTimeZone).toString()
        val now = Instant.now()
        if (accessToken.isNullOrBlank()) {
            return TodayTaskWidgetState(
                isLoggedIn = false,
                tasks = emptyList(),
                opacityPercent = opacityPercent,
                taskScope = taskScope,
            )
        }

        val queryLimit = WidgetConstants.MAX_TASKS * 3
        val candidates = if (taskScope == WidgetConstants.TASK_SCOPE_ALL) {
            taskDao.getAllWidgetTasks(queryLimit, now.toString())
        } else {
            val (startTime, endTime) = ShanghaiTime.dayBounds(today, displayTimeZone)
            taskDao.getTodayWidgetTasks(
                today = today,
                startTime = startTime,
                endTime = endTime,
                nowTime = now.toString(),
                highPriority = WidgetConstants.HIGH_PRIORITY,
                limit = queryLimit,
            ).filter { isWidgetCandidate(it, today, displayTimeZone, now = now) }
        }

        val tasks = candidates
            .filter {
                completionScope == WidgetConstants.COMPLETION_SCOPE_ALL ||
                    TaskStatus.fromWire(it.status) != TaskStatus.Completed
            }
            .sortedForWidget(now, displayTimeZone)
            .take(WidgetConstants.MAX_TASKS)
            .map { it.toWidgetItem(today, displayTimeZone, now) }

        return TodayTaskWidgetState(
            isLoggedIn = true,
            tasks = tasks,
            opacityPercent = opacityPercent,
            taskScope = taskScope,
        )
    }

    companion object {
        fun isWidgetCandidate(
            task: TodayWidgetTaskProjection,
            today: String,
            displayTimeZone: String = ShanghaiTime.DEFAULT_ZONE_ID,
            highPriority: Int = WidgetConstants.HIGH_PRIORITY,
            now: Instant = Instant.now(),
        ): Boolean {
            if (isTaskOverdue(task.status, task.dueTime, now)) return true
            if (task.dueTime.isToday(today, displayTimeZone)) return true
            if (task.remindTime.isToday(today, displayTimeZone)) return true
            if (task.plannedDate == today) return true
            return task.status == TaskStatus.Todo.wireName && task.priority >= highPriority
        }
    }
}

fun List<TodayWidgetTaskProjection>.sortedForWidget(
    now: Instant,
    displayTimeZone: String,
): List<TodayWidgetTaskProjection> {
    return map { task ->
        task to taskTimelineSortKey(
            statusWire = task.status,
            dueTime = task.dueTime,
            plannedDate = task.plannedDate,
            completedAt = task.completedAt,
            priority = task.priority,
            sortOrder = task.sortOrder,
            updatedAt = task.updatedAt,
            now = now,
            displayTimeZone = displayTimeZone,
        )
    }.sortedBy { it.second }.map { it.first }
}

private fun TodayWidgetTaskProjection.toWidgetItem(
    today: String,
    displayTimeZone: String,
    now: Instant,
): TodayTaskWidgetItem {
    return TodayTaskWidgetItem(
        localId = localId,
        title = title,
        dueLabel = dueLabel(today, displayTimeZone, now),
        priorityLabel = if (priority > 0) "P$priority" else "P0",
        isCompleted = TaskStatus.fromWire(status) == TaskStatus.Completed,
        isOverdue = isTaskOverdue(status, dueTime, now),
    )
}

private fun TodayWidgetTaskProjection.dueLabel(today: String, displayTimeZone: String, now: Instant): String {
    val prefix = if (isTaskOverdue(status, dueTime, now)) "\u903E\u671F " else ""
    dueTime.dateTimeLabel(today, displayTimeZone)?.let { return prefix + it }
    plannedDate.dateLabel(today)?.let { return it }
    remindTime.dateTimeLabel(today, displayTimeZone)?.let { return it }
    return "\u65E0\u622A\u6B62\u65F6\u95F4"
}

private fun String?.isToday(today: String, displayTimeZone: String): Boolean {
    return localDate(displayTimeZone)?.toString() == today
}

private fun String?.localDate(displayTimeZone: String): LocalDate? {
    return ShanghaiTime.localDate(this, displayTimeZone)
}

private fun String?.localDate(): LocalDate? {
    val raw = this ?: return null
    return runCatching { LocalDate.parse(raw) }.getOrNull()
}

private fun String?.dateTimeLabel(today: String, displayTimeZone: String): String? {
    val raw = this?.takeIf { it.isNotBlank() } ?: return null
    val date = ShanghaiTime.localDate(raw, displayTimeZone) ?: return null
    val time = ShanghaiTime.formatTime(raw, displayTimeZone)
    return "${dateLabel(date, today)} $time"
}

private fun String?.dateLabel(today: String): String? {
    return localDate()?.let { dateLabel(it, today) }
}

private fun dateLabel(date: LocalDate, today: String): String {
    return if (date.toString() == today) "\u4ECA\u5929" else ShanghaiTime.formatMonthDay(date)
}

private fun normalizeScope(scope: String): String {
    return if (scope == WidgetConstants.TASK_SCOPE_ALL) {
        WidgetConstants.TASK_SCOPE_ALL
    } else {
        WidgetConstants.TASK_SCOPE_TODAY
    }
}

private fun normalizeCompletionScope(scope: String): String {
    return if (scope == WidgetConstants.COMPLETION_SCOPE_ALL) {
        WidgetConstants.COMPLETION_SCOPE_ALL
    } else {
        WidgetConstants.COMPLETION_SCOPE_OPEN
    }
}
