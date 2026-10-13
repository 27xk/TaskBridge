package com.taskbridge.app.data.repository

import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.domain.model.SyncStatus

fun postponeTaskSnapshot(
    current: TaskEntity,
    dueTime: String?,
    remindTime: String?,
    plannedDate: String?,
    now: String,
): TaskEntity = current.copy(
    listType = "inbox",
    dueTime = dueTime ?: current.dueTime,
    remindTime = remindTime ?: if (dueTime != null && current.remindTime != null) dueTime else current.remindTime,
    plannedDate = plannedDate ?: current.plannedDate,
    snoozedUntil = null,
    syncStatus = if (current.serverId == null) SyncStatus.PendingCreate.wireName else SyncStatus.PendingUpdate.wireName,
    updatedAt = now,
)
