package com.taskbridge.app.notification

import org.junit.Assert.assertEquals
import org.junit.Test

class ReminderPolicyTest {
    @Test
    fun explicitReminderWinsAndDueTimeIsTheFallback() {
        assertEquals("2026-07-15T08:00:00Z", reminderTrigger("2026-07-15T08:00:00Z", "2026-07-15T09:00:00Z"))
        assertEquals("2026-07-15T09:00:00Z", reminderTrigger(null, "2026-07-15T09:00:00Z"))
        assertEquals(null, reminderTrigger(null, null))
    }

    @Test
    fun dueOnlyTasksStillNeedNotificationPermission() {
        check(shouldRequestReminderPermission(remindTime = "", dueTime = "2026-07-15 09:00"))
        check(shouldRequestReminderPermission(remindTime = "2026-07-15 08:00", dueTime = ""))
        check(!shouldRequestReminderPermission(remindTime = "", dueTime = ""))
    }

    @Test
    fun systemClockAndPackageEventsRequireReminderRebuild() {
        val rebuildActions = setOf(
            "android.intent.action.BOOT_COMPLETED",
            "android.intent.action.MY_PACKAGE_REPLACED",
            "android.intent.action.TIME_SET",
            "android.intent.action.TIMEZONE_CHANGED",
        )

        rebuildActions.forEach { check(isReminderRebuildAction(it)) }
        check(!isReminderRebuildAction("android.intent.action.SCREEN_ON"))
    }
}
