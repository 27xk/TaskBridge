package com.taskbridge.app.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

data class TodayWidgetTaskProjection(
    val localId: String,
    val title: String,
    val status: String,
    val priority: Int,
    val dueTime: String?,
    val remindTime: String?,
    val plannedDate: String?,
    val completedAt: String?,
    val sortOrder: Int,
    val updatedAt: String,
)

data class SyncQueueCounts(
    val total: Int,
    val pending: Int,
    val exhausted: Int,
)

@Dao
interface TaskDao {
    @Query(
        """
        SELECT * FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
        ORDER BY
            CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
            CASE
                WHEN status IN ('completed', 'done') THEN 4
                WHEN status NOT IN ('completed', 'done') AND dueTime IS NOT NULL AND datetime(dueTime) < datetime(:nowTime) THEN 0
                WHEN dueTime IS NOT NULL THEN 1
                WHEN plannedDate IS NOT NULL THEN 2
                ELSE 3
            END,
            CASE WHEN status IN ('completed', 'done') THEN datetime(COALESCE(completedAt, updatedAt, dueTime, plannedDate)) END DESC,
            CASE WHEN status NOT IN ('completed', 'done') AND dueTime IS NULL THEN 1 ELSE 0 END,
            CASE WHEN status NOT IN ('completed', 'done') THEN dueTime END ASC,
            CASE WHEN status NOT IN ('completed', 'done') THEN plannedDate END ASC,
            sortOrder ASC,
            priority DESC,
            updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeActiveTasks(workspaceId: String, limit: Int, nowTime: String): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 1
        ORDER BY updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeDeletedTasks(workspaceId: String, limit: Int): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
          AND (
              (dueTime IS NOT NULL AND datetime(dueTime) >= datetime(:startTime) AND datetime(dueTime) < datetime(:endTime))
              OR (remindTime IS NOT NULL AND datetime(remindTime) >= datetime(:startTime) AND datetime(remindTime) < datetime(:endTime))
              OR plannedDate = :today
              OR listType = 'today'
              OR (status NOT IN ('completed', 'done') AND dueTime IS NOT NULL AND datetime(dueTime) < datetime(:nowTime))
        )
        ORDER BY
            CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
            CASE
                WHEN status IN ('completed', 'done') THEN 4
                WHEN status NOT IN ('completed', 'done') AND dueTime IS NOT NULL AND datetime(dueTime) < datetime(:nowTime) THEN 0
                WHEN dueTime IS NOT NULL THEN 1
                WHEN listType = 'today' THEN 2
                WHEN plannedDate IS NOT NULL THEN 2
                ELSE 3
            END,
            CASE WHEN status IN ('completed', 'done') THEN datetime(COALESCE(completedAt, updatedAt, dueTime, plannedDate)) END DESC,
            CASE WHEN status NOT IN ('completed', 'done') THEN dueTime END ASC,
            CASE WHEN status NOT IN ('completed', 'done') THEN plannedDate END ASC,
            sortOrder ASC,
            priority DESC,
            updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeTodayTasks(
        workspaceId: String,
        today: String,
        startTime: String,
        endTime: String,
        nowTime: String,
        limit: Int,
    ): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
          AND (
              title LIKE '%' || :keyword || '%'
              OR content LIKE '%' || :keyword || '%'
              OR tag LIKE '%' || :keyword || '%'
              OR project LIKE '%' || :keyword || '%'
        )
        ORDER BY sortOrder ASC, updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeSearchTasks(workspaceId: String, keyword: String, limit: Int): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE workspaceId = :workspaceId AND localId = :localId LIMIT 1")
    suspend fun getByLocalId(workspaceId: String, localId: String): TaskEntity?

    @Query(
        """
        SELECT * FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
        ORDER BY updatedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getBackupTasks(workspaceId: String, limit: Int): List<TaskEntity>

    @Query(
        "SELECT * FROM tasks WHERE workspaceId = :workspaceId " +
            "ORDER BY updatedAt DESC LIMIT :limit",
    )
    suspend fun getTasksForReminderRebuild(workspaceId: String, limit: Int): List<TaskEntity>

    @Query(
        """
        SELECT localId, title, status, priority, dueTime, remindTime, plannedDate, completedAt, sortOrder, updatedAt FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
          AND (
              (dueTime IS NOT NULL AND datetime(dueTime) >= datetime(:startTime) AND datetime(dueTime) < datetime(:endTime))
              OR (remindTime IS NOT NULL AND datetime(remindTime) >= datetime(:startTime) AND datetime(remindTime) < datetime(:endTime))
              OR plannedDate = :today
              OR listType = 'today'
              OR (status NOT IN ('completed', 'done') AND dueTime IS NOT NULL AND datetime(dueTime) < datetime(:nowTime))
          )
        ORDER BY
            CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
            CASE
                WHEN status IN ('completed', 'done') THEN 4
                WHEN status NOT IN ('completed', 'done') AND dueTime IS NOT NULL AND datetime(dueTime) < datetime(:nowTime) THEN 0
                WHEN dueTime IS NOT NULL AND datetime(dueTime) >= datetime(:startTime) AND datetime(dueTime) < datetime(:endTime) THEN 0
                WHEN remindTime IS NOT NULL AND datetime(remindTime) >= datetime(:startTime) AND datetime(remindTime) < datetime(:endTime) THEN 1
                WHEN listType = 'today' THEN 2
                WHEN plannedDate = :today THEN 2
                ELSE 3
            END,
            CASE WHEN status IN ('completed', 'done') THEN datetime(COALESCE(completedAt, updatedAt, dueTime, plannedDate)) END DESC,
            CASE WHEN status NOT IN ('completed', 'done') AND dueTime IS NULL THEN 1 ELSE 0 END,
            CASE WHEN status NOT IN ('completed', 'done') THEN dueTime END ASC,
            priority DESC,
            updatedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getTodayWidgetTasks(
        workspaceId: String,
        today: String,
        startTime: String,
        endTime: String,
        nowTime: String,
        limit: Int,
    ): List<TodayWidgetTaskProjection>

    @Query(
        """
        SELECT localId, title, status, priority, dueTime, remindTime, plannedDate, completedAt, sortOrder, updatedAt FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
        ORDER BY
            CASE WHEN status IN ('completed', 'done') THEN 1 ELSE 0 END,
            CASE
                WHEN status IN ('completed', 'done') THEN 4
                WHEN status NOT IN ('completed', 'done') AND dueTime IS NOT NULL AND datetime(dueTime) < datetime(:nowTime) THEN 0
                WHEN dueTime IS NOT NULL THEN 1
                WHEN plannedDate IS NOT NULL THEN 2
                ELSE 3
            END,
            CASE WHEN status IN ('completed', 'done') THEN datetime(COALESCE(completedAt, updatedAt, dueTime, plannedDate)) END DESC,
            CASE WHEN status NOT IN ('completed', 'done') AND dueTime IS NULL THEN 1 ELSE 0 END,
            CASE WHEN status NOT IN ('completed', 'done') THEN dueTime END ASC,
            CASE WHEN status NOT IN ('completed', 'done') THEN plannedDate END ASC,
            sortOrder ASC,
            priority DESC,
            updatedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getAllWidgetTasks(workspaceId: String, limit: Int, nowTime: String): List<TodayWidgetTaskProjection>

    @Query("SELECT * FROM tasks WHERE workspaceId = :workspaceId AND serverId IN (:serverIds)")
    suspend fun getByServerIds(workspaceId: String, serverIds: List<Int>): List<TaskEntity>

    @Query("SELECT * FROM tasks WHERE workspaceId = :workspaceId AND syncStatus != 'synced'")
    suspend fun getPendingTasks(workspaceId: String): List<TaskEntity>

    @Query(
        """
        SELECT COUNT(*) FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
          AND syncStatus = 'conflict'
        """,
    )
    suspend fun countConflictTasks(workspaceId: String): Int

    @Query(
        """
        SELECT COUNT(*) FROM tasks
        WHERE workspaceId = :workspaceId
          AND isDeleted = 0
          AND syncStatus = 'sync_failed'
        """,
    )
    suspend fun countFailedSyncTasks(workspaceId: String): Int

    @Upsert
    suspend fun upsert(task: TaskEntity)

    @Upsert
    suspend fun upsertAll(tasks: List<TaskEntity>)

    @Query(
        """
        UPDATE tasks
        SET serverId = COALESCE(:serverId, serverId),
            version = :version,
            syncStatus = 'synced',
            conflictServerJson = NULL,
            conflictLocalJson = NULL,
            updatedAt = :updatedAt,
            lastSyncAt = :syncedAt
        WHERE workspaceId = :workspaceId AND localId = :localId
        """,
    )
    suspend fun markSynced(
        workspaceId: String,
        localId: String,
        serverId: Int?,
        version: Int,
        updatedAt: String,
        syncedAt: String,
    )

    @Query("UPDATE tasks SET syncStatus = :syncStatus WHERE workspaceId = :workspaceId AND localId = :localId")
    suspend fun updateSyncStatus(workspaceId: String, localId: String, syncStatus: String)

    @Query("DELETE FROM tasks WHERE workspaceId = :workspaceId AND localId = :localId")
    suspend fun deleteByLocalId(workspaceId: String, localId: String)

    @Query("DELETE FROM tasks WHERE workspaceId = :workspaceId")
    suspend fun deleteAllForWorkspace(workspaceId: String)

    @Query(
        "UPDATE OR IGNORE tasks SET workspaceId = :workspaceId, ownerUserId = :ownerUserId " +
            "WHERE workspaceId = :legacyWorkspaceId",
    )
    suspend fun claimLegacyWorkspace(legacyWorkspaceId: String, workspaceId: String, ownerUserId: String): Int
}

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue WHERE workspaceId = :workspaceId AND attemptCount < 8 ORDER BY attemptCount ASC, id ASC LIMIT :limit")
    suspend fun pendingChanges(workspaceId: String, limit: Int): List<SyncQueueEntity>

    @Query(
        """
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN attemptCount < 8 THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN attemptCount >= 8 THEN 1 ELSE 0 END), 0) AS exhausted
        FROM sync_queue
        WHERE workspaceId = :workspaceId
        """,
    )
    suspend fun queueCounts(workspaceId: String): SyncQueueCounts

    @Query("SELECT * FROM sync_queue WHERE workspaceId = :workspaceId AND attemptCount >= 8 ORDER BY attemptCount DESC, id ASC LIMIT :limit")
    suspend fun exhaustedChanges(workspaceId: String, limit: Int): List<SyncQueueEntity>

    @Query("UPDATE sync_queue SET attemptCount = 0 WHERE workspaceId = :workspaceId AND attemptCount >= 8")
    suspend fun resetExhaustedAttempts(workspaceId: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(change: SyncQueueEntity): Long

    @Query("DELETE FROM sync_queue WHERE workspaceId = :workspaceId AND id = :id")
    suspend fun deleteById(workspaceId: String, id: Long)

    @Query("DELETE FROM sync_queue WHERE workspaceId = :workspaceId AND localId = :localId")
    suspend fun deleteByLocalId(workspaceId: String, localId: String)

    @Query("DELETE FROM sync_queue WHERE workspaceId = :workspaceId")
    suspend fun deleteAllForWorkspace(workspaceId: String)

    @Delete
    suspend fun delete(change: SyncQueueEntity)

    @Query("UPDATE sync_queue SET attemptCount = attemptCount + 1 WHERE workspaceId = :workspaceId AND id = :id")
    suspend fun incrementAttempt(workspaceId: String, id: Long)

    @Query(
        "UPDATE sync_queue SET workspaceId = :workspaceId, ownerUserId = :ownerUserId " +
            "WHERE workspaceId = :legacyWorkspaceId " +
            "AND EXISTS (SELECT 1 FROM tasks WHERE tasks.workspaceId = :workspaceId " +
            "AND tasks.localId = sync_queue.localId)",
    )
    suspend fun claimLegacyWorkspace(legacyWorkspaceId: String, workspaceId: String, ownerUserId: String): Int
}
