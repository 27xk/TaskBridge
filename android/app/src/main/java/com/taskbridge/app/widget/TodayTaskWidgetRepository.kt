package com.taskbridge.app.widget

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import com.taskbridge.app.data.local.WorkspaceMigrationCoordinator
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.domain.model.isTaskOverdue
import com.taskbridge.app.domain.model.taskTimelineSortKey
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.LocalDate

data class TodayTaskWidgetState(
    val hasWorkspace: Boolean,
    val tasks: List<TodayTaskWidgetItem>,
    val hasMoreTasks: Boolean,
    val opacityPercent: Int,
    val taskScope: String,
    val style: String,
    val copy: WidgetCopy,
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
    private val database = AppDatabase.getInstance(appContext)
    private val taskDao = database.taskDao()
    private val tokenDataStore = TokenDataStore(appContext)
    private val workspaceMigration = WorkspaceMigrationCoordinator(
        database,
        taskDao,
        database.syncQueueDao(),
        tokenDataStore,
    )

    suspend fun loadState(): TodayTaskWidgetState {
        tokenDataStore.initializeLegacyWorkspaceOwnership()
        val workspace = tokenDataStore.currentWorkspace.first()
        val opacityPercent = tokenDataStore.widgetOpacityPercent.first()
        val copy = widgetCopy(AppLanguage.fromCode(tokenDataStore.language.first()))
        val displayTimeZone = tokenDataStore.displayTimeZone.first()
        val taskScope = normalizeScope(tokenDataStore.widgetTaskScope.first())
        val completionScope = normalizeCompletionScope(tokenDataStore.widgetCompletionScope.first())
        val style = normalizeStyle(tokenDataStore.widgetStyle.first())
        val today = ShanghaiTime.todayDate(displayTimeZone).toString()
        val now = Instant.now()
        if (workspace == null) {
            return TodayTaskWidgetState(
                hasWorkspace = false,
                tasks = emptyList(),
                hasMoreTasks = false,
                opacityPercent = opacityPercent,
                taskScope = taskScope,
                style = style,
                copy = copy,
            )
        }
        workspaceMigration.ensureWorkspace(workspace)

        val queryLimit = WidgetConstants.MAX_TASKS * 3
        val candidates = if (taskScope == WidgetConstants.TASK_SCOPE_ALL) {
            taskDao.getAllWidgetTasks(workspace.id, queryLimit, now.toString())
        } else {
            val (startTime, endTime) = ShanghaiTime.dayBounds(today, displayTimeZone)
            taskDao.getTodayWidgetTasks(
                workspaceId = workspace.id,
                today = today,
                startTime = startTime,
                endTime = endTime,
                nowTime = now.toString(),
                limit = queryLimit,
            ).filter { isWidgetCandidate(it, today, displayTimeZone, now = now) }
        }

        val filteredCandidates = candidates
            .filter {
                completionScope == WidgetConstants.COMPLETION_SCOPE_ALL ||
                    TaskStatus.fromWire(it.status) != TaskStatus.Completed
            }
            .sortedForWidget(now, displayTimeZone)
        val hasMoreTasks = filteredCandidates.size > WidgetConstants.MAX_TASKS
        val visibleTaskLimit = if (hasMoreTasks) {
            WidgetConstants.MAX_TASKS - 2
        } else {
            WidgetConstants.MAX_TASKS
        }
        val tasks = filteredCandidates
            .take(visibleTaskLimit)
            .map { it.toWidgetItem(today, displayTimeZone, now, copy) }

        return TodayTaskWidgetState(
            hasWorkspace = true,
            tasks = tasks,
            hasMoreTasks = hasMoreTasks,
            opacityPercent = opacityPercent,
            taskScope = taskScope,
            style = style,
            copy = copy,
        )
    }

    companion object {
        fun isWidgetCandidate(
            task: TodayWidgetTaskProjection,
            today: String,
            displayTimeZone: String = ShanghaiTime.DEFAULT_ZONE_ID,
            now: Instant = Instant.now(),
        ): Boolean {
            if (isTaskOverdue(task.status, task.dueTime, now, displayTimeZone)) return true
            if (task.dueTime.isToday(today, displayTimeZone)) return true
            if (task.remindTime.isToday(today, displayTimeZone)) return true
            if (task.plannedDate == today) return true
            return false
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
    copy: WidgetCopy,
): TodayTaskWidgetItem {
    return TodayTaskWidgetItem(
        localId = localId,
        title = title,
        dueLabel = dueLabel(today, displayTimeZone, now, copy),
        priorityLabel = if (priority > 0) "P$priority" else "P0",
        isCompleted = TaskStatus.fromWire(status) == TaskStatus.Completed,
        isOverdue = isTaskOverdue(status, dueTime, now, displayTimeZone),
    )
}

private fun TodayWidgetTaskProjection.dueLabel(
    today: String,
    displayTimeZone: String,
    now: Instant,
    copy: WidgetCopy,
): String {
    val prefix = if (isTaskOverdue(status, dueTime, now, displayTimeZone)) copy.overduePrefix else ""
    dueTime.dateTimeLabel(today, displayTimeZone, copy)?.let { return prefix + it }
    plannedDate.dateLabel(today, copy)?.let { return it }
    remindTime.dateTimeLabel(today, displayTimeZone, copy)?.let { return it }
    return copy.noDueTime
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

private fun String?.dateTimeLabel(today: String, displayTimeZone: String, copy: WidgetCopy): String? {
    val raw = this?.takeIf { it.isNotBlank() } ?: return null
    val date = ShanghaiTime.localDate(raw, displayTimeZone) ?: return null
    val time = ShanghaiTime.formatTime(raw, displayTimeZone)
    return "${dateLabel(date, today, copy)} $time"
}

private fun String?.dateLabel(today: String, copy: WidgetCopy): String? {
    return localDate()?.let { dateLabel(it, today, copy) }
}

private fun dateLabel(date: LocalDate, today: String, copy: WidgetCopy): String {
    return if (date.toString() == today) copy.today else ShanghaiTime.formatMonthDay(date)
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

private fun normalizeStyle(style: String): String {
    return if (style == WidgetConstants.STYLE_TRANSPARENT) {
        WidgetConstants.STYLE_TRANSPARENT
    } else {
        WidgetConstants.STYLE_CLEAR
    }
}
