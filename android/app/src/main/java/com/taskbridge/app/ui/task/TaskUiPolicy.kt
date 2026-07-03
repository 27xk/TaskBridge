package com.taskbridge.app.ui.task

import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task

enum class TaskUiAction {
    Delete,
}

enum class EmptyTaskListAction {
    AddTask,
    ShowAllTasks,
    ClearSearch,
    ClearFilter,
}

data class EmptyTaskStateUi(
    val title: String,
    val hint: String,
    val actionLabel: String,
    val action: EmptyTaskListAction,
)

data class TaskListSyncHealthUi(
    val title: String,
    val body: String,
    val needsAttention: Boolean,
)

fun shouldConfirmTaskAction(action: TaskUiAction): Boolean = action == TaskUiAction.Delete

fun emptyTaskListAction(todayOnly: Boolean, filter: TaskListFilter): EmptyTaskListAction {
    if (todayOnly) return EmptyTaskListAction.AddTask
    return when (filter) {
        TaskListFilter.All,
        TaskListFilter.Inbox -> EmptyTaskListAction.AddTask
        else -> EmptyTaskListAction.ShowAllTasks
    }
}

fun emptyTaskStateUi(
    todayOnly: Boolean,
    filter: TaskListFilter,
    searchQuery: String,
    languageCode: String,
): EmptyTaskStateUi {
    val isEnglish = languageCode == "en-US"
    if (searchQuery.isNotBlank()) {
        return EmptyTaskStateUi(
            title = if (isEnglish) "No matching tasks" else "没有匹配任务",
            hint = if (isEnglish) {
                "Clear search or try: write weekly report tomorrow 3pm #work P3."
            } else {
                "清空搜索，或试试：明天下午 3 点写周报 #工作 P3。"
            },
            actionLabel = if (isEnglish) "Clear search" else "清空搜索",
            action = EmptyTaskListAction.ClearSearch,
        )
    }
    if (todayOnly) {
        return EmptyTaskStateUi(
            title = if (isEnglish) "No tasks for today" else "今天暂无待办",
            hint = if (isEnglish) {
                "Add a task for today, or switch to all tasks. Try: write weekly report today 3pm #work P3."
            } else {
                "可以添加今天要做的任务，或切换到全部任务。试试：今天下午 3 点写周报 #工作 P3。"
            },
            actionLabel = if (isEnglish) "Add task" else "添加任务",
            action = EmptyTaskListAction.AddTask,
        )
    }
    return when (filter) {
        TaskListFilter.All,
        TaskListFilter.Inbox -> EmptyTaskStateUi(
            title = if (isEnglish) "No tasks yet" else "暂无任务",
            hint = if (isEnglish) {
                "Create your first task. Try: write weekly report tomorrow 3pm #work P3."
            } else {
                "创建第一个任务。可以直接输入：明天下午 3 点写周报 #工作 P3。"
            },
            actionLabel = if (isEnglish) "Add task" else "添加任务",
            action = EmptyTaskListAction.AddTask,
        )
        TaskListFilter.Trash -> EmptyTaskStateUi(
            title = if (isEnglish) "Recycle bin is empty" else "回收站为空",
            hint = if (isEnglish) "Deleted tasks will appear here." else "删除后的任务会显示在这里。",
            actionLabel = if (isEnglish) "Show all tasks" else "查看全部任务",
            action = EmptyTaskListAction.ShowAllTasks,
        )
        else -> EmptyTaskStateUi(
            title = if (isEnglish) {
                "No tasks in ${taskListFilterLabel(filter, languageCode)}"
            } else {
                "${taskListFilterLabel(filter, languageCode)}暂无任务"
            },
            hint = if (isEnglish) {
                "Clear the filter to review the rest of your tasks. To add one, switch to All and try: write weekly report tomorrow 3pm #work P3."
            } else {
                "清除筛选后可以查看其他任务。要新建任务，切回全部后试试：明天下午 3 点写周报 #工作 P3。"
            },
            actionLabel = if (isEnglish) "Clear filter" else "清除筛选",
            action = EmptyTaskListAction.ClearFilter,
        )
    }
}

fun getDeleteConfirmationMessage(taskTitle: String, languageCode: String): String {
    val fallbackTitle = if (languageCode == "en-US") "this task" else "该任务"
    val title = taskTitle.trim().ifBlank { fallbackTitle }
    return if (languageCode == "en-US") {
        "Delete \"$title\"? You can restore it from the recycle bin."
    } else {
        "确认删除「$title」？删除后可以在回收站恢复。"
    }
}

fun getTaskPriorityLabel(priority: Int, languageCode: String): String {
    val labels = priorityLabelsFor(languageCode)
    return labels[priority.coerceIn(0, labels.lastIndex)]
}

fun getTaskPriorityOptions(languageCode: String): List<Pair<String, String>> {
    return priorityLabelsFor(languageCode).mapIndexed { index, label -> index.toString() to label }
}

fun getTaskRepeatRuleLabel(repeatRule: String?, languageCode: String): String {
    val normalized = repeatRule?.trim()?.lowercase().orEmpty()
    if (normalized.isBlank()) return ""
    val isEnglish = languageCode == "en-US"
    return when (normalized) {
        "daily" -> if (isEnglish) "Daily" else "每天"
        "weekly" -> if (isEnglish) "Weekly" else "每周"
        "monthly" -> if (isEnglish) "Monthly" else "每月"
        else -> repeatRule?.trim().orEmpty()
    }
}

fun getTaskListTypeLabel(listType: String?, languageCode: String): String {
    val normalized = listType?.trim()?.lowercase().orEmpty()
    if (normalized.isBlank()) return ""
    val isEnglish = languageCode == "en-US"
    return when (normalized) {
        "inbox" -> if (isEnglish) "Inbox" else "收件箱"
        "today" -> if (isEnglish) "Today" else "今日"
        else -> listType?.trim().orEmpty()
    }
}

fun getSyncStatusLabel(status: SyncStatus, languageCode: String): String? {
    val isEnglish = languageCode == "en-US"
    return when (status) {
        SyncStatus.Synced -> null
        SyncStatus.PendingCreate,
        SyncStatus.PendingUpdate -> if (isEnglish) "Pending sync" else "待同步"
        SyncStatus.PendingDelete -> if (isEnglish) "Pending deletion" else "待删除同步"
        SyncStatus.Failed -> if (isEnglish) "Sync failed" else "同步失败"
        SyncStatus.Conflict -> if (isEnglish) "Sync conflict" else "同步冲突"
    }
}

fun taskListSyncHealthText(tasks: List<Task>, languageCode: String): TaskListSyncHealthUi {
    val isEnglish = languageCode == "en-US"
    val issueCount = tasks
        .distinctBy { it.localId }
        .count { it.syncStatus != SyncStatus.Synced }
    return if (issueCount > 0) {
        TaskListSyncHealthUi(
            title = if (isEnglish) "Sync needs attention" else "同步需要处理",
            body = if (isEnglish) {
                "$issueCount tasks are pending, failed, or conflicted. Open sync details before clearing this device."
            } else {
                "${issueCount} 条任务待同步、失败或冲突。清除此设备数据前请先打开同步详情处理。"
            },
            needsAttention = true,
        )
    } else {
        TaskListSyncHealthUi(
            title = if (isEnglish) "Sync is healthy" else "同步正常",
            body = if (isEnglish) {
                "No action needed. Keep adding tasks and TaskBridge will sync automatically."
            } else {
                "当前无需处理，继续记录任务，TaskBridge 会自动同步。"
            },
            needsAttention = false,
        )
    }
}

fun taskListSubtitleOrNull(subtitle: String): String? {
    return subtitle.trim().ifBlank { null }
}

private fun taskListFilterLabel(filter: TaskListFilter, languageCode: String): String {
    val isEnglish = languageCode == "en-US"
    return when (filter) {
        TaskListFilter.All -> if (isEnglish) "All" else "全部"
        TaskListFilter.Inbox -> if (isEnglish) "Inbox" else "收件箱"
        TaskListFilter.Overdue -> if (isEnglish) "Overdue" else "逾期"
        TaskListFilter.Week -> if (isEnglish) "This week" else "本周"
        TaskListFilter.HighPriority -> if (isEnglish) "High priority" else "高优先级"
        TaskListFilter.Completed -> if (isEnglish) "Completed" else "已完成"
        TaskListFilter.PendingSync -> if (isEnglish) "Pending sync" else "未同步"
        TaskListFilter.Conflict -> if (isEnglish) "Conflicts" else "冲突"
        TaskListFilter.Templates -> if (isEnglish) "Templates" else "模板"
        TaskListFilter.Trash -> if (isEnglish) "Recycle bin" else "回收站"
    }
}

private fun priorityLabelsFor(languageCode: String): List<String> {
    return if (languageCode == "en-US") {
        listOf("None", "Low", "Medium", "High", "Urgent", "Highest")
    } else {
        listOf("无优先级", "低", "中", "高", "紧急", "最高")
    }
}
