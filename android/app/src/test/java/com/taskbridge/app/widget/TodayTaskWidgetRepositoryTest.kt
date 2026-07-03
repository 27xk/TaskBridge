package com.taskbridge.app.widget

import com.taskbridge.app.data.local.TodayWidgetTaskProjection
import com.taskbridge.app.fixtures.SharedTimelineFixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class TodayTaskWidgetRepositoryTest {
    private val now = Instant.parse("2026-05-20T08:00:00Z")

    @Test
    fun includesDueReminderPlannedAndOverdueTasks() {
        val today = "2026-05-20"

        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(dueTime = "2026-05-20T09:00:00Z"),
                today = today,
                now = now,
            ),
        )
        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(remindTime = "2026-05-20T08:30:00Z"),
                today = today,
                now = now,
            ),
        )
        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(plannedDate = today),
                today = today,
                now = now,
            ),
        )
        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(dueTime = "2026-05-19T10:00:00Z"),
                today = today,
                now = now,
            ),
        )
    }

    @Test
    fun treatsSameDayMorningDueTimesAsUpcomingBeforeTheyPass() {
        val today = "2026-05-21"
        val earlyMorning = Instant.parse("2026-05-20T19:10:00Z")

        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(dueTime = "2026-05-21T00:00:00Z"),
                today = today,
                now = earlyMorning,
            ),
        )
        assertTrue(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(dueTime = "2026-05-21T02:00:00Z"),
                today = today,
                now = earlyMorning,
            ),
        )
    }

    @Test
    fun excludesUnscheduledOpenTasksWithoutTodayOrOverdueTime() {
        assertFalse(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(priority = 1),
                today = "2026-05-20",
                now = now,
            ),
        )
        assertFalse(
            TodayTaskWidgetRepository.isWidgetCandidate(
                task = task(priority = 3),
                today = "2026-05-20",
                now = now,
            ),
        )
    }

    @Test
    fun ordersWidgetTasksBySharedTimelineRules() {
        val tasks = listOf(
            task("done", status = "done", dueTime = "2026-05-19T09:00:00Z"),
            task("planned", plannedDate = "2026-05-20"),
            task("upcoming", dueTime = "2026-05-20T09:00:00Z"),
            task("overdue", dueTime = "2026-05-19T10:00:00Z"),
            task("high", priority = 3),
        )

        val sorted = tasks.sortedForWidget(now, "Asia/Shanghai")

        assertEquals(listOf("overdue", "upcoming", "planned", "high", "done"), sorted.map { it.localId })
    }

    @Test
    fun widgetOrderingMatchesSharedTimelineFixture() {
        val fixture = SharedTimelineFixtures.load()
        val sorted = fixture.tasks
            .map { item ->
                TodayWidgetTaskProjection(
                    localId = item.id,
                    title = item.id,
                    status = item.status,
                    priority = item.priority,
                    dueTime = item.dueTime,
                    remindTime = null,
                    plannedDate = item.plannedDate,
                    completedAt = item.completedAt,
                    sortOrder = item.sortOrder,
                    updatedAt = item.updatedAt,
                )
            }
            .sortedForWidget(Instant.parse(fixture.now), fixture.displayTimeZone)

        assertEquals(fixture.expectedOrder, sorted.map { it.localId })
    }

    private fun task(
        localId: String = "local-1",
        status: String = "todo",
        priority: Int = 0,
        dueTime: String? = null,
        remindTime: String? = null,
        plannedDate: String? = null,
    ): TodayWidgetTaskProjection {
        return TodayWidgetTaskProjection(
            localId = localId,
            title = "Task",
            status = status,
            priority = priority,
            dueTime = dueTime,
            remindTime = remindTime,
            plannedDate = plannedDate,
            completedAt = null,
            sortOrder = 0,
            updatedAt = "2026-05-19T07:00:00Z",
        )
    }
}
