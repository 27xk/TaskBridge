package com.taskbridge.app.data.repository

import com.taskbridge.app.data.local.SyncQueueEntity
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.remote.dto.ChecklistItemDto
import com.taskbridge.app.data.remote.dto.SyncChangeDto
import com.taskbridge.app.data.remote.dto.TaskDto
import com.taskbridge.app.domain.model.SyncStatus
import com.google.gson.Gson

private val mapperGson = Gson()

fun TaskDto.toEntity(
    workspaceId: String,
    ownerUserId: String,
    localId: String,
    syncStatus: SyncStatus = SyncStatus.Synced,
    lastSyncAt: String?,
    conflictServerJson: String? = null,
    conflictLocalJson: String? = null,
): TaskEntity {
    return TaskEntity(
        localId = localId,
        workspaceId = workspaceId,
        ownerUserId = ownerUserId,
        serverId = id,
        title = title,
        content = content,
        status = status,
        priority = priority,
        tag = tag,
        project = project,
        listType = listType ?: "inbox",
        dueTime = dueTime,
        remindTime = remindTime,
        repeatRule = repeatRule,
        plannedDate = plannedDate,
        completedAt = completedAt,
        snoozedUntil = snoozedUntil,
        parentServerId = parentTaskId,
        checklistJson = mapperGson.toJson(checklist.orEmpty()),
        isTemplate = isTemplate ?: false,
        templateName = templateName,
        sortOrder = sortOrder ?: 0,
        version = version,
        isDeleted = isDeleted,
        syncStatus = syncStatus.wireName,
        conflictServerJson = conflictServerJson,
        conflictLocalJson = conflictLocalJson,
        createdAt = createdAt,
        updatedAt = updatedAt,
        lastSyncAt = lastSyncAt,
    )
}

fun SyncQueueEntity.toDto(): SyncChangeDto {
    return SyncChangeDto(
        localId = localId,
        serverId = serverId,
        action = action,
        title = title,
        content = content,
        status = status,
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
        parentTaskId = parentServerId,
        checklist = checklistJson.toChecklistDtos(),
        isTemplate = isTemplate,
        templateName = templateName,
        sortOrder = sortOrder,
        version = version,
        localUpdatedAt = localUpdatedAt,
    )
}

private fun String?.toChecklistDtos(): List<ChecklistItemDto>? {
    if (this.isNullOrBlank()) return null
    return runCatching {
        mapperGson.fromJson(this, Array<ChecklistItemDto>::class.java).toList()
    }.getOrDefault(emptyList())
}
