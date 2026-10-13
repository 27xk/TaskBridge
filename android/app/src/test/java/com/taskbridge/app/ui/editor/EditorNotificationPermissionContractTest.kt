package com.taskbridge.app.ui.editor

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EditorNotificationPermissionContractTest {
    @Test
    fun duePickerDoesNotRequestNotificationPermission() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/editor/EditorScreen.kt")
        val duePicker = source.substringAfter("fun pickDueTime()").substringBefore("fun pickReminder()")

        assertFalse(duePicker.contains("onRequestNotificationPermission()"))
    }

    @Test
    fun reminderPickerDefersPermissionUntilTheUserChoosesATime() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/editor/EditorScreen.kt")
        val reminderPicker = source.substringAfter("fun pickReminder()").substringBefore("fun requestCancel()")
        val saveAction = source.substringAfter("onSave = {").substringBefore("viewModel.save(onSaved)")

        val beforePicker = reminderPicker.substringBefore("showDateTimePicker(")
        assertFalse(beforePicker.contains("onRequestNotificationPermission()"))
        assertTrue(reminderPicker.contains("onPicked = { value ->"))
        assertTrue(reminderPicker.contains("viewModel.updateRemindTime(value)"))
        assertTrue(reminderPicker.contains("onRequestNotificationPermission()"))
        assertTrue(saveAction.contains("shouldRequestReminderPermission(state.remindTime, state.dueTime)"))
        assertTrue(saveAction.contains("onRequestNotificationPermission()"))
    }
}
