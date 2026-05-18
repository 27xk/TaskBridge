package com.taskbridge.app.ui.task

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.ui.components.SyncStatusBar
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.ui.i18n.TaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
import java.time.LocalDate

@Composable
fun TaskListScreen(
    viewModel: TaskListViewModel,
    todayOnly: Boolean,
    onAddClick: () -> Unit,
    onEditClick: (String) -> Unit,
    onSettingsClick: () -> Unit,
    onTodayClick: () -> Unit,
    onAllClick: () -> Unit,
) {
    val strings = LocalTaskBridgeStrings.current
    val taskFlow = if (todayOnly) viewModel.todayTasks else viewModel.tasks
    val sourceTasks by taskFlow.collectAsStateWithLifecycle()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val displayTimeZone by viewModel.displayTimeZone.collectAsStateWithLifecycle()
    val tasks = remember(sourceTasks, todayOnly, uiState.searchQuery, uiState.filter, displayTimeZone) {
        sourceTasks
            .filterByMode(todayOnly, uiState.filter, displayTimeZone)
            .filterByQuery(uiState.searchQuery)
    }
    val openTasks = remember(tasks) { tasks.filter { it.status != TaskStatus.Completed } }
    val completedTasks = remember(tasks) { tasks.filter { it.status == TaskStatus.Completed } }
    var viewMenuExpanded by remember { mutableStateOf(false) }
    var filterMenuExpanded by remember { mutableStateOf(false) }

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
                placeholder = { Text(strings.searchHint) },
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    OutlinedButton(
                        onClick = { viewMenuExpanded = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = if (todayOnly) strings.today else strings.all,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    DropdownMenu(
                        expanded = viewMenuExpanded,
                        onDismissRequest = { viewMenuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(strings.today) },
                            onClick = {
                                viewMenuExpanded = false
                                onTodayClick()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(strings.all) },
                            onClick = {
                                viewMenuExpanded = false
                                onAllClick()
                            },
                        )
                    }
                }
                if (!todayOnly) {
                    Column(modifier = Modifier.weight(1f)) {
                        OutlinedButton(
                            onClick = { filterMenuExpanded = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = uiState.filter.localizedLabel(strings),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        DropdownMenu(
                            expanded = filterMenuExpanded,
                            onDismissRequest = { filterMenuExpanded = false },
                        ) {
                            TaskListFilter.entries.forEach { filter ->
                                DropdownMenuItem(
                                    text = { Text(filter.localizedLabel(strings)) },
                                    onClick = {
                                        filterMenuExpanded = false
                                        viewModel.setFilter(filter)
                                    },
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        viewModel.batchComplete(
                            tasks.filter { it.status != TaskStatus.Completed }.map { it.localId },
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = strings.completeCurrent,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                OutlinedButton(
                    onClick = { viewModel.batchDelete(tasks.map { it.localId }) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = strings.deleteCurrent,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                TextButton(
                    onClick = onSettingsClick,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = strings.settings,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (tasks.isEmpty()) {
                    item {
                        EmptyTaskState(text = if (todayOnly) strings.emptyToday else strings.emptyTasks)
                    }
                }
                if (openTasks.isNotEmpty()) {
                    item { TaskSectionHeader(title = strings.todo, count = openTasks.size) }
                    items(openTasks, key = { it.localId }) { task ->
                        TaskRow(
                            task = task,
                            strings = strings,
                            displayTimeZone = displayTimeZone,
                            onComplete = { viewModel.complete(task.localId) },
                            onUndoComplete = { viewModel.undoComplete(task.localId) },
                            onPostpone = { viewModel.postponeToTomorrow(task.localId) },
                            onSnooze = { viewModel.snoozeOneHour(task.localId) },
                            onPlanToday = { viewModel.planToday(task.localId) },
                            onUseServer = { viewModel.resolveConflictUseServer(task.localId) },
                            onOverwriteServer = { viewModel.forceOverwriteServer(task.localId) },
                            onDelete = { viewModel.delete(task.localId) },
                            onEdit = { onEditClick(task.localId) },
                        )
                    }
                }
                if (completedTasks.isNotEmpty()) {
                    item { TaskSectionHeader(title = strings.completed, count = completedTasks.size) }
                    items(completedTasks, key = { it.localId }) { task ->
                        TaskRow(
                            task = task,
                            strings = strings,
                            displayTimeZone = displayTimeZone,
                            onComplete = { viewModel.complete(task.localId) },
                            onUndoComplete = { viewModel.undoComplete(task.localId) },
                            onPostpone = { viewModel.postponeToTomorrow(task.localId) },
                            onSnooze = { viewModel.snoozeOneHour(task.localId) },
                            onPlanToday = { viewModel.planToday(task.localId) },
                            onUseServer = { viewModel.resolveConflictUseServer(task.localId) },
                            onOverwriteServer = { viewModel.forceOverwriteServer(task.localId) },
                            onDelete = { viewModel.delete(task.localId) },
                            onEdit = { onEditClick(task.localId) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskSectionHeader(title: String, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelLarge,
        )
        Text(
            text = count.toString(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

@Composable
private fun EmptyTaskState(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(22.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun TaskRow(
    task: Task,
    strings: TaskBridgeStrings,
    displayTimeZone: String,
    onComplete: () -> Unit,
    onUndoComplete: () -> Unit,
    onPostpone: () -> Unit,
    onSnooze: () -> Unit,
    onPlanToday: () -> Unit,
    onUseServer: () -> Unit,
    onOverwriteServer: () -> Unit,
    onDelete: () -> Unit,
    onEdit: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 1.dp),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
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
                        .padding(start = 8.dp),
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
                    val subtitle = task.subtitle(strings, displayTimeZone)
                    Text(
                        text = subtitle.ifBlank { strings.noDueTime },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (task.syncStatus == SyncStatus.Conflict) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
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
                TextButton(onClick = onEdit) { Text(strings.edit) }
                TextButton(onClick = onDelete) { Text(strings.delete) }
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

private fun List<Task>.filterByMode(todayOnly: Boolean, filter: TaskListFilter, displayTimeZone: String): List<Task> {
    if (todayOnly) return this
    val today = ShanghaiTime.todayDate(displayTimeZone)
    return when (filter) {
        TaskListFilter.All -> this
        TaskListFilter.Inbox -> filter { it.listType == "inbox" && it.status != TaskStatus.Completed }
        TaskListFilter.Overdue -> filter { it.status != TaskStatus.Completed && it.dueLocalDate(displayTimeZone)?.isBefore(today) == true }
        TaskListFilter.Week -> filter {
            val date = it.plannedDate?.let { value -> runCatching { LocalDate.parse(value) }.getOrNull() }
                ?: it.dueLocalDate(displayTimeZone)
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

private fun Task.subtitle(strings: TaskBridgeStrings, displayTimeZone: String): String {
    return listOfNotNull(
        project?.takeIf { it.isNotBlank() }?.let { "${strings.project} $it" },
        tag?.takeIf { it.isNotBlank() }?.let { "#$it" },
        plannedDate?.let { "${strings.plan} $it" },
        dueTime?.let { "${strings.due} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
        snoozedUntil?.let { "${strings.snooze} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
        if (priority > 0) "P$priority" else null,
        syncStatus.wireName.takeIf { syncStatus != SyncStatus.Synced },
    ).joinToString("  /  ")
}

private fun Task.dueLocalDate(displayTimeZone: String): LocalDate? {
    return dueTime?.let {
        runCatching {
            ShanghaiTime.localDate(it, displayTimeZone)
        }.getOrNull()
    }
}
