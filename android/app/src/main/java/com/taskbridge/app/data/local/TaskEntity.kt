package com.taskbridge.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "tasks",
    indices = [
        Index(value = ["workspaceId", "serverId"], unique = true),
        Index(value = ["workspaceId", "localId"]),
        Index(value = ["workspaceId"]),
        Index(value = ["ownerUserId"]),
        Index(value = ["syncStatus"]),
        Index(value = ["dueTime"]),
        Index(value = ["listType"]),
        Index(value = ["plannedDate"]),
        Index(value = ["isDeleted", "updatedAt"]),
        Index(value = ["isDeleted", "dueTime", "remindTime", "plannedDate"]),
        Index(value = ["status", "priority"]),
    ],
)
data class TaskEntity(
    @PrimaryKey val localId: String,
    val workspaceId: String,
    val ownerUserId: String,
    val serverId: Int?,
    val title: String,
    val content: String?,
    val status: String,
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
    val syncStatus: String,
    val conflictServerJson: String?,
    val conflictLocalJson: String?,
    val createdAt: String,
    val updatedAt: String,
    val lastSyncAt: String?,
)
