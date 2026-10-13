package com.taskbridge.app.ui.task

import org.junit.Assert.assertEquals
import org.junit.Test

class TaskSelectionPolicyTest {
    @Test
    fun togglingSelectionAddsAndRemovesOneOpenTask() {
        val selected = toggleOpenTaskSelection(emptySet(), "task-a")

        assertEquals(setOf("task-a"), selected)
        assertEquals(emptySet<String>(), toggleOpenTaskSelection(selected, "task-a"))
    }

    @Test
    fun selectAllUsesDistinctCurrentVisibleOpenTasks() {
        assertEquals(
            setOf("task-a", "task-b"),
            selectAllVisibleOpenTasks(listOf("task-b", "task-a", "task-b")),
        )
    }

    @Test
    fun selectionDropsTasksThatAreNoLongerVisible() {
        assertEquals(
            setOf("task-b"),
            retainVisibleOpenTaskSelection(
                selectedIds = setOf("task-a", "task-b"),
                visibleOpenTaskIds = listOf("task-b", "task-c"),
            ),
        )
    }

    @Test
    fun selectedTaskAccessibilityLabelDescribesUnselecting() {
        assertEquals(
            "Unselect task: Write launch notes",
            taskSelectionAccessibilityLabel(
                taskTitle = "Write launch notes",
                languageCode = "en-US",
                selected = true,
            ),
        )
    }

    @Test
    fun batchDeleteConfirmationExplainsRecycleBinRecovery() {
        assertEquals(
            "Delete 2 selected tasks? You can restore them from the recycle bin.",
            getDeleteSelectedConfirmationMessage(count = 2, languageCode = "en-US"),
        )
        assertEquals(
            "确认删除所选的 2 个任务？删除后可以在回收站恢复。",
            getDeleteSelectedConfirmationMessage(count = 2, languageCode = "zh-CN"),
        )
    }
}
