package com.taskbridge.app.notification

private val reminderRebuildActions = setOf(
    "android.intent.action.BOOT_COMPLETED",
    "android.intent.action.MY_PACKAGE_REPLACED",
    "android.intent.action.TIME_SET",
    "android.intent.action.TIMEZONE_CHANGED",
)

fun reminderTrigger(remindTime: String?, dueTime: String?): String? {
    return remindTime?.takeIf { it.isNotBlank() } ?: dueTime?.takeIf { it.isNotBlank() }
}

fun shouldRequestReminderPermission(remindTime: String?, dueTime: String?): Boolean {
    return reminderTrigger(remindTime, dueTime) != null
}

fun isReminderRebuildAction(action: String?): Boolean = action in reminderRebuildActions
