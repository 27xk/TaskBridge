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
)

@Dao
interface TaskDao {
    @Query(
        """
        SELECT * FROM tasks
        WHERE isDeleted = 0
        ORDER BY
            CASE WHEN dueTime IS NULL THEN 1 ELSE 0 END,
            dueTime ASC,
            updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeActiveTasks(limit: Int): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE isDeleted = 0
          AND (
              (dueTime IS NOT NULL AND datetime(dueTime) >= datetime(:startTime) AND datetime(dueTime) < datetime(:endTime))
              OR (remindTime IS NOT NULL AND datetime(remindTime) >= datetime(:startTime) AND datetime(remindTime) < datetime(:endTime))
              OR plannedDate = :today
        )
        ORDER BY sortOrder ASC, dueTime ASC, updatedAt DESC
        LIMIT :limit
        """,
    )
    fun observeTodayTasks(
        today: String,
        startTime: String,
        endTime: String,
        limit: Int,
    ): Flow<List<TaskEntity>>

    @Query(
        """
        SELECT * FROM tasks
        WHERE isDeleted = 0
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
    fun observeSearchTasks(keyword: String, limit: Int): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE localId = :localId LIMIT 1")
    suspend fun getByLocalId(localId: String): TaskEntity?

    @Query(
        """
        SELECT localId, title, status, priority, dueTime, remindTime, plannedDate FROM tasks
        WHERE isDeleted = 0
          AND (
              (dueTime IS NOT NULL AND datetime(dueTime) >= datetime(:startTime) AND datetime(dueTime) < datetime(:endTime))
              OR (remindTime IS NOT NULL AND datetime(remindTime) >= datetime(:startTime) AND datetime(remindTime) < datetime(:endTime))
              OR plannedDate = :today
              OR (status = 'todo' AND priority >= :highPriority)
          )
        ORDER BY
            CASE
                WHEN dueTime IS NOT NULL AND datetime(dueTime) >= datetime(:startTime) AND datetime(dueTime) < datetime(:endTime) THEN 0
                WHEN remindTime IS NOT NULL AND datetime(remindTime) >= datetime(:startTime) AND datetime(remindTime) < datetime(:endTime) THEN 1
                WHEN plannedDate = :today THEN 2
                ELSE 3
            END,
            CASE WHEN dueTime IS NULL THEN 1 ELSE 0 END,
            dueTime ASC,
            priority DESC,
            updatedAt DESC
        LIMIT :limit
        """,
    )
    suspend fun getTodayWidgetTasks(
        today: String,
        startTime: String,
        endTime: String,
        highPriority: Int,
        limit: Int,
    ): List<TodayWidgetTaskProjection>

    @Query("SELECT * FROM tasks WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): TaskEntity?

    @Query("SELECT * FROM tasks WHERE syncStatus != 'synced'")
    suspend fun getPendingTasks(): List<TaskEntity>

    @Upsert
    suspend fun upsert(task: TaskEntity)

    @Upsert
    suspend fun upsertAll(tasks: List<TaskEntity>)

    @Query(
        """
        UPDATE tasks
        SET serverId = :serverId,
            version = :version,
            syncStatus = 'synced',
            updatedAt = :updatedAt,
            lastSyncAt = :syncedAt
        WHERE localId = :localId
        """,
    )
    suspend fun markSynced(
        localId: String,
        serverId: Int?,
        version: Int,
        updatedAt: String,
        syncedAt: String,
    )

    @Query("UPDATE tasks SET syncStatus = :syncStatus WHERE localId = :localId")
    suspend fun updateSyncStatus(localId: String, syncStatus: String)
}

@Dao
interface SyncQueueDao {
    @Query("SELECT * FROM sync_queue ORDER BY id ASC LIMIT :limit")
    suspend fun pendingChanges(limit: Int): List<SyncQueueEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(change: SyncQueueEntity): Long

    @Query("DELETE FROM sync_queue WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM sync_queue WHERE localId = :localId")
    suspend fun deleteByLocalId(localId: String)

    @Delete
    suspend fun delete(change: SyncQueueEntity)

    @Query("UPDATE sync_queue SET attemptCount = attemptCount + 1 WHERE id = :id")
    suspend fun incrementAttempt(id: Long)
}
