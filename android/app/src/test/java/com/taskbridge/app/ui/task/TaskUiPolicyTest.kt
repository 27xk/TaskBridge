package com.taskbridge.app.ui.task

import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TaskUiPolicyTest {
    @Test
    fun deleteActionsRequireExplicitConfirmation() {
        assertEquals(true, shouldConfirmTaskAction(TaskUiAction.Delete))
    }

    @Test
    fun deleteConfirmationExplainsRecycleBin() {
        assertEquals(
            "确认删除「Write launch notes」？删除后可以在回收站恢复。",
            getDeleteConfirmationMessage("Write launch notes", "zh-CN"),
        )
        assertEquals(
            "Delete \"Write launch notes\"? You can restore it from the recycle bin.",
            getDeleteConfirmationMessage("Write launch notes", "en-US"),
        )
    }

    @Test
    fun priorityLabelsAreLocalizedForUsers() {
        assertEquals("无优先级", getTaskPriorityLabel(0, "zh-CN"))
        assertEquals("高", getTaskPriorityLabel(3, "zh-CN"))
        assertEquals("最高", getTaskPriorityLabel(5, "zh-CN"))
        assertEquals("None", getTaskPriorityLabel(0, "en-US"))
        assertEquals("High", getTaskPriorityLabel(3, "en-US"))
        assertEquals("Highest", getTaskPriorityLabel(5, "en-US"))
    }

    @Test
    fun priorityOptionsUseLocalizedLabelsInsteadOfRawNumbers() {
        assertEquals(
            listOf("0" to "无优先级", "1" to "低", "2" to "中", "3" to "高", "4" to "紧急", "5" to "最高"),
            getTaskPriorityOptions("zh-CN"),
        )
    }

    @Test
    fun repeatRuleLabelsHideRawImplementationValues() {
        assertEquals("每天", getTaskRepeatRuleLabel("daily", "zh-CN"))
        assertEquals("每周", getTaskRepeatRuleLabel("weekly", "zh-CN"))
        assertEquals("每月", getTaskRepeatRuleLabel("monthly", "zh-CN"))
        assertEquals("Daily", getTaskRepeatRuleLabel("daily", "en-US"))
        assertEquals("unknown-rule", getTaskRepeatRuleLabel("unknown-rule", "zh-CN"))
    }

    @Test
    fun listTypeLabelsHideRawImplementationValues() {
        assertEquals("收件箱", getTaskListTypeLabel("inbox", "zh-CN"))
        assertEquals("今日", getTaskListTypeLabel("today", "zh-CN"))
        assertEquals("Inbox", getTaskListTypeLabel("inbox", "en-US"))
        assertEquals("Today", getTaskListTypeLabel("today", "en-US"))
        assertEquals("custom-list", getTaskListTypeLabel("custom-list", "zh-CN"))
    }

    @Test
    fun syncStatusLabelsHideInternalWireNames() {
        assertNull(getSyncStatusLabel(SyncStatus.Synced, "zh-CN"))
        assertEquals("待同步", getSyncStatusLabel(SyncStatus.PendingCreate, "zh-CN"))
        assertEquals("待同步", getSyncStatusLabel(SyncStatus.PendingUpdate, "zh-CN"))
        assertEquals("待删除同步", getSyncStatusLabel(SyncStatus.PendingDelete, "zh-CN"))
        assertEquals("同步失败", getSyncStatusLabel(SyncStatus.Failed, "zh-CN"))
        assertEquals("同步冲突", getSyncStatusLabel(SyncStatus.Conflict, "zh-CN"))
        assertEquals("Pending sync", getSyncStatusLabel(SyncStatus.PendingCreate, "en-US"))
        assertEquals("Sync failed", getSyncStatusLabel(SyncStatus.Failed, "en-US"))
        assertEquals("Sync conflict", getSyncStatusLabel(SyncStatus.Conflict, "en-US"))
    }

    @Test
    fun taskListSyncHealthTellsUsersToContinueWhenSyncIsClean() {
        val health = taskListSyncHealthText(
            tasks = listOf(taskWithSyncStatus(SyncStatus.Synced)),
            languageCode = "zh-CN",
        )

        assertEquals(false, health.needsAttention)
        assertEquals("同步正常", health.title)
        assertEquals("当前无需处理，继续记录任务，TaskBridge 会自动同步。", health.body)
    }

    @Test
    fun pendingTasksUseAnInformationalSyncState() {
        val health = taskListSyncHealthText(
            tasks = listOf(taskWithSyncStatus(SyncStatus.PendingUpdate)),
            languageCode = "en-US",
        )

        assertEquals(false, health.needsAttention)
        assertEquals("Waiting to sync", health.title)
        assertEquals("1 task will sync automatically when a connection is available.", health.body)
    }

    @Test
    fun onlyFailedOrConflictedTasksNeedAttention() {
        val health = taskListSyncHealthText(
            tasks = listOf(
                taskWithSyncStatus(SyncStatus.PendingUpdate),
                taskWithSyncStatus(SyncStatus.Failed),
                taskWithSyncStatus(SyncStatus.Conflict),
            ),
            languageCode = "en-US",
        )

        assertEquals(true, health.needsAttention)
        assertEquals("Sync needs attention", health.title)
        assertEquals("2 tasks failed or conflicted. Open sync details to resolve them.", health.body)
    }

    @Test
    fun taskListSubtitleHidesEmptyFallbackToReduceListNoise() {
        assertNull(taskListSubtitleOrNull(""))
        assertNull(taskListSubtitleOrNull("   "))
        assertEquals("截止 2026-06-09 18:00", taskListSubtitleOrNull("截止 2026-06-09 18:00"))
    }

    @Test
    fun emptyTaskListActionOnlyAddsWhenNewTaskWillRemainVisible() {
        assertEquals(EmptyTaskListAction.AddTask, emptyTaskListAction(todayOnly = true, TaskListFilter.Completed))
        assertEquals(EmptyTaskListAction.AddTask, emptyTaskListAction(todayOnly = false, TaskListFilter.All))
        assertEquals(EmptyTaskListAction.AddTask, emptyTaskListAction(todayOnly = false, TaskListFilter.Inbox))

        assertEquals(EmptyTaskListAction.ShowAllTasks, emptyTaskListAction(todayOnly = false, TaskListFilter.Overdue))
        assertEquals(EmptyTaskListAction.ShowAllTasks, emptyTaskListAction(todayOnly = false, TaskListFilter.Completed))
        assertEquals(EmptyTaskListAction.ShowAllTasks, emptyTaskListAction(todayOnly = false, TaskListFilter.Trash))
    }

    @Test
    fun emptyTaskStateUiExplainsSearchResultsAndClearsSearch() {
        val state = emptyTaskStateUi(
            todayOnly = false,
            filter = TaskListFilter.All,
            searchQuery = "launch",
            languageCode = "en-US",
        )

        assertEquals("No matching tasks", state.title)
        assertEquals("Clear search or try: write weekly report tomorrow 3pm #work P3.", state.hint)
        assertEquals("Clear search", state.actionLabel)
        assertEquals(EmptyTaskListAction.ClearSearch, state.action)
    }

    @Test
    fun emptyTaskStateUiExplainsTrashWithoutSuggestingNewTasks() {
        val state = emptyTaskStateUi(
            todayOnly = false,
            filter = TaskListFilter.Trash,
            searchQuery = "",
            languageCode = "en-US",
        )

        assertEquals("Recycle bin is empty", state.title)
        assertEquals("Deleted tasks will appear here.", state.hint)
        assertEquals("Show all tasks", state.actionLabel)
        assertEquals(EmptyTaskListAction.ShowAllTasks, state.action)
    }

    @Test
    fun emptyTaskStateUiExplainsFilteredResultsAndClearsFilter() {
        val state = emptyTaskStateUi(
            todayOnly = false,
            filter = TaskListFilter.HighPriority,
            searchQuery = "",
            languageCode = "en-US",
        )

        assertEquals("No tasks in High priority", state.title)
        assertEquals(
            "Clear the filter to review the rest of your tasks. To add one, switch to All and try: write weekly report tomorrow 3pm #work P3.",
            state.hint,
        )
        assertEquals("Clear filter", state.actionLabel)
        assertEquals(EmptyTaskListAction.ClearFilter, state.action)
    }

    @Test
    fun emptyTaskStateUiGivesQuickAddExampleForFirstTask() {
        val state = emptyTaskStateUi(
            todayOnly = false,
            filter = TaskListFilter.All,
            searchQuery = "",
            languageCode = "en-US",
        )

        assertEquals("No tasks yet", state.title)
        assertEquals("Create your first task. Try: write weekly report tomorrow 3pm #work P3.", state.hint)
        assertEquals("Add task", state.actionLabel)
        assertEquals(EmptyTaskListAction.AddTask, state.action)
    }

    private fun taskWithSyncStatus(syncStatus: SyncStatus): Task {
        return Task(
            localId = "local-${syncStatus.wireName}",
            serverId = null,
            title = "Test task",
            content = null,
            status = TaskStatus.Todo,
            priority = 0,
            tag = null,
            project = null,
            listType = "inbox",
            dueTime = null,
            remindTime = null,
            repeatRule = null,
            plannedDate = null,
            completedAt = null,
            snoozedUntil = null,
            parentServerId = null,
            checklistJson = "[]",
            isTemplate = false,
            templateName = null,
            sortOrder = 0,
            version = 1,
            isDeleted = false,
            syncStatus = syncStatus,
            createdAt = "2026-06-11T00:00:00Z",
            updatedAt = "2026-06-11T00:00:00Z",
            lastSyncAt = null,
        )
    }
}
