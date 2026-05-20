package com.taskbridge.app.ui.task

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.LocalDate
import com.taskbridge.app.domain.model.SyncStatus
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.domain.model.isOverdueAt
import com.taskbridge.app.domain.model.sortedByTaskTimeline
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.AppUiOption
import com.taskbridge.app.ui.components.SyncStatusBar
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.ui.i18n.TaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime

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
    val now = rememberTimelineNow()
    val tasks = remember(sourceTasks, todayOnly, uiState.searchQuery, uiState.filter, displayTimeZone, now) {
        sourceTasks
            .filterByMode(todayOnly, uiState.filter, displayTimeZone, now)
            .filterByQuery(uiState.searchQuery)
            .sortedByTaskTimeline(now, displayTimeZone)
    }
    val openTasks = remember(tasks) { tasks.filter { it.status != TaskStatus.Completed } }
    val overdueTasks = remember(openTasks, now, displayTimeZone) { openTasks.filter { it.isOverdueAt(now, displayTimeZone) } }
    val pendingOpenTasks = remember(openTasks, now, displayTimeZone) { openTasks.filterNot { it.isOverdueAt(now, displayTimeZone) } }
    val completedTasks = remember(tasks) { tasks.filter { it.status == TaskStatus.Completed } }
    var viewMenuExpanded by remember { mutableStateOf(false) }
    var filterMenuExpanded by remember { mutableStateOf(false) }

    AppPage(modifier = Modifier.fillMaxSize()) {
        SyncStatusBar(uiState.syncText)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AppHeader(
                title = if (todayOnly) strings.todayTasks else strings.allTasks,
                subtitle = "${tasks.size} ${strings.taskCountSuffix}",
                trailing = {
                    Button(onClick = onAddClick) {
                        Text(strings.add, maxLines = 1)
                    }
                },
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { viewModel.refresh() }, modifier = Modifier.weight(1f)) {
                    Text(strings.syncNow, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                TextButton(onClick = onSettingsClick, modifier = Modifier.weight(1f)) {
                    Text(strings.settings, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }

            AppPanel(contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)) {
                OutlinedTextField(
                    value = uiState.searchQuery,
                    onValueChange = viewModel::updateSearchQuery,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    placeholder = { Text(strings.searchHint) },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppDropdownField(
                        label = "",
                        selectedLabel = if (todayOnly) strings.today else strings.all,
                        expanded = viewMenuExpanded,
                        options = listOf(
                            AppUiOption(true, strings.today),
                            AppUiOption(false, strings.all),
                        ),
                        onExpandedChange = { viewMenuExpanded = it },
                        onSelect = { todaySelected ->
                            if (todaySelected) onTodayClick() else onAllClick()
                        },
                        modifier = Modifier.weight(1f),
                    )
                    if (!todayOnly) {
                        AppDropdownField(
                            label = "",
                            selectedLabel = uiState.filter.localizedLabel(strings),
                            expanded = filterMenuExpanded,
                            options = TaskListFilter.entries.map { AppUiOption(it, it.localizedLabel(strings)) },
                            onExpandedChange = { filterMenuExpanded = it },
                            onSelect = viewModel::setFilter,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (tasks.isEmpty()) {
                    item {
                        EmptyTaskState(text = if (todayOnly) strings.emptyToday else strings.emptyTasks)
                    }
                }
                if (overdueTasks.isNotEmpty()) {
                    item { TaskSectionHeader(title = strings.overdue, count = overdueTasks.size, isWarning = true) }
                    items(overdueTasks, key = { it.localId }) { task ->
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
                            now = now,
                        )
                    }
                }
                if (pendingOpenTasks.isNotEmpty()) {
                    item { TaskSectionHeader(title = strings.todo, count = pendingOpenTasks.size) }
                    items(pendingOpenTasks, key = { it.localId }) { task ->
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
                            now = now,
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
                            now = now,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskSectionHeader(title: String, count: Int, isWarning: Boolean = false) {
    val color = if (isWarning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            color = color,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
        )
        Text(
            text = count.toString(),
            color = color,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

@Composable
private fun EmptyTaskState(text: String) {
    AppPanel {
        Text(
            text = text,
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
    now: Instant,
) {
    val isOverdue = task.isOverdueAt(now, displayTimeZone)
    val borderColor = if (isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, borderColor),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
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
                        .padding(start = 6.dp),
                ) {
                    Text(
                        text = task.title,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        textDecoration = if (task.status == TaskStatus.Completed) {
                            TextDecoration.LineThrough
                        } else {
                            TextDecoration.None
                        },
                        color = if (isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                    )
                    val subtitle = task.subtitle(strings, displayTimeZone, now)
                    Text(
                        text = subtitle.ifBlank { strings.noDueTime },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isOverdue || task.syncStatus == SyncStatus.Conflict) {
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
                    .padding(start = 42.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
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

private fun List<Task>.filterByMode(
    todayOnly: Boolean,
    filter: TaskListFilter,
    displayTimeZone: String,
    now: Instant,
): List<Task> {
    if (todayOnly) return this
    val today = ShanghaiTime.todayDate(displayTimeZone)
    return when (filter) {
        TaskListFilter.All -> this
        TaskListFilter.Inbox -> filter { it.listType == "inbox" && it.status != TaskStatus.Completed }
        TaskListFilter.Overdue -> filter { it.isOverdueAt(now, displayTimeZone) }
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

private fun Task.subtitle(strings: TaskBridgeStrings, displayTimeZone: String, now: Instant): String {
    return listOfNotNull(
        strings.overdue.takeIf { isOverdueAt(now, displayTimeZone) },
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
