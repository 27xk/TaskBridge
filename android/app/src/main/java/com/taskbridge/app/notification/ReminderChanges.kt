package com.taskbridge.app.notification

import com.taskbridge.app.data.local.ReminderTaskProjection
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.utils.ShanghaiTime
import java.time.Instant

data class ReminderChanges(
    val schedule: Map<String, Long>,
    val cancel: Set<String>,
    val next: Map<String, Long>,
)

fun reminderChanges(
    previous: Map<String, Long>,
    tasks: List<ReminderTaskProjection>,
    changedIds: Set<String>,
    now: Instant,
    forceSchedule: Boolean = false,
): ReminderChanges {
    val desired = tasks.associate { task ->
        val trigger = if (task.isDeleted || TaskStatus.fromWire(task.status) == TaskStatus.Completed) null else {
            ShanghaiTime.parseInstant(reminderTrigger(task.remindTime, task.dueTime, task.snoozedUntil, now))
                ?.takeIf { it.isAfter(now) }?.toEpochMilli()
        }
        task.localId to trigger
    }
    val next = previous.toMutableMap()
    val schedule = mutableMapOf<String, Long>()
    val cancel = mutableSetOf<String>()
    changedIds.forEach { id ->
        val trigger = desired[id]
        if (trigger == null) {
            if (next.remove(id) != null) cancel += id
        } else {
            if (forceSchedule || previous[id] != trigger) schedule[id] = trigger
            next[id] = trigger
        }
    }
    return ReminderChanges(schedule, cancel, next)
}
