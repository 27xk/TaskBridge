package com.taskbridge.app.notification

import com.taskbridge.app.data.local.ReminderTaskProjection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ReminderChangesTest {
    private val now = Instant.parse("2026-10-10T00:00:00Z")
    private val trigger = Instant.parse("2026-10-11T00:00:00Z").toEpochMilli()

    @Test
    fun unchangedTasksDoNotRecreateAlarms() {
        val diff = reminderChanges(mapOf("one" to trigger), listOf(task("one")), setOf("one"), now)
        assertTrue(diff.schedule.isEmpty())
        assertTrue(diff.cancel.isEmpty())
    }

    @Test
    fun completionRemoteDeletionAndRemovedRowsCancelOnlyTheirAlarms() {
        val before = mapOf("done" to trigger, "deleted" to trigger, "purged" to trigger, "untouched" to trigger)
        val diff = reminderChanges(before, listOf(task("done").copy(status = "completed"), task("deleted").copy(isDeleted = true)), setOf("done", "deleted", "purged"), now)
        assertEquals(setOf("done", "deleted", "purged"), diff.cancel)
        assertEquals(mapOf("untouched" to trigger), diff.next)
    }

    @Test
    fun rescheduledAndSnoozedTasksUseTheNewTrigger() {
        val snooze = "2026-10-12T00:00:00Z"
        val diff = reminderChanges(mapOf("one" to trigger), listOf(task("one").copy(snoozedUntil = snooze)), setOf("one"), now)
        assertEquals(mapOf("one" to Instant.parse(snooze).toEpochMilli()), diff.schedule)
    }

    private fun task(id: String) = ReminderTaskProjection(id, "todo", false, "2026-10-11T00:00:00Z", null, null)
}
