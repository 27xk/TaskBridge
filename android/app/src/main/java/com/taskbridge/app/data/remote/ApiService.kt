package com.taskbridge.app.data.remote

import com.taskbridge.app.data.remote.dto.ApiEnvelope
import com.taskbridge.app.data.remote.dto.ChecklistItemDto
import com.taskbridge.app.data.remote.dto.ChecklistItemUpdateDto
import com.taskbridge.app.data.remote.dto.DeviceDto
import com.taskbridge.app.data.remote.dto.DeviceRegisterRequestDto
import com.taskbridge.app.data.remote.dto.LoginRequestDto
import com.taskbridge.app.data.remote.dto.RefreshTokenRequestDto
import com.taskbridge.app.data.remote.dto.RegisterRequestDto
import com.taskbridge.app.data.remote.dto.SyncPullResponseDto
import com.taskbridge.app.data.remote.dto.SyncPushRequestDto
import com.taskbridge.app.data.remote.dto.SyncPushResponseDto
import com.taskbridge.app.data.remote.dto.TaskCreateRequestDto
import com.taskbridge.app.data.remote.dto.TaskDto
import com.taskbridge.app.data.remote.dto.TaskHistoryDto
import com.taskbridge.app.data.remote.dto.TaskTemplateInstantiateRequestDto
import com.taskbridge.app.data.remote.dto.TaskUpdateRequestDto
import com.taskbridge.app.data.remote.dto.TokenPairDto
import com.taskbridge.app.data.remote.dto.UserDto
import com.taskbridge.app.data.remote.dto.WebSocketTicketDto
import com.taskbridge.app.data.remote.dto.WebSocketTicketRequestDto
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequestDto): ApiEnvelope<TokenPairDto>

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequestDto): ApiEnvelope<TokenPairDto>

    @POST("auth/refresh")
    suspend fun refresh(@Body request: RefreshTokenRequestDto): ApiEnvelope<TokenPairDto>

    @GET("auth/me")
    suspend fun me(): ApiEnvelope<UserDto>

    @POST("auth/ws-ticket")
    suspend fun createWebSocketTicket(
        @Body request: WebSocketTicketRequestDto,
    ): ApiEnvelope<WebSocketTicketDto>

    @GET("tasks")
    suspend fun getTasks(): ApiEnvelope<List<TaskDto>>

    @POST("tasks")
    suspend fun createTask(@Body request: TaskCreateRequestDto): ApiEnvelope<TaskDto>

    @GET("tasks/{task_id}")
    suspend fun getTask(@Path("task_id") taskId: Int): ApiEnvelope<TaskDto>

    @GET("tasks/{task_id}/history")
    suspend fun getTaskHistory(@Path("task_id") taskId: Int): ApiEnvelope<List<TaskHistoryDto>>

    @PUT("tasks/{task_id}")
    suspend fun updateTask(
        @Path("task_id") taskId: Int,
        @Body request: TaskUpdateRequestDto,
    ): ApiEnvelope<TaskDto>

    @DELETE("tasks/{task_id}")
    suspend fun deleteTask(@Path("task_id") taskId: Int): ApiEnvelope<TaskDto>

    @DELETE("tasks/{task_id}/purge")
    suspend fun purgeTask(@Path("task_id") taskId: Int): ApiEnvelope<TaskDto>

    @POST("tasks/{task_id}/checklist")
    suspend fun addChecklistItem(
        @Path("task_id") taskId: Int,
        @Body request: ChecklistItemDto,
    ): ApiEnvelope<TaskDto>

    @PUT("tasks/{task_id}/checklist/{item_id}")
    suspend fun updateChecklistItem(
        @Path("task_id") taskId: Int,
        @Path("item_id") itemId: String,
        @Body request: ChecklistItemUpdateDto,
    ): ApiEnvelope<TaskDto>

    @DELETE("tasks/{task_id}/checklist/{item_id}")
    suspend fun deleteChecklistItem(
        @Path("task_id") taskId: Int,
        @Path("item_id") itemId: String,
    ): ApiEnvelope<TaskDto>

    @POST("tasks/{task_id}/complete")
    suspend fun completeTask(@Path("task_id") taskId: Int): ApiEnvelope<TaskDto>

    @POST("tasks/{task_id}/restore")
    suspend fun restoreTask(@Path("task_id") taskId: Int): ApiEnvelope<TaskDto>

    @POST("tasks/{task_id}/next-occurrence")
    suspend fun createNextOccurrence(@Path("task_id") taskId: Int): ApiEnvelope<TaskDto>

    @POST("tasks/templates/{template_id}/instantiate")
    suspend fun instantiateTemplate(
        @Path("template_id") templateId: Int,
        @Body request: TaskTemplateInstantiateRequestDto,
    ): ApiEnvelope<TaskDto>

    @POST("devices/register")
    suspend fun registerDevice(@Body request: DeviceRegisterRequestDto): ApiEnvelope<DeviceDto>

    @GET("sync/pull")
    suspend fun pullSync(
        @Query("last_sync_time") lastSyncTime: String,
        @Query("limit") limit: Int? = null,
        @Query("cursor_updated_at") cursorUpdatedAt: String? = null,
        @Query("cursor_id") cursorId: Int? = null,
    ): ApiEnvelope<SyncPullResponseDto>

    @POST("sync/push")
    suspend fun pushSync(@Body request: SyncPushRequestDto): ApiEnvelope<SyncPushResponseDto>
}

interface TokenRefreshApi {
    @POST("auth/refresh")
    fun refresh(@Body request: RefreshTokenRequestDto): Call<ApiEnvelope<TokenPairDto>>
}
