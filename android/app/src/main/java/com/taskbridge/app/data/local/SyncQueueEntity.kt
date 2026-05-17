package com.taskbridge.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sync_queue",
    indices = [
        Index(value = ["localId"]),
        Index(value = ["serverId"]),
        Index(value = ["createdAt", "id"]),
    ],
)
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val localId: String,
    val serverId: Int?,
    val action: String,
    val title: String?,
    val content: String?,
    val status: String?,
    val priority: Int?,
    val tag: String?,
    val project: String?,
    val listType: String?,
    val dueTime: String?,
    val remindTime: String?,
    val repeatRule: String?,
    val plannedDate: String?,
    val completedAt: String?,
    val snoozedUntil: String?,
    val parentServerId: Int?,
    val checklistJson: String?,
    val isTemplate: Boolean?,
    val templateName: String?,
    val sortOrder: Int?,
    val version: Int,
    val localUpdatedAt: String,
    val createdAt: String,
    val attemptCount: Int = 0,
)
