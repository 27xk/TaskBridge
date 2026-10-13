package com.taskbridge.app.notification

private val reminderRebuildActions = setOf(
    "android.intent.action.BOOT_COMPLETED",
    "android.intent.action.MY_PACKAGE_REPLACED",
    "android.intent.action.TIME_SET",
    "android.intent.action.TIMEZONE_CHANGED",
)

fun reminderTrigger(
    remindTime: String?,
    dueTime: String?,
    snoozedUntil: String? = null,
    now: java.time.Instant = java.time.Instant.now(),
): String? {
    val snooze = snoozedUntil?.takeIf { it.isNotBlank() }?.let { value ->
        runCatching { java.time.Instant.parse(value) }.getOrNull()
    }
    if (snooze != null && snooze.isAfter(now)) return snoozedUntil
    return remindTime?.takeIf { it.isNotBlank() } ?: dueTime?.takeIf { it.isNotBlank() }
}

fun shouldRequestReminderPermission(remindTime: String?, dueTime: String?): Boolean {
    return reminderTrigger(remindTime, dueTime) != null
}

fun isReminderRebuildAction(action: String?): Boolean = action in reminderRebuildActions
