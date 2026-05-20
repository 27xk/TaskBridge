package com.taskbridge.app.domain.model

import com.taskbridge.app.utils.ShanghaiTime
import java.time.Instant
import java.time.LocalDate

data class TaskTimelineSortKey(
    val completionRank: Int,
    val scheduleRank: Int,
    val scheduleMillis: Long,
    val sortOrder: Int,
    val priorityRank: Int,
    val updatedAtRank: Long,
) : Comparable<TaskTimelineSortKey> {
    override fun compareTo(other: TaskTimelineSortKey): Int {
        compareValues(completionRank, other.completionRank).takeIf { it != 0 }?.let { return it }
        compareValues(scheduleRank, other.scheduleRank).takeIf { it != 0 }?.let { return it }
        compareValues(scheduleMillis, other.scheduleMillis).takeIf { it != 0 }?.let { return it }
        compareValues(sortOrder, other.sortOrder).takeIf { it != 0 }?.let { return it }
        compareValues(priorityRank, other.priorityRank).takeIf { it != 0 }?.let { return it }
        return compareValues(updatedAtRank, other.updatedAtRank)
    }
}

fun isTaskOverdue(
    statusWire: String,
    dueTime: String?,
    now: Instant,
    displayTimeZone: String = ShanghaiTime.DEFAULT_ZONE_ID,
): Boolean {
    if (TaskStatus.fromWire(statusWire) == TaskStatus.Completed) return false
    val dueLocal = ShanghaiTime.localDateTime(dueTime, displayTimeZone) ?: return false
    val nowLocal = now.atZone(ShanghaiTime.zone(displayTimeZone)).toLocalDateTime()
    return dueLocal.isBefore(nowLocal)
}

fun Task.isOverdueAt(now: Instant): Boolean {
    return isTaskOverdue(status.wireName, dueTime, now)
}

fun Task.isOverdueAt(now: Instant, displayTimeZone: String): Boolean {
    return isTaskOverdue(status.wireName, dueTime, now, displayTimeZone)
}

fun taskTimelineSortKey(
    statusWire: String,
    dueTime: String?,
    plannedDate: String?,
    completedAt: String?,
    priority: Int,
    sortOrder: Int,
    updatedAt: String?,
    now: Instant,
    displayTimeZone: String,
): TaskTimelineSortKey {
    val isCompleted = TaskStatus.fromWire(statusWire) == TaskStatus.Completed
    val dueInstant = ShanghaiTime.parseInstant(dueTime)
    val plannedMillis = plannedDateStartMillis(plannedDate, displayTimeZone)
    val updatedAtMillis = ShanghaiTime.parseInstant(updatedAt)?.toEpochMilli()
    val completedAtMillis = ShanghaiTime.parseInstant(completedAt)?.toEpochMilli()
    val completedRecencyMillis = completedAtMillis
        ?: updatedAtMillis
        ?: dueInstant?.toEpochMilli()
        ?: plannedMillis
    val isOverdue = isTaskOverdue(statusWire, dueTime, now, displayTimeZone)
    val scheduleRank = when {
        isCompleted -> 4
        isOverdue -> 0
        dueInstant != null -> 1
        plannedMillis != null -> 2
        else -> 3
    }
    val scheduleMillis = when {
        isCompleted -> completedRecencyMillis?.let { -it } ?: Long.MAX_VALUE
        dueInstant != null -> dueInstant.toEpochMilli()
        plannedMillis != null -> plannedMillis
        else -> Long.MAX_VALUE
    }

    return TaskTimelineSortKey(
        completionRank = if (isCompleted) 1 else 0,
        scheduleRank = scheduleRank,
        scheduleMillis = scheduleMillis,
        sortOrder = sortOrder,
        priorityRank = -priority,
        updatedAtRank = updatedAtMillis?.let { -it } ?: Long.MAX_VALUE,
    )
}

fun List<Task>.sortedByTaskTimeline(
    now: Instant,
    displayTimeZone: String,
): List<Task> {
    return map { task ->
        task to taskTimelineSortKey(
            statusWire = task.status.wireName,
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

private fun plannedDateStartMillis(plannedDate: String?, displayTimeZone: String): Long? {
    val date = plannedDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    return date.atStartOfDay(ShanghaiTime.zone(displayTimeZone)).toInstant().toEpochMilli()
}
