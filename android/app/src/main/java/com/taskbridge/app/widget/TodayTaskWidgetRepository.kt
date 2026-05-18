package com.taskbridge.app.widget

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.flow.first
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
            taskDao.getAllWidgetTasks(queryLimit)
        } else {
            val (startTime, endTime) = ShanghaiTime.dayBounds(today, displayTimeZone)
            taskDao.getTodayWidgetTasks(
                today = today,
                startTime = startTime,
                endTime = endTime,
                highPriority = WidgetConstants.HIGH_PRIORITY,
                limit = queryLimit,
            ).filter { isWidgetCandidate(it, today, displayTimeZone) }
        }

        val tasks = candidates
            .filter { completionScope == WidgetConstants.COMPLETION_SCOPE_ALL || it.status != "completed" }
            .take(WidgetConstants.MAX_TASKS)
            .map { it.toWidgetItem(today, displayTimeZone) }

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
        ): Boolean {
            if (task.dueTime.isToday(today, displayTimeZone)) return true
            if (task.remindTime.isToday(today, displayTimeZone)) return true
            if (task.plannedDate == today) return true
            return task.status == "todo" && task.priority >= highPriority
        }
    }
}

private fun TodayWidgetTaskProjection.toWidgetItem(
    today: String,
    displayTimeZone: String,
): TodayTaskWidgetItem {
    return TodayTaskWidgetItem(
        localId = localId,
        title = title,
        dueLabel = dueLabel(today, displayTimeZone),
        priorityLabel = if (priority > 0) "P$priority" else "P0",
        isCompleted = status == "completed",
    )
}

private fun TodayWidgetTaskProjection.dueLabel(today: String, displayTimeZone: String): String {
    dueTime.dateTimeLabel(today, displayTimeZone)?.let { return it }
    plannedDate.dateLabel(today)?.let { return it }
    remindTime.dateTimeLabel(today, displayTimeZone)?.let { return it }
    return "无截止时间"
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
    return if (date.toString() == today) "今天" else ShanghaiTime.formatMonthDay(date)
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
