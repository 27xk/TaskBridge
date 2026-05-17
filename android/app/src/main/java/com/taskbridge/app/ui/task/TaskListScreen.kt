package com.taskbridge.app.ui.task

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.ui.components.SyncStatusBar
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun TaskListScreen(
    viewModel: TaskListViewModel,
    todayOnly: Boolean,
    onAddClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onTodayClick: () -> Unit,
    onAllClick: () -> Unit,
) {
    val taskFlow = if (todayOnly) viewModel.todayTasks else viewModel.tasks
    val sourceTasks by taskFlow.collectAsStateWithLifecycle()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val tasks = remember(sourceTasks, todayOnly, uiState.searchQuery, uiState.filter) {
        sourceTasks
            .filterByMode(todayOnly, uiState.filter)
            .filterByQuery(uiState.searchQuery)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        SyncStatusBar(uiState.syncText)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = if (todayOnly) "今日待办" else "全部任务",
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text("${tasks.size} 条任务")
                }
                Button(onClick = onAddClick) {
                    Text("添加")
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::updateSearchQuery,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("搜索标题、内容、标签或项目") },
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = onTodayClick) { Text("今日") }
                OutlinedButton(onClick = onAllClick) { Text("全部") }
                if (!todayOnly) {
                    TaskListFilter.entries.forEach { filter ->
                        OutlinedButton(onClick = { viewModel.setFilter(filter) }) {
                            Text(if (uiState.filter == filter) "✓ ${filter.label}" else filter.label)
                        }
                    }
                }
                TextButton(onClick = { viewModel.refresh() }) { Text("同步") }
                TextButton(
                    onClick = {
                        viewModel.batchComplete(
                            tasks.filter { it.status != TaskStatus.Completed }.map { it.localId },
                        )
                    },
                ) { Text("完成当前") }
                TextButton(onClick = { viewModel.batchDelete(tasks.map { it.localId }) }) {
                    Text("删除当前")
                }
                TextButton(onClick = onSettingsClick) { Text("设置") }
            }
            Spacer(Modifier.height(12.dp))
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(tasks, key = { it.localId }) { task ->
                    TaskRow(
                        task = task,
                        onComplete = { viewModel.complete(task.localId) },
                        onUndoComplete = { viewModel.undoComplete(task.localId) },
                        onPostpone = { viewModel.postponeToTomorrow(task.localId) },
                        onSnooze = { viewModel.snoozeOneHour(task.localId) },
                        onPlanToday = { viewModel.planToday(task.localId) },
                        onUseServer = { viewModel.resolveConflictUseServer(task.localId) },
                        onOverwriteServer = { viewModel.forceOverwriteServer(task.localId) },
                        onDelete = { viewModel.delete(task.localId) },
                    )
                    Divider()
                }
            }
        }
    }
}

@Composable
private fun TaskRow(
    task: Task,
    onComplete: () -> Unit,
    onUndoComplete: () -> Unit,
    onPostpone: () -> Unit,
    onSnooze: () -> Unit,
    onPlanToday: () -> Unit,
    onUseServer: () -> Unit,
    onOverwriteServer: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = task.status == TaskStatus.Completed,
                onCheckedChange = { checked ->
                    if (checked) onComplete() else onUndoComplete()
                },
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp),
            ) {
                Text(
                    text = task.title,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleMedium,
                    textDecoration = if (task.status == TaskStatus.Completed) {
                        TextDecoration.LineThrough
                    } else {
                        TextDecoration.None
                    },
                )
                val subtitle = task.subtitle()
                Text(
                    text = subtitle.ifBlank { "暂无截止时间" },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (task.syncStatus == SyncStatus.Conflict) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
            TextButton(onClick = onDelete) {
                Text("删除")
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(start = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (task.status == TaskStatus.Completed) {
                TextButton(onClick = onUndoComplete) { Text("恢复") }
            } else {
                TextButton(onClick = onPlanToday) { Text("今日") }
                TextButton(onClick = onPostpone) { Text("明天") }
                TextButton(onClick = onSnooze) { Text("稍后") }
            }
            if (task.syncStatus == SyncStatus.Conflict) {
                TextButton(onClick = onUseServer) { Text("采用云端") }
                TextButton(onClick = onOverwriteServer) { Text("覆盖云端") }
            }
        }
    }
}

private fun List<Task>.filterByMode(todayOnly: Boolean, filter: TaskListFilter): List<Task> {
    if (todayOnly) return this
    val today = LocalDate.now()
    return when (filter) {
        TaskListFilter.All -> this
        TaskListFilter.Inbox -> filter { it.listType == "inbox" && it.status != TaskStatus.Completed }
        TaskListFilter.Overdue -> filter { it.status != TaskStatus.Completed && it.dueLocalDate()?.isBefore(today) == true }
        TaskListFilter.Week -> filter {
            val date = it.plannedDate?.let { value -> runCatching { LocalDate.parse(value) }.getOrNull() } ?: it.dueLocalDate()
            date != null && !date.isBefore(today) && !date.isAfter(today.plusDays(7))
        }
        TaskListFilter.HighPriority -> filter { it.status != TaskStatus.Completed && it.priority >= 3 }
        TaskListFilter.Completed -> filter { it.status == TaskStatus.Completed }
        TaskListFilter.PendingSync -> filter { it.syncStatus != SyncStatus.Synced }
        TaskListFilter.Conflict -> filter { it.syncStatus == SyncStatus.Conflict }
        TaskListFilter.Templates -> filter { it.isTemplate }
    }
}

private fun List<Task>.filterByQuery(query: String): List<Task> {
    val keyword = query.trim()
    if (keyword.isBlank()) return this
    return filter { task ->
        listOfNotNull(task.title, task.content, task.tag, task.project)
            .any { it.contains(keyword, ignoreCase = true) }
    }
}

private fun Task.subtitle(): String {
    return listOfNotNull(
        project?.takeIf { it.isNotBlank() }?.let { "项目 $it" },
        tag?.takeIf { it.isNotBlank() }?.let { "#$it" },
        plannedDate?.let { "计划 $it" },
        dueTime?.let { "截止 ${it.take(16)}" },
        snoozedUntil?.let { "稍后 ${it.take(16)}" },
        if (priority > 0) "P$priority" else null,
        syncStatus.wireName.takeIf { syncStatus != SyncStatus.Synced },
    ).joinToString("  /  ")
}

private fun Task.dueLocalDate(): LocalDate? {
    return dueTime?.let {
        runCatching {
            Instant.parse(it).atZone(ZoneId.systemDefault()).toLocalDate()
        }.getOrNull()
    }
}
