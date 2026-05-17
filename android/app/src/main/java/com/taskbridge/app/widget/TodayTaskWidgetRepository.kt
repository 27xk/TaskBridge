package com.taskbridge.app.widget

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import kotlinx.coroutines.flow.first
import java.time.LocalDate

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

        val today = LocalDate.now().toString()
        val tasks = taskDao.getTodayWidgetTasks(
            todayPrefix = today,
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
    return this?.startsWith(today) == true
}

private fun String?.timePart(): String {
    if (this == null || length < 16) return "--:--"
    return substring(11, 16)
}
