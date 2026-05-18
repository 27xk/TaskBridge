package com.taskbridge.app.widget

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val shanghaiZone: ZoneId = ZoneId.of("Asia/Shanghai")
private val widgetTimeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

data class TodayTaskWidgetState(
    val isLoggedIn: Boolean,
    val tasks: List<TodayTaskWidgetItem>,
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
        if (accessToken.isNullOrBlank()) {
            return TodayTaskWidgetState(isLoggedIn = false, tasks = emptyList())
        }

        val todayDate = LocalDate.now(shanghaiZone)
        val today = todayDate.toString()
        val startTime = todayDate.atStartOfDay(shanghaiZone).toInstant().toString()
        val endTime = todayDate.plusDays(1).atStartOfDay(shanghaiZone).toInstant().toString()
        val tasks = taskDao.getTodayWidgetTasks(
            today = today,
            startTime = startTime,
            endTime = endTime,
            highPriority = WidgetConstants.HIGH_PRIORITY,
            limit = WidgetConstants.MAX_TASKS,
        )
            .filter { isWidgetCandidate(it, today) }
            .take(WidgetConstants.MAX_TASKS)
            .map { it.toWidgetItem(today) }

        return TodayTaskWidgetState(isLoggedIn = true, tasks = tasks)
    }

    companion object {
        fun isWidgetCandidate(
            task: TodayWidgetTaskProjection,
            today: String,
            highPriority: Int = WidgetConstants.HIGH_PRIORITY,
        ): Boolean {
            if (task.dueTime.isToday(today)) return true
            if (task.remindTime.isToday(today)) return true
            if (task.plannedDate == today) return true
            return task.status == "todo" && task.priority >= highPriority
        }
    }
}

private fun TodayWidgetTaskProjection.toWidgetItem(today: String): TodayTaskWidgetItem {
    return TodayTaskWidgetItem(
        localId = localId,
        title = title,
        dueLabel = dueLabel(today),
        priorityLabel = "P$priority",
        isCompleted = status == "completed",
    )
}

private fun TodayWidgetTaskProjection.dueLabel(today: String): String {
    return when {
        dueTime.isToday(today) -> "截止 ${dueTime.timePart()}"
        remindTime.isToday(today) -> "提醒 ${remindTime.timePart()}"
        plannedDate == today -> "今日计划"
        else -> "高优先级"
    }
}

private fun String?.isToday(today: String): Boolean {
    return this?.let {
        runCatching {
            Instant.parse(it).atZone(shanghaiZone).toLocalDate().toString() == today
        }.getOrDefault(false)
    } == true
}

private fun String?.timePart(): String {
    return this?.let {
        runCatching {
            widgetTimeFormatter.format(Instant.parse(it).atZone(shanghaiZone))
        }.getOrDefault("--:--")
    } ?: "--:--"
}
