package com.taskbridge.app.data.local

import androidx.room.withTransaction
import androidx.sqlite.db.SimpleSQLiteQuery
import com.taskbridge.app.domain.model.TaskFilter
import com.taskbridge.app.domain.model.TaskListPage
import com.taskbridge.app.domain.model.TaskListQuery
import com.taskbridge.app.data.repository.toDomain
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map

data class TaskListCounts(val total: Int, val completed: Int, val overdue: Int)

/** A single observed view, with a bounded page and counts from the same database snapshot. */
class TaskListDataSource(private val database: AppDatabase) {
    fun observe(workspaceId: String, query: TaskListQuery): Flow<TaskListPage> {
        val dao = database.taskDao()
        val sql = TaskListSql(workspaceId, query)
        return dao.observeWorkspaceTaskInvalidations(workspaceId).map {
            database.withTransaction {
                val counts = dao.getTaskListCounts(sql.counts())
                val lastPageOffset = ((counts.total - 1).coerceAtLeast(0) / query.pageSize) * query.pageSize
                val offset = query.offset.coerceAtMost(lastPageOffset)
                TaskListPage(
                    tasks = dao.getTaskPage(sql.page(offset)).map { it.toDomain() },
                    total = counts.total,
                    completed = counts.completed,
                    overdue = counts.overdue,
                    offset = offset,
                    pageSize = query.pageSize,
                    syncCounts = dao.getTaskSyncCounts(workspaceId),
                )
            }
        }.flowOn(Dispatchers.IO)
    }
}

private class TaskListSql(workspaceId: String, private val query: TaskListQuery) {
    private val today = query.now.atZone(ShanghaiTime.zone(query.displayTimeZone)).toLocalDate()
    private val dayBounds = ShanghaiTime.dayBounds(today.toString(), query.displayTimeZone)
    private val args = mutableListOf<Any?>(
        query.now.toString(), dayBounds.first, dayBounds.second,
        today.plusDays(8).atStartOfDay(ShanghaiTime.zone(query.displayTimeZone)).toInstant().toString(),
        today.toString(), today.plusDays(7).toString(), workspaceId,
    )
    private val completed = "lower(status) IN ('completed', 'done')"
    private val snoozed = "COALESCE(snoozeInstant > nowInstant, 0)"
    private val overdue = "NOT ($completed) AND NOT ($snoozed) AND dueInstant < nowInstant"
    private val where = buildString {
        append(if (!query.todayOnly && query.filter == TaskFilter.Trash) "isDeleted = 1" else "isDeleted = 0")
        if (query.todayOnly) {
            append(" AND ((dueInstant >= startInstant AND dueInstant < endInstant) OR " +
                "(reminderInstant >= startInstant AND reminderInstant < endInstant) OR " +
                "plannedDate = today OR listType = 'today' OR ($overdue))")
        } else {
            append(when (query.filter) {
                TaskFilter.All, TaskFilter.Trash -> ""
                TaskFilter.Inbox -> " AND listType = 'inbox' AND NOT ($completed)"
                TaskFilter.Overdue -> " AND ($overdue)"
                TaskFilter.Week -> " AND CASE WHEN plannedInstant IS NOT NULL THEN plannedDate >= today AND plannedDate <= weekLastDay ELSE dueInstant >= startInstant AND dueInstant < weekEndInstant END"
                TaskFilter.HighPriority -> " AND NOT ($completed) AND priority >= 3"
                TaskFilter.Completed -> " AND ($completed)"
                TaskFilter.PendingSync -> " AND syncStatus IN ('pending_create', 'pending_update', 'pending_delete', 'sync_failed', 'conflict')"
                TaskFilter.Conflict -> " AND syncStatus = 'conflict'"
                TaskFilter.Templates -> " AND isTemplate = 1"
            })
        }
        query.keyword.trim().takeIf { it.isNotEmpty() }?.let { keyword ->
            val literal = "%" + keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            append(" AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tag LIKE ? ESCAPE '\\' OR project LIKE ? ESCAPE '\\')")
            repeat(4) { args += literal }
        }
    }
    private val prefix = """
        WITH context AS (
            SELECT julianday(?) nowInstant, julianday(?) startInstant, julianday(?) endInstant,
                   julianday(?) weekEndInstant, ? today, ? weekLastDay
        ), normalized AS (
            SELECT tasks.*, context.*,
                   julianday(replace(dueTime, '/', '-')) dueInstant,
                   julianday(replace(remindTime, '/', '-')) reminderInstant,
                   julianday(replace(snoozedUntil, '/', '-')) snoozeInstant,
                   CASE WHEN length(plannedDate) = 10 AND date(plannedDate, '+0 days') = plannedDate THEN julianday(plannedDate) END plannedInstant,
                   julianday(replace(completedAt, '/', '-')) completedInstant,
                   julianday(replace(updatedAt, '/', '-')) updatedInstant
            FROM tasks CROSS JOIN context WHERE workspaceId = ?
        ), visible AS (SELECT * FROM normalized WHERE $where)
    """.trimIndent()

    fun counts() = SimpleSQLiteQuery(
        "$prefix SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN $completed THEN 1 ELSE 0 END), 0) completed, " +
            "COALESCE(SUM(CASE WHEN $overdue THEN 1 ELSE 0 END), 0) overdue FROM visible",
        args.toTypedArray(),
    )

    fun page(offset: Int) = SimpleSQLiteQuery(
        // The list does not read bodies or checklists. Detail, edit and export always load the full row.
        """
        $prefix
        SELECT localId, workspaceId, ownerUserId, serverId, title, NULL AS content, status, priority,
               tag, project, listType, dueTime, remindTime, repeatRule, plannedDate, completedAt,
               snoozedUntil, parentServerId, '[]' AS checklistJson, isTemplate, templateName,
               sortOrder, version, isDeleted, syncStatus, conflictServerJson, conflictLocalJson,
               createdAt, updatedAt, lastSyncAt
        FROM visible
        ORDER BY
            CASE WHEN $completed THEN 1 ELSE 0 END,
            CASE WHEN $completed THEN 5 WHEN $snoozed THEN 3 WHEN $overdue THEN 0
                 WHEN dueInstant IS NOT NULL THEN 1 WHEN plannedInstant IS NOT NULL THEN 2 ELSE 4 END,
            COALESCE(CASE WHEN $completed THEN -COALESCE(completedInstant, updatedInstant, dueInstant, plannedInstant)
                          WHEN $snoozed THEN snoozeInstant ELSE COALESCE(dueInstant, plannedInstant) END, 9e99),
            sortOrder ASC, priority DESC, updatedInstant DESC, localId ASC
        LIMIT ? OFFSET ?
        """.trimIndent(),
        (args + query.pageSize + offset).toTypedArray(),
    )
}
