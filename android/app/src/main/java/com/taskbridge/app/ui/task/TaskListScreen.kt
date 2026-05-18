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
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.ui.i18n.TaskBridgeStrings
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val shanghaiZone: ZoneId = ZoneId.of("Asia/Shanghai")
private val dateTimeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

@Composable
fun TaskListScreen(
    viewModel: TaskListViewModel,
    todayOnly: Boolean,
    onAddClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onTodayClick: () -> Unit,
    onAllClick: () -> Unit,
) {
    val strings = LocalTaskBridgeStrings.current
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
                        text = if (todayOnly) strings.todayTasks else strings.allTasks,
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text("${tasks.size} ${strings.taskCountSuffix}")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.refresh() }) {
                        Text(strings.syncNow)
                    }
                    Button(onClick = onAddClick) {
                        Text(strings.add)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::updateSearchQuery,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(strings.searchHint) },
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = onTodayClick) { Text(strings.today) }
                OutlinedButton(onClick = onAllClick) { Text(strings.all) }
                if (!todayOnly) {
                    TaskListFilter.entries.forEach { filter ->
                        OutlinedButton(onClick = { viewModel.setFilter(filter) }) {
                            val label = filter.localizedLabel(strings)
                            Text(if (uiState.filter == filter) "✓ $label" else label)
                        }
                    }
                }
                TextButton(onClick = { viewModel.refresh() }) { Text(strings.sync) }
                TextButton(
                    onClick = {
                        viewModel.batchComplete(
                            tasks.filter { it.status != TaskStatus.Completed }.map { it.localId },
                        )
                    },
                ) { Text(strings.completeCurrent) }
                TextButton(onClick = { viewModel.batchDelete(tasks.map { it.localId }) }) {
                    Text(strings.deleteCurrent)
                }
                TextButton(onClick = onSettingsClick) { Text(strings.settings) }
            }
            Spacer(Modifier.height(12.dp))
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(tasks, key = { it.localId }) { task ->
                    TaskRow(
                        task = task,
                        strings = strings,
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
    strings: TaskBridgeStrings,
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
                val subtitle = task.subtitle(strings)
                Text(
                    text = subtitle.ifBlank { strings.noDueTime },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (task.syncStatus == SyncStatus.Conflict) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
            TextButton(onClick = onDelete) {
                Text(strings.delete)
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
                TextButton(onClick = onUndoComplete) { Text(strings.restore) }
            } else {
                TextButton(onClick = onPlanToday) { Text(strings.today) }
                TextButton(onClick = onPostpone) { Text(strings.tomorrow) }
                TextButton(onClick = onSnooze) { Text(strings.snooze) }
            }
            if (task.syncStatus == SyncStatus.Conflict) {
                TextButton(onClick = onUseServer) { Text(strings.useCloud) }
                TextButton(onClick = onOverwriteServer) { Text(strings.overwriteCloud) }
            }
        }
    }
}

private fun TaskListFilter.localizedLabel(strings: TaskBridgeStrings): String {
    return when (this) {
        TaskListFilter.All -> strings.all
        TaskListFilter.Inbox -> strings.inbox
        TaskListFilter.Overdue -> strings.overdue
        TaskListFilter.Week -> strings.week
        TaskListFilter.HighPriority -> strings.highPriority
        TaskListFilter.Completed -> strings.completed
        TaskListFilter.PendingSync -> strings.pendingSync
        TaskListFilter.Conflict -> strings.conflict
        TaskListFilter.Templates -> strings.templates
    }
}

private fun List<Task>.filterByMode(todayOnly: Boolean, filter: TaskListFilter): List<Task> {
    if (todayOnly) return this
    val today = LocalDate.now(shanghaiZone)
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

private fun Task.subtitle(strings: TaskBridgeStrings): String {
    return listOfNotNull(
        project?.takeIf { it.isNotBlank() }?.let { "${strings.project} $it" },
        tag?.takeIf { it.isNotBlank() }?.let { "#$it" },
        plannedDate?.let { "${strings.plan} $it" },
        dueTime?.let { "${strings.due} ${formatShanghaiInstant(it)}" },
        snoozedUntil?.let { "${strings.snooze} ${formatShanghaiInstant(it)}" },
        if (priority > 0) "P$priority" else null,
        syncStatus.wireName.takeIf { syncStatus != SyncStatus.Synced },
    ).joinToString("  /  ")
}

private fun Task.dueLocalDate(): LocalDate? {
    return dueTime?.let {
        runCatching {
            Instant.parse(it).atZone(shanghaiZone).toLocalDate()
        }.getOrNull()
    }
}

private fun formatShanghaiInstant(value: String): String {
    return runCatching {
        dateTimeFormatter.format(Instant.parse(value).atZone(shanghaiZone))
    }.getOrDefault(value)
}
