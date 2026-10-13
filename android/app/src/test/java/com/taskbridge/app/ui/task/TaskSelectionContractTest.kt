package com.taskbridge.app.ui.task

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskSelectionContractTest {
    @Test
    fun ordinaryOpenTasksExposeLongPressAndMenuSelectionEntryPoints() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt")
        val selectionMenu = source
            .substringAfter("if (selectionEnabled) {")
            .substringBefore("HorizontalDivider()")

        assertTrue(source.contains("combinedClickable("))
        assertTrue(source.contains("onLongClick = onEnterSelection"))
        assertTrue(source.contains("onEnterSelection ="))
        assertTrue(selectionMenu.contains("DropdownMenuItem("))
        assertTrue(selectionMenu.contains("Text(selectionLabel)"))
        assertTrue(selectionMenu.contains("onEnterSelection()"))
    }

    @Test
    fun ordinaryTaskSelectionUsesAStableBatchActionBarAndClearsAfterActions() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt")
        val beforeList = source.substringBefore("LazyColumn(")

        assertTrue(beforeList.contains("OpenTaskSelectionActionBar("))
        assertTrue(source.contains("onSelectAllVisible ="))
        assertTrue(source.contains("viewModel.batchComplete(selectedIds)"))
        assertTrue(source.contains("DeleteSelectedTasksConfirmationDialog("))
        assertTrue(source.contains("viewModel.batchDelete(selected.map { it.localId })"))
        assertTrue(source.contains("clearOpenTaskSelection()"))
    }

    @Test
    fun recycleBinBatchActionsRemainAvailable() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt")

        assertTrue(source.contains("TrashBatchActionBar("))
        assertTrue(source.contains("viewModel.batchRestoreDeleted(selectedIds)"))
        assertTrue(source.contains("viewModel.batchPurgeDeleted(selected.map { it.localId })"))
        assertFalse(source.contains("if (isTrashFilter) return@TaskListScreen"))
    }
}
