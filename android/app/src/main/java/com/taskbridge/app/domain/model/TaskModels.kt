package com.taskbridge.app.domain.model

import com.taskbridge.app.data.local.TaskEntity

enum class TaskStatus(val wireName: String) {
    Todo("todo"),
    Completed("completed");

    companion object {
        fun fromWire(value: String): TaskStatus {
            return when (value.lowercase()) {
                "completed", "done" -> Completed
                else -> Todo
            }
        }
    }
}

enum class SyncStatus(val wireName: String) {
    Synced("synced"),
    PendingCreate("pending_create"),
    PendingUpdate("pending_update"),
    PendingDelete("pending_delete"),
    Conflict("conflict");

    companion object {
        fun fromWire(value: String): SyncStatus {
            return entries.firstOrNull { it.wireName == value } ?: Synced
        }
    }
}

data class Task(
    val localId: String,
    val serverId: Int?,
    val title: String,
    val content: String?,
    val status: TaskStatus,
    val priority: Int,
    val tag: String?,
    val project: String?,
    val listType: String,
    val dueTime: String?,
    val remindTime: String?,
    val repeatRule: String?,
    val plannedDate: String?,
    val completedAt: String?,
    val snoozedUntil: String?,
    val parentServerId: Int?,
    val checklistJson: String,
    val isTemplate: Boolean,
    val templateName: String?,
    val sortOrder: Int,
    val version: Int,
    val isDeleted: Boolean,
    val syncStatus: SyncStatus,
    val createdAt: String,
    val updatedAt: String,
    val lastSyncAt: String?,
)

fun TaskEntity.toDomain(): Task {
    return Task(
        localId = localId,
        serverId = serverId,
        title = title,
        content = content,
        status = TaskStatus.fromWire(status),
        priority = priority,
        tag = tag,
        project = project,
        listType = listType,
        dueTime = dueTime,
        remindTime = remindTime,
        repeatRule = repeatRule,
        plannedDate = plannedDate,
        completedAt = completedAt,
        snoozedUntil = snoozedUntil,
        parentServerId = parentServerId,
        checklistJson = checklistJson,
        isTemplate = isTemplate,
        templateName = templateName,
        sortOrder = sortOrder,
        version = version,
        isDeleted = isDeleted,
        syncStatus = SyncStatus.fromWire(syncStatus),
        createdAt = createdAt,
        updatedAt = updatedAt,
        lastSyncAt = lastSyncAt,
    )
}
