package com.taskbridge.app.data.remote.dto

import com.google.gson.annotations.SerializedName

data class ApiEnvelope<T>(
    val code: Int,
    val message: String,
    val data: T?,
)

data class UserDto(
    val id: Int,
    val username: String,
    val email: String,
    @SerializedName("is_active") val isActive: Boolean,
)

data class RegisterRequestDto(
    val username: String,
    val email: String,
    val password: String,
)

data class LoginRequestDto(
    @SerializedName("username_or_email") val usernameOrEmail: String,
    val password: String,
)

data class RefreshTokenRequestDto(
    @SerializedName("refresh_token") val refreshToken: String,
)

data class TokenPairDto(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("refresh_token") val refreshToken: String,
    @SerializedName("token_type") val tokenType: String,
    @SerializedName("expires_in") val expiresIn: Int,
    val user: UserDto,
)

data class WebSocketTicketRequestDto(
    @SerializedName("device_id") val deviceId: String,
)

data class WebSocketTicketDto(
    val ticket: String,
    @SerializedName("expires_in") val expiresIn: Int,
)

data class DeviceRegisterRequestDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("device_name") val deviceName: String,
    @SerializedName("device_type") val deviceType: String,
)

data class DeviceDto(
    val id: Int,
    @SerializedName("user_id") val userId: Int,
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("device_name") val deviceName: String,
    @SerializedName("device_type") val deviceType: String,
    @SerializedName("last_online_at") val lastOnlineAt: String?,
)

data class TaskDto(
    val id: Int,
    @SerializedName("user_id") val userId: Int,
    val title: String,
    val content: String?,
    val status: String,
    val priority: Int,
    val tag: String?,
    val project: String?,
    @SerializedName("list_type") val listType: String?,
    @SerializedName("due_time") val dueTime: String?,
    @SerializedName("remind_time") val remindTime: String?,
    @SerializedName("repeat_rule") val repeatRule: String?,
    @SerializedName("planned_date") val plannedDate: String?,
    @SerializedName("completed_at") val completedAt: String?,
    @SerializedName("snoozed_until") val snoozedUntil: String?,
    @SerializedName("parent_task_id") val parentTaskId: Int?,
    val checklist: List<ChecklistItemDto>?,
    @SerializedName("is_template") val isTemplate: Boolean?,
    @SerializedName("template_name") val templateName: String?,
    @SerializedName("sort_order") val sortOrder: Int?,
    val version: Int,
    @SerializedName("is_deleted") val isDeleted: Boolean,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String,
    @SerializedName("deleted_at") val deletedAt: String?,
)

data class ChecklistItemDto(
    val id: String,
    val title: String,
    val done: Boolean,
)

data class ChecklistItemUpdateDto(
    val title: String?,
    val done: Boolean?,
)

data class TaskTemplateInstantiateRequestDto(
    val title: String?,
    val content: String?,
    val project: String?,
    val tag: String?,
    @SerializedName("list_type") val listType: String?,
    @SerializedName("due_time") val dueTime: String?,
    @SerializedName("remind_time") val remindTime: String?,
    @SerializedName("planned_date") val plannedDate: String?,
)

data class TaskHistoryDto(
    val id: Int,
    @SerializedName("task_id") val taskId: Int?,
    val operation: String,
    val result: String,
    val version: Int,
    @SerializedName("device_id") val deviceId: String?,
    @SerializedName("local_id") val localId: String?,
    @SerializedName("server_id") val serverId: Int?,
    val payload: Map<String, Any>?,
    @SerializedName("created_at") val createdAt: String,
)

data class TaskCreateRequestDto(
    val title: String,
    val content: String?,
    val priority: Int,
    val tag: String?,
    val project: String?,
    @SerializedName("list_type") val listType: String?,
    @SerializedName("due_time") val dueTime: String?,
    @SerializedName("remind_time") val remindTime: String?,
    @SerializedName("repeat_rule") val repeatRule: String?,
    @SerializedName("planned_date") val plannedDate: String?,
    @SerializedName("snoozed_until") val snoozedUntil: String?,
    @SerializedName("parent_task_id") val parentTaskId: Int?,
    val checklist: List<ChecklistItemDto>?,
    @SerializedName("is_template") val isTemplate: Boolean?,
    @SerializedName("template_name") val templateName: String?,
    @SerializedName("sort_order") val sortOrder: Int?,
)

data class TaskUpdateRequestDto(
    val title: String?,
    val content: String?,
    val status: String?,
    val priority: Int?,
    val tag: String?,
    val project: String?,
    @SerializedName("list_type") val listType: String?,
    @SerializedName("due_time") val dueTime: String?,
    @SerializedName("remind_time") val remindTime: String?,
    @SerializedName("repeat_rule") val repeatRule: String?,
    @SerializedName("planned_date") val plannedDate: String?,
    @SerializedName("completed_at") val completedAt: String?,
    @SerializedName("snoozed_until") val snoozedUntil: String?,
    @SerializedName("parent_task_id") val parentTaskId: Int?,
    val checklist: List<ChecklistItemDto>?,
    @SerializedName("is_template") val isTemplate: Boolean?,
    @SerializedName("template_name") val templateName: String?,
    @SerializedName("sort_order") val sortOrder: Int?,
)

data class SyncChangeDto(
    @SerializedName("local_id") val localId: String,
    @SerializedName("server_id") val serverId: Int?,
    val action: String,
    val title: String?,
    val content: String?,
    val status: String?,
    val priority: Int?,
    val tag: String?,
    val project: String?,
    @SerializedName("list_type") val listType: String?,
    @SerializedName("due_time") val dueTime: String?,
    @SerializedName("remind_time") val remindTime: String?,
    @SerializedName("repeat_rule") val repeatRule: String?,
    @SerializedName("planned_date") val plannedDate: String?,
    @SerializedName("completed_at") val completedAt: String?,
    @SerializedName("snoozed_until") val snoozedUntil: String?,
    @SerializedName("parent_task_id") val parentTaskId: Int?,
    val checklist: List<ChecklistItemDto>?,
    @SerializedName("is_template") val isTemplate: Boolean?,
    @SerializedName("template_name") val templateName: String?,
    @SerializedName("sort_order") val sortOrder: Int?,
    val version: Int,
    @SerializedName("local_updated_at") val localUpdatedAt: String,
)

data class SyncPushRequestDto(
    @SerializedName("device_id") val deviceId: String,
    val changes: List<SyncChangeDto>,
)

data class SyncChangeResultDto(
    @SerializedName("local_id") val localId: String,
    @SerializedName("server_id") val serverId: Int?,
    val action: String,
    val status: String,
    val version: Int?,
    val message: String?,
    val task: TaskDto?,
    @SerializedName("server_task") val serverTask: TaskDto?,
)

data class SyncPushResponseDto(
    val results: List<SyncChangeResultDto>,
    @SerializedName("server_time") val serverTime: String,
)

data class SyncPullResponseDto(
    @SerializedName("changed_tasks") val changedTasks: List<TaskDto>,
    @SerializedName("deleted_tasks") val deletedTasks: List<TaskDto>,
    @SerializedName("server_time") val serverTime: String,
)
