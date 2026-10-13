package com.taskbridge.app.data

import android.app.Application
import androidx.room.Room
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.data.local.TaskListDataSource
import com.taskbridge.app.domain.model.TaskListQuery
import com.taskbridge.app.domain.model.TaskFilter
import com.taskbridge.app.fixtures.SharedTimelineFixtures
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class TaskPagingBehaviorTest {
    private lateinit var database: AppDatabase
    private lateinit var source: TaskListDataSource
    private val now = Instant.parse("2026-10-10T04:00:00Z")

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(RuntimeEnvironment.getApplication(), AppDatabase::class.java).build()
        source = TaskListDataSource(database)
    }

    @After
    fun tearDown() = database.close()

    @Test
    fun searchFindsTheOldestOf5001TasksAndEveryUnfilteredPageIsReachable() = runBlocking {
        database.taskDao().upsertAll((1..5_001).map { number ->
            task("task-$number").copy(
                title = if (number == 5_001) "UniqueNeedle5001" else "Task $number",
                sortOrder = number,
                dueTime = "2030-01-01T00:00:00Z",
                content = if (number == 5_001) "body-only-needle" else "Long body ".repeat(400),
            )
        })
        val query = TaskListQuery(now = now, keyword = "UniqueNeedle5001")
        assertEquals(5_001, database.taskDao().getReminderCandidates("workspace").size)
        val search = source.observe("workspace", query).first()
        assertEquals(1, search.total)
        assertEquals("task-5001", search.tasks.single().localId)
        assertNull(search.tasks.single().content)
        assertEquals("body-only-needle", database.taskDao().getByLocalId("workspace", "task-5001")?.content)
        assertEquals(1, source.observe("workspace", query.copy(keyword = "body-only-needle")).first().total)

        val ids = mutableSetOf<String>()
        var offset = 0
        do {
            val page = source.observe("workspace", query.copy(keyword = "", offset = offset)).first()
            assertEquals(5_001, page.total)
            assertTrue(page.tasks.size <= query.pageSize)
            assertTrue(page.tasks.none { it.localId in ids })
            ids += page.tasks.map { it.localId }
            offset += query.pageSize
        } while (offset < 5_001)
        assertEquals(5_001, ids.size)
    }

    @Test
    fun filtersApplyBeforePaginationAndAggregateAllWorkspaceStatuses() = runBlocking {
        database.taskDao().upsertAll(
            (1..220).map { task("ordinary-$it") } + listOf(
                task("conflict").copy(syncStatus = "conflict", sortOrder = 900),
                task("deleted").copy(isDeleted = true, syncStatus = "pending_delete"),
                task("completed").copy(status = "done"),
                task("other-workspace").copy(workspaceId = "other", syncStatus = "sync_failed"),
            ),
        )
        val conflict = source.observe("workspace", TaskListQuery(now = now, filter = TaskFilter.Conflict)).first()
        assertEquals(listOf("conflict"), conflict.tasks.map { it.localId })
        assertEquals(1, conflict.syncCounts.errors)
        assertEquals(1, conflict.syncCounts.pending)
        val trash = source.observe("workspace", TaskListQuery(now = now, filter = TaskFilter.Trash)).first()
        assertEquals(listOf("deleted"), trash.tasks.map { it.localId })
        assertEquals(222, source.observe("workspace", TaskListQuery(now = now)).first().total)
    }

    @Test
    fun sqlTimelineOrderMatchesTheSharedFixtureAndRespectsSnoozes() = runBlocking {
        val fixture = SharedTimelineFixtures.load()
        database.taskDao().upsertAll(fixture.tasks.map { item ->
            task(item.id).copy(
                status = item.status, priority = item.priority, dueTime = item.dueTime,
                plannedDate = item.plannedDate, completedAt = item.completedAt,
                sortOrder = item.sortOrder, updatedAt = item.updatedAt,
            )
        })
        val page = source.observe("workspace", TaskListQuery(now = Instant.parse(fixture.now), displayTimeZone = fixture.displayTimeZone)).first()
        assertEquals(fixture.expectedOrder, page.tasks.map { it.localId })
        database.taskDao().deleteAllForWorkspace("workspace")
        database.taskDao().upsertAll(listOf(
            task("snoozed").copy(dueTime = "2026-10-09T00:00:00Z", snoozedUntil = "2026-10-11T00:00:00Z"),
            task("overdue").copy(dueTime = "2026-10-09T00:00:00Z"),
        ))
        assertEquals(listOf("overdue"), source.observe("workspace", TaskListQuery(now = now, filter = TaskFilter.Overdue)).first().tasks.map { it.localId })
    }

    @Test
    fun dateBoundariesUseTheDisplayZoneAndSearchTreatsWildcardsLiterally() = runBlocking {
        database.taskDao().upsertAll(listOf(
            task("today").copy(title = "100%_done", status = "done", dueTime = "2026-10-09T17:00:00Z"),
            task("tomorrow").copy(title = "100 percent done", status = "done", dueTime = "2026-10-10T17:00:00Z"),
        ))
        val query = TaskListQuery(todayOnly = true, now = now, displayTimeZone = "Asia/Shanghai")
        assertEquals(listOf("today"), source.observe("workspace", query).first().tasks.map { it.localId })
        assertEquals(listOf("today"), source.observe("workspace", query.copy(todayOnly = false, keyword = "%_" )).first().tasks.map { it.localId })
    }

    private fun task(id: String) = TaskEntity(
        localId = id, workspaceId = "workspace", ownerUserId = "1", serverId = null,
        title = id, content = null, status = "todo", priority = 0, tag = null, project = null,
        listType = "inbox", dueTime = null, remindTime = null, repeatRule = null,
        plannedDate = null, completedAt = null, snoozedUntil = null, parentServerId = null,
        checklistJson = "[]", isTemplate = false, templateName = null, sortOrder = 0,
        version = 0, isDeleted = false, syncStatus = "synced", conflictServerJson = null,
        conflictLocalJson = null, createdAt = now.toString(), updatedAt = now.toString(), lastSyncAt = null,
    )
}
