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
        WHERE ownerUserId = :ownerUserId
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
    fun observeActiveTasks(ownerUserId: String, limit: Int, nowTime: String): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE ownerUserId = :ownerUserId
          AND isDeleted = 1
        ORDER BY updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeDeletedTasks(ownerUserId: String, limit: Int): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE ownerUserId = :ownerUserId
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
        ownerUserId: String,
        today: String,
        startTime: String,
        endTime: String,
        nowTime: String,
        limit: Int,
    ): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE ownerUserId = :ownerUserId
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
    fun observeSearchTasks(ownerUserId: String, keyword: String, limit: Int): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE ownerUserId = :ownerUserId AND localId = :localId LIMIT 1")
    suspend fun getByLocalId(ownerUserId: String, localId: String): TaskEntity?

    @Query(
        """
        SELECT * FROM tasks
        WHERE ownerUserId = :ownerUserId
          AND isDeleted = 0
        ORDER BY updatedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getBackupTasks(ownerUserId: String, limit: Int): List<TaskEntity>

    @Query(
        """
        SELECT localId, title, status, priority, dueTime, remindTime, plannedDate, completedAt, sortOrder, updatedAt FROM tasks
        WHERE ownerUserId = :ownerUserId
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
        ownerUserId: String,
        today: String,
        startTime: String,
        endTime: String,
        nowTime: String,
        limit: Int,
    ): List<TodayWidgetTaskProjection>

    @Query(
        """
        SELECT localId, title, status, priority, dueTime, remindTime, plannedDate, completedAt, sortOrder, updatedAt FROM tasks
        WHERE ownerUserId = :ownerUserId
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
    suspend fun getAllWidgetTasks(ownerUserId: String, limit: Int, nowTime: String): List<TodayWidgetTaskProjection>

    @Query("SELECT * FROM tasks WHERE ownerUserId = :ownerUserId AND serverId IN (:serverIds)")
    suspend fun getByServerIds(ownerUserId: String, serverIds: List<Int>): List<TaskEntity>

    @Query("SELECT * FROM tasks WHERE ownerUserId = :ownerUserId AND syncStatus != 'synced'")
    suspend fun getPendingTasks(ownerUserId: String): List<TaskEntity>

    @Query(
        """
        SELECT COUNT(*) FROM tasks
        WHERE ownerUserId = :ownerUserId
          AND isDeleted = 0
          AND syncStatus = 'conflict'
        """,
    )
    suspend fun countConflictTasks(ownerUserId: String): Int

    @Query(
        """
        SELECT COUNT(*) FROM tasks
        WHERE ownerUserId = :ownerUserId
          AND isDeleted = 0
          AND syncStatus = 'sync_failed'
        """,
    )
    suspend fun countFailedSyncTasks(ownerUserId: String): Int

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
        WHERE ownerUserId = :ownerUserId AND localId = :localId
        """,
    )
    suspend fun markSynced(
        ownerUserId: String,
        localId: String,
        serverId: Int?,
        version: Int,
        updatedAt: String,
        syncedAt: String,
    )

    @Query("UPDATE tasks SET syncStatus = :syncStatus WHERE ownerUserId = :ownerUserId AND localId = :localId")
    suspend fun updateSyncStatus(ownerUserId: String, localId: String, syncStatus: String)

    @Query("DELETE FROM tasks WHERE ownerUserId = :ownerUserId AND localId = :localId")
    suspend fun deleteByLocalId(ownerUserId: String, localId: String)

    @Query("DELETE FROM tasks WHERE ownerUserId = :ownerUserId")
    suspend fun deleteAllForOwner(ownerUserId: String)
}

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue WHERE ownerUserId = :ownerUserId AND attemptCount < 8 ORDER BY attemptCount ASC, id ASC LIMIT :limit")
    suspend fun pendingChanges(ownerUserId: String, limit: Int): List<SyncQueueEntity>

    @Query(
        """
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN attemptCount < 8 THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN attemptCount >= 8 THEN 1 ELSE 0 END), 0) AS exhausted
        FROM sync_queue
        WHERE ownerUserId = :ownerUserId
        """,
    )
    suspend fun queueCounts(ownerUserId: String): SyncQueueCounts

    @Query("SELECT * FROM sync_queue WHERE ownerUserId = :ownerUserId AND attemptCount >= 8 ORDER BY attemptCount DESC, id ASC LIMIT :limit")
    suspend fun exhaustedChanges(ownerUserId: String, limit: Int): List<SyncQueueEntity>

    @Query("UPDATE sync_queue SET attemptCount = 0 WHERE ownerUserId = :ownerUserId AND attemptCount >= 8")
    suspend fun resetExhaustedAttempts(ownerUserId: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(change: SyncQueueEntity): Long

    @Query("DELETE FROM sync_queue WHERE ownerUserId = :ownerUserId AND id = :id")
    suspend fun deleteById(ownerUserId: String, id: Long)

    @Query("DELETE FROM sync_queue WHERE ownerUserId = :ownerUserId AND localId = :localId")
    suspend fun deleteByLocalId(ownerUserId: String, localId: String)

    @Query("DELETE FROM sync_queue WHERE ownerUserId = :ownerUserId")
    suspend fun deleteAllForOwner(ownerUserId: String)

    @Delete
    suspend fun delete(change: SyncQueueEntity)

    @Query("UPDATE sync_queue SET attemptCount = attemptCount + 1 WHERE ownerUserId = :ownerUserId AND id = :id")
    suspend fun incrementAttempt(ownerUserId: String, id: Long)
}
