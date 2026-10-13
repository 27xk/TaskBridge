package com.taskbridge.app.domain.model

import com.taskbridge.app.utils.ShanghaiTime
import java.time.Instant

enum class TaskFilter(val label: String) {
    All("全部"), Inbox("收件箱"), Overdue("逾期"), Week("本周"), HighPriority("高优先级"),
    Completed("已完成"), PendingSync("未同步"), Conflict("冲突"), Templates("模板"), Trash("回收站"),
}

data class TaskListQuery(
    val todayOnly: Boolean = false,
    val filter: TaskFilter = TaskFilter.All,
    val keyword: String = "",
    val offset: Int = 0,
    val pageSize: Int = 100,
    val now: Instant = Instant.now(),
    val displayTimeZone: String = ShanghaiTime.DEFAULT_ZONE_ID,
) {
    init {
        require(offset >= 0)
        require(pageSize in 1..200)
    }
}

data class TaskSyncCounts(val errors: Int = 0, val pending: Int = 0)

data class TaskListPage(
    val tasks: List<Task> = emptyList(),
    val total: Int = 0,
    val completed: Int = 0,
    val overdue: Int = 0,
    val offset: Int = 0,
    val pageSize: Int = 100,
    val syncCounts: TaskSyncCounts = TaskSyncCounts(),
) {
    val hasPrevious: Boolean get() = offset > 0
    val hasNext: Boolean get() = offset + tasks.size < total
}
