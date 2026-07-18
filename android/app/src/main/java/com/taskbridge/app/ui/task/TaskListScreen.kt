package com.taskbridge.app.ui.task

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.taskbridge.app.ui.components.SyncStatusMessage
import com.taskbridge.app.ui.components.SyncStatusBar
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.ui.i18n.TaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
import org.json.JSONObject

private enum class ConflictAction {
    UseCloud,
    OverwriteCloud,
}

private data class PendingConflictAction(
    val task: Task,
    val action: ConflictAction,
)

private data class ConflictSnapshotDiff(
    val label: String,
    val localValue: String,
    val cloudValue: String,
)

private data class ConflictSnapshotField(
    val label: String,
    val keys: List<String>,
    val type: String? = null,
)

private data class TaskMetaChip(
    val text: String,
    val attention: Boolean = false,
)

@Composable
fun TaskListScreen(
    viewModel: TaskListViewModel,
    todayOnly: Boolean,
    localWorkspaceMode: Boolean,
    initialFilter: TaskListFilter = TaskListFilter.All,
    onAddClick: () -> Unit,
    onTaskClick: (String) -> Unit,
    onEditClick: (String) -> Unit,
    onSettingsClick: () -> Unit,
    onSyncDetailsClick: () -> Unit,
    onSignInToSync: () -> Unit,
    onTodayClick: () -> Unit,
    onAllClick: () -> Unit,
) {
    val strings = LocalTaskBridgeStrings.current
    val appLanguage = LocalAppLanguage.current
    val isEnglish = appLanguage.code == "en-US"
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val allTasks by viewModel.tasks.collectAsStateWithLifecycle()
    val todayTasks by viewModel.todayTasks.collectAsStateWithLifecycle()
    val trashTasks by viewModel.trashTasks.collectAsStateWithLifecycle()
    LaunchedEffect(todayOnly, initialFilter) {
        if (!todayOnly && initialFilter != TaskListFilter.All && uiState.filter != initialFilter) {
            viewModel.setFilter(initialFilter)
        }
    }
    val isTrashFilter = !todayOnly && uiState.filter == TaskListFilter.Trash
    val sourceTasks = when {
        todayOnly -> todayTasks
        isTrashFilter -> trashTasks
        else -> allTasks
    }
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
    var filterMenuExpanded by remember { mutableStateOf(false) }
    var listToolsOpen by rememberSaveable { mutableStateOf(false) }
    var headerActionsExpanded by remember { mutableStateOf(false) }
    var pendingDeleteTask by remember { mutableStateOf<Task?>(null) }
    var pendingPurgeTask by remember { mutableStateOf<Task?>(null) }
    var pendingPurgeSelectedTasks by remember { mutableStateOf<List<Task>>(emptyList()) }
    var pendingConflictAction by remember { mutableStateOf<PendingConflictAction?>(null) }
    var selectedTrashTaskIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    val visibleTrashTaskIds = remember(isTrashFilter, tasks) {
        if (isTrashFilter) tasks.map { it.localId }.toSet() else emptySet()
    }
    LaunchedEffect(visibleTrashTaskIds) {
        selectedTrashTaskIds = selectedTrashTaskIds.intersect(visibleTrashTaskIds)
    }
    val selectedTrashTasks = remember(tasks, selectedTrashTaskIds) {
        tasks.filter { selectedTrashTaskIds.contains(it.localId) }
    }
    val emptyState = emptyTaskStateUi(
        todayOnly = todayOnly,
        filter = uiState.filter,
        searchQuery = uiState.searchQuery,
        languageCode = appLanguage.code,
    )
    val emptyActionHandler: () -> Unit = when (emptyState.action) {
        EmptyTaskListAction.AddTask -> onAddClick
        EmptyTaskListAction.ShowAllTasks,
        EmptyTaskListAction.ClearFilter -> { { viewModel.setFilter(TaskListFilter.All) } }
        EmptyTaskListAction.ClearSearch -> { { viewModel.updateSearchQuery("") } }
    }
    val activeFilterLabels = activeTaskFilterLabels(
        todayOnly = todayOnly,
        searchQuery = uiState.searchQuery,
        filter = uiState.filter,
        strings = strings,
    )
    val syncHealth = remember(allTasks, trashTasks, appLanguage.code) {
        taskListSyncHealthText(allTasks + trashTasks, appLanguage.code)
    }

    pendingDeleteTask?.let { task ->
        DeleteTaskConfirmationDialog(
            task = task,
            strings = strings,
            languageCode = appLanguage.code,
            onDismiss = { pendingDeleteTask = null },
            onConfirm = {
                viewModel.delete(task.localId)
                pendingDeleteTask = null
            },
        )
    }

    pendingPurgeTask?.let { task ->
        PurgeTaskConfirmationDialog(
            task = task,
            strings = strings,
            onDismiss = { pendingPurgeTask = null },
            onConfirm = {
                viewModel.purgeDeleted(task.localId)
                pendingPurgeTask = null
            },
        )
    }

    pendingPurgeSelectedTasks.takeIf { it.isNotEmpty() }?.let { selected ->
        PurgeSelectedTasksConfirmationDialog(
            count = selected.size,
            strings = strings,
            onDismiss = { pendingPurgeSelectedTasks = emptyList() },
            onConfirm = {
                viewModel.batchPurgeDeleted(selected.map { it.localId })
                selectedTrashTaskIds = emptySet()
                pendingPurgeSelectedTasks = emptyList()
            },
        )
    }

    pendingConflictAction?.let { pending ->
        ConflictActionConfirmationDialog(
            task = pending.task,
            action = pending.action,
            strings = strings,
            languageCode = appLanguage.code,
            onDismiss = { pendingConflictAction = null },
            onConfirm = {
                when (pending.action) {
                    ConflictAction.UseCloud -> viewModel.resolveConflictUseServer(pending.task.localId)
                    ConflictAction.OverwriteCloud -> viewModel.forceOverwriteServer(pending.task.localId)
                }
                pendingConflictAction = null
            },
        )
    }

    AppPage(modifier = Modifier.fillMaxSize()) {
        if (!localWorkspaceMode && uiState.syncMessage != SyncStatusMessage.LocalCacheReady) {
            SyncStatusBar(uiState.syncMessage)
        }
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
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Button(onClick = onAddClick) {
                            Text(strings.add, maxLines = 1)
                        }
                        if (!localWorkspaceMode) {
                            TaskListHeaderActions(
                                strings = strings,
                                expanded = headerActionsExpanded,
                                onExpandedChange = { headerActionsExpanded = it },
                                onSyncNow = { viewModel.refresh() },
                                languageCode = appLanguage.code,
                            )
                        }
                    }
                },
            )

            if (localWorkspaceMode) {
                AppPanel {
                    Text(
                        text = strings.localWorkspaceMode,
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = strings.localWorkspaceModeBody,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    OutlinedButton(
                        onClick = onSignInToSync,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.signInToSync)
                    }
                }
            }

            TaskListPrimaryNavigation(
                todaySelected = todayOnly,
                strings = strings,
                onTodayClick = onTodayClick,
                onAllClick = onAllClick,
                onSettingsClick = onSettingsClick,
            )

            if (!localWorkspaceMode && syncHealth.needsAttention) {
                TaskListSyncHealthBar(
                    syncHealth = syncHealth,
                    strings = strings,
                    onOpenDetails = onSyncDetailsClick,
                )
            }

            TaskListSearchField(
                searchQuery = uiState.searchQuery,
                strings = strings,
                onSearchChange = viewModel::updateSearchQuery,
                modifier = Modifier.fillMaxWidth(),
            )

            if (!todayOnly) {
                TextButton(onClick = { listToolsOpen = !listToolsOpen }, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        if (listToolsOpen || uiState.filter != TaskListFilter.All) {
                            if (isEnglish) "Hide filters" else "收起筛选"
                        } else {
                            if (isEnglish) "Filters" else "筛选"
                        },
                    )
                }
            }

            if (!todayOnly && (listToolsOpen || uiState.filter != TaskListFilter.All)) {
                AppPanel(contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)) {
                    val selectedFilterLabel = uiState.filter.localizedLabel(strings)
                    AppDropdownField(
                        label = strings.filter,
                        selectedLabel = selectedFilterLabel,
                        expanded = filterMenuExpanded,
                        options = combinedTaskListFilterOptions(strings),
                        onExpandedChange = { filterMenuExpanded = it },
                        onSelect = viewModel::setFilter,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            TaskFilterSummaryBar(
                activeFilterLabels = activeFilterLabels,
                strings = strings,
                canClearSearch = uiState.searchQuery.isNotBlank(),
                canClearFilter = !todayOnly && uiState.filter != TaskListFilter.All,
                onClearSearch = { viewModel.updateSearchQuery("") },
                onClearFilter = { viewModel.setFilter(TaskListFilter.All) },
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (tasks.isEmpty()) {
                    item {
                        EmptyTaskState(
                            title = emptyState.title,
                            hint = emptyState.hint,
                            actionLabel = emptyState.actionLabel,
                            onAction = emptyActionHandler,
                        )
                    }
                }
                if (isTrashFilter && tasks.isNotEmpty()) {
                    item { TaskSectionHeader(title = strings.trash, count = tasks.size) }
                    item {
                        TrashBatchActionBar(
                            selectedCount = selectedTrashTaskIds.size,
                            strings = strings,
                            onRestoreSelected = {
                                val selectedIds = selectedTrashTaskIds.toList()
                                if (selectedIds.isNotEmpty()) {
                                    viewModel.batchRestoreDeleted(selectedIds)
                                    selectedTrashTaskIds = emptySet()
                                }
                            },
                            onPurgeSelected = {
                                if (selectedTrashTasks.isNotEmpty()) {
                                    pendingPurgeSelectedTasks = selectedTrashTasks
                                }
                            },
                            onClearSelection = { selectedTrashTaskIds = emptySet() },
                        )
                    }
                    items(tasks, key = { it.localId }) { task ->
                        TaskRow(
                            task = task,
                            strings = strings,
                            displayTimeZone = displayTimeZone,
                            onComplete = { viewModel.complete(task.localId) },
                            onUndoComplete = { viewModel.undoComplete(task.localId) },
                            onPostpone = { viewModel.postponeToTomorrow(task.localId) },
                            onSnooze = { viewModel.snoozeOneHour(task.localId) },
                            onPlanToday = { viewModel.planToday(task.localId) },
                            onUseServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.UseCloud) },
                            onOverwriteServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.OverwriteCloud) },
                            onRestoreDeleted = { viewModel.restoreDeleted(task.localId) },
                            onDelete = { pendingDeleteTask = task },
                            onPurge = { pendingPurgeTask = task },
                            onOpen = { onTaskClick(task.localId) },
                            onEdit = { onEditClick(task.localId) },
                            selected = selectedTrashTaskIds.contains(task.localId),
                            onSelectionChange = { checked ->
                                selectedTrashTaskIds = if (checked) {
                                    selectedTrashTaskIds + task.localId
                                } else {
                                    selectedTrashTaskIds - task.localId
                                }
                            },
                            now = now,
                            languageCode = appLanguage.code,
                            isTrash = true,
                        )
                    }
                }
                if (!isTrashFilter && overdueTasks.isNotEmpty()) {
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
                            onUseServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.UseCloud) },
                            onOverwriteServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.OverwriteCloud) },
                            onRestoreDeleted = { viewModel.restoreDeleted(task.localId) },
                            onDelete = { pendingDeleteTask = task },
                            onOpen = { onTaskClick(task.localId) },
                            onEdit = { onEditClick(task.localId) },
                            now = now,
                            languageCode = appLanguage.code,
                            isTrash = false,
                        )
                    }
                }
                if (!isTrashFilter && pendingOpenTasks.isNotEmpty()) {
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
                            onUseServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.UseCloud) },
                            onOverwriteServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.OverwriteCloud) },
                            onRestoreDeleted = { viewModel.restoreDeleted(task.localId) },
                            onDelete = { pendingDeleteTask = task },
                            onOpen = { onTaskClick(task.localId) },
                            onEdit = { onEditClick(task.localId) },
                            now = now,
                            languageCode = appLanguage.code,
                            isTrash = false,
                        )
                    }
                }
                if (!isTrashFilter && completedTasks.isNotEmpty()) {
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
                            onUseServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.UseCloud) },
                            onOverwriteServer = { pendingConflictAction = PendingConflictAction(task, ConflictAction.OverwriteCloud) },
                            onRestoreDeleted = { viewModel.restoreDeleted(task.localId) },
                            onDelete = { pendingDeleteTask = task },
                            onOpen = { onTaskClick(task.localId) },
                            onEdit = { onEditClick(task.localId) },
                            now = now,
                            languageCode = appLanguage.code,
                            isTrash = false,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskListSyncHealthBar(
    syncHealth: TaskListSyncHealthUi,
    strings: TaskBridgeStrings,
    onOpenDetails: () -> Unit,
) {
    AppPanel(contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = syncHealth.title,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (syncHealth.needsAttention) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = syncHealth.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onOpenDetails) {
                Text(strings.syncHealthAction, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun TaskListSearchField(
    searchQuery: String,
    strings: TaskBridgeStrings,
    onSearchChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    AppPanel(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
    ) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text(strings.searchHint) },
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun TaskFilterSummaryBar(
    activeFilterLabels: List<String>,
    strings: TaskBridgeStrings,
    canClearSearch: Boolean,
    canClearFilter: Boolean,
    onClearSearch: () -> Unit,
    onClearFilter: () -> Unit,
) {
    if (activeFilterLabels.isEmpty()) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = strings.currentFilters,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                activeFilterLabels.forEach { label ->
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surface,
                    ) {
                        Text(
                            text = label,
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            if (canClearSearch || canClearFilter) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    if (canClearSearch) {
                        TextButton(onClick = onClearSearch) {
                            Text(strings.clearSearch)
                        }
                    }
                    if (canClearFilter) {
                        TextButton(onClick = onClearFilter) {
                            Text(strings.showAllTasks)
                        }
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
@OptIn(ExperimentalLayoutApi::class)
private fun TaskListPrimaryNavigation(
    todaySelected: Boolean,
    strings: TaskBridgeStrings,
    onTodayClick: () -> Unit,
    onAllClick: () -> Unit,
    onSettingsClick: () -> Unit,
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (todaySelected) {
            Button(onClick = onTodayClick) {
                Text(strings.today, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        } else {
            OutlinedButton(onClick = onTodayClick) {
                Text(strings.today, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (todaySelected) {
            OutlinedButton(onClick = onAllClick) {
                Text(strings.all, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        } else {
            Button(onClick = onAllClick) {
                Text(strings.all, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        OutlinedButton(onClick = onSettingsClick) {
            Text(strings.settings, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun TaskListHeaderActions(
    strings: TaskBridgeStrings,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSyncNow: () -> Unit,
    languageCode: String,
) {
    val moreLabel = if (languageCode == "en-US") "More" else "更多"
    TextButton(onClick = { onExpandedChange(true) }) {
        Text(moreLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = { onExpandedChange(false) },
    ) {
        DropdownMenuItem(
            text = { Text(strings.syncNow) },
            onClick = {
                onExpandedChange(false)
                onSyncNow()
            },
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun TrashBatchActionBar(
    selectedCount: Int,
    strings: TaskBridgeStrings,
    onRestoreSelected: () -> Unit,
    onPurgeSelected: () -> Unit,
    onClearSelection: () -> Unit,
) {
    AppPanel(contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = strings.selectedCount.format(selectedCount),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                TextButton(
                    onClick = onRestoreSelected,
                    enabled = selectedCount > 0,
                ) {
                    Text(strings.restoreSelected)
                }
                TextButton(
                    onClick = onPurgeSelected,
                    enabled = selectedCount > 0,
                ) {
                    Text(strings.deleteSelectedPermanently)
                }
                TextButton(
                    onClick = onClearSelection,
                    enabled = selectedCount > 0,
                ) {
                    Text(strings.clearSelection)
                }
            }
        }
    }
}

@Composable
private fun EmptyTaskState(title: String, hint: String, actionLabel: String, onAction: () -> Unit) {
    AppPanel {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            )
            Text(
                text = hint,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
private fun DeleteTaskConfirmationDialog(
    task: Task,
    strings: TaskBridgeStrings,
    languageCode: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(strings.delete) },
        text = { Text(getDeleteConfirmationMessage(task.title, languageCode)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(strings.delete) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(strings.cancel) }
        },
    )
}

@Composable
private fun PurgeTaskConfirmationDialog(
    task: Task,
    strings: TaskBridgeStrings,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(strings.purge) },
        text = { Text(strings.purgeConfirm.format(task.title)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(strings.purge) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(strings.cancel) }
        },
    )
}

@Composable
private fun PurgeSelectedTasksConfirmationDialog(
    count: Int,
    strings: TaskBridgeStrings,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(strings.deleteSelectedPermanentlyTitle) },
        text = {
            Text(strings.deleteSelectedPermanentlyMessage.format(count))
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(strings.deletePermanently) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(strings.cancel) }
        },
    )
}

@Composable
private fun ConflictActionConfirmationDialog(
    task: Task,
    action: ConflictAction,
    strings: TaskBridgeStrings,
    languageCode: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val confirmText = when (action) {
        ConflictAction.UseCloud -> strings.keepServerVersion
        ConflictAction.OverwriteCloud -> strings.keepDeviceVersion
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(strings.conflict) },
        text = { Text(getConflictConfirmationMessage(task.title, action, languageCode)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirmText) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(strings.cancel) }
        },
    )
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
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
    onRestoreDeleted: () -> Unit,
    onDelete: () -> Unit,
    onPurge: () -> Unit = {},
    onOpen: () -> Unit,
    onEdit: () -> Unit,
    selected: Boolean = false,
    onSelectionChange: (Boolean) -> Unit = {},
    now: Instant,
    languageCode: String,
    isTrash: Boolean = false,
) {
    val isOverdue = task.isOverdueAt(now, displayTimeZone)
    val borderColor = if (isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant
    val showCompletionControl = !isTrash
    val showLeadingControl = showCompletionControl || isTrash
    var moreMenuExpanded by remember { mutableStateOf(false) }
    val actionsLabel = if (languageCode == "en-US") "Actions" else "操作"
    val adjustPlanSectionLabel = if (languageCode == "en-US") "Adjust plan" else "调整计划"
    val resolveConflictSectionLabel = if (languageCode == "en-US") "Resolve conflict" else "解决冲突"
    val dangerSectionLabel = if (languageCode == "en-US") "Danger zone" else "危险操作"
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
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
                if (isTrash) {
                    Checkbox(
                        checked = selected,
                        onCheckedChange = onSelectionChange,
                    )
                } else if (showCompletionControl) {
                    Checkbox(
                        checked = task.status == TaskStatus.Completed,
                        onCheckedChange = { checked ->
                            if (checked) {
                                onComplete()
                            } else {
                                onUndoComplete()
                            }
                        },
                    )
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = if (showLeadingControl) 6.dp else 0.dp),
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
                    TaskMetaChips(
                        chips = taskMetaChips(task, strings, displayTimeZone, now, languageCode),
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            if (task.syncStatus == SyncStatus.Conflict) {
                ConflictSnapshotSummary(task = task, languageCode = languageCode)
            }
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = if (showLeadingControl) 42.dp else 0.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                if (isTrash) {
                    TextButton(onClick = onRestoreDeleted) { Text(strings.restore) }
                    TextButton(onClick = onPurge) { Text(strings.purge) }
                } else {
                    TextButton(onClick = { moreMenuExpanded = true }) { Text(actionsLabel) }
                }
                DropdownMenu(
                    expanded = moreMenuExpanded,
                    onDismissRequest = { moreMenuExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text(strings.edit) },
                        onClick = {
                            moreMenuExpanded = false
                            onEdit()
                        },
                    )
                    if (task.status == TaskStatus.Completed) {
                        DropdownMenuItem(
                            text = { Text(strings.restore) },
                            onClick = {
                                moreMenuExpanded = false
                                onUndoComplete()
                            },
                        )
                    } else {
                        DropdownMenuSectionLabel(adjustPlanSectionLabel)
                        DropdownMenuItem(
                            text = { Text(strings.today) },
                            onClick = {
                                moreMenuExpanded = false
                                onPlanToday()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(strings.tomorrow) },
                            onClick = {
                                moreMenuExpanded = false
                                onPostpone()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(strings.snoozeOneHour) },
                            onClick = {
                                moreMenuExpanded = false
                                onSnooze()
                            },
                        )
                    }
                    if (task.syncStatus == SyncStatus.Conflict) {
                        HorizontalDivider()
                        DropdownMenuSectionLabel(resolveConflictSectionLabel)
                        DropdownMenuItem(
                            text = { Text(strings.keepServerVersion) },
                            enabled = !task.conflictServerJson.isNullOrBlank(),
                            onClick = {
                                moreMenuExpanded = false
                                onUseServer()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(strings.keepDeviceVersion) },
                            onClick = {
                                moreMenuExpanded = false
                                onOverwriteServer()
                            },
                        )
                    }
                    HorizontalDivider()
                    DropdownMenuSectionLabel(dangerSectionLabel)
                    DropdownMenuItem(
                        text = { Text(strings.delete) },
                        onClick = {
                            moreMenuExpanded = false
                            onDelete()
                        },
                    )
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun TaskMetaChips(
    chips: List<TaskMetaChip>,
    modifier: Modifier = Modifier,
) {
    if (chips.isEmpty()) return

    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        chips.forEach { chip ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = if (chip.attention) {
                    MaterialTheme.colorScheme.errorContainer
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f)
                },
                contentColor = if (chip.attention) {
                    MaterialTheme.colorScheme.onErrorContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            ) {
                Text(
                    text = chip.text,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

@Composable
private fun DropdownMenuSectionLabel(label: String) {
    Text(
        text = label,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ConflictSnapshotSummary(task: Task, languageCode: String) {
    val detailRows = conflictSnapshotDetailRows(task, languageCode)
    val fallbackText = conflictSnapshotDetailText(task, languageCode) ?: if (languageCode == "en-US") {
        "Differences: no displayable field differences were detected. Use the version details to choose which version to keep."
    } else {
        "差异：未检测到可展示的字段差异，请根据两侧版本信息选择保留哪一版。"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 48.dp, top = 2.dp, bottom = 2.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ConflictSnapshotComparison(
            task = task,
            detailRows = detailRows,
            languageCode = languageCode,
        )
        if (detailRows.isEmpty()) {
            Text(
                text = fallbackText,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ConflictSnapshotComparison(
    task: Task,
    detailRows: List<ConflictSnapshotDiff>,
    languageCode: String,
) {
    val localTitle = conflictSnapshotTitle(task.conflictLocalJson) ?: task.title
    val cloudTitle = conflictSnapshotTitle(task.conflictServerJson)
    val localLabel = if (languageCode == "en-US") "This device" else "这台设备"
    val cloudLabel = if (languageCode == "en-US") "Synced version" else "同步来的版本"
    val missingCloud = if (languageCode == "en-US") {
        "Synced version preview is unavailable"
    } else {
        "同步来的版本暂不可预览"
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ConflictSnapshotCard(
            label = localLabel,
            title = localTitle,
            rows = detailRows.map { it.label to it.localValue },
            modifier = Modifier.fillMaxWidth(),
        )
        ConflictSnapshotCard(
            label = cloudLabel,
            title = cloudTitle ?: missingCloud,
            rows = detailRows.map { it.label to it.cloudValue },
            muted = cloudTitle == null,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ConflictSnapshotCard(
    label: String,
    title: String,
    rows: List<Pair<String, String>>,
    modifier: Modifier = Modifier,
    muted: Boolean = false,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (muted) 0.36f else 0.52f),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            rows.forEach { (rowLabel, value) ->
                Text(
                    text = "$rowLabel: ${value.ifBlank { "-" }}",
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun activeTaskFilterLabels(
    todayOnly: Boolean,
    searchQuery: String,
    filter: TaskListFilter,
    strings: TaskBridgeStrings,
): List<String> {
    val keyword = searchQuery.trim()
    return buildList {
        if (todayOnly) {
            add("${strings.viewPrefix}: ${strings.today}")
        } else if (filter != TaskListFilter.All) {
            add("${strings.filterPrefix}: ${filter.localizedLabel(strings)}")
        }
        if (keyword.isNotEmpty()) {
            add("${strings.searchPrefix}: $keyword")
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
        TaskListFilter.Trash -> strings.trash
    }
}

private val primaryTaskListFilters = listOf(
    TaskListFilter.All,
    TaskListFilter.Overdue,
    TaskListFilter.Completed,
)

private val moreTaskListFilters = listOf(
    TaskListFilter.Inbox,
    TaskListFilter.Week,
    TaskListFilter.HighPriority,
    TaskListFilter.PendingSync,
    TaskListFilter.Conflict,
    TaskListFilter.Templates,
    TaskListFilter.Trash,
)

private fun combinedTaskListFilterOptions(strings: TaskBridgeStrings): List<AppUiOption<TaskListFilter>> {
    return (primaryTaskListFilters + moreTaskListFilters)
        .distinct()
        .map { AppUiOption(it, it.localizedLabel(strings)) }
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
        TaskListFilter.Trash -> this
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

private fun taskMetaChips(
    task: Task,
    strings: TaskBridgeStrings,
    displayTimeZone: String,
    now: Instant,
    languageCode: String,
): List<TaskMetaChip> {
    return buildList {
        if (task.isOverdueAt(now, displayTimeZone)) {
            add(TaskMetaChip(strings.overdue, attention = true))
        }
        task.project?.takeIf { it.isNotBlank() }?.let { add(TaskMetaChip("${strings.project} $it")) }
        task.tag?.takeIf { it.isNotBlank() }?.let { add(TaskMetaChip("#$it")) }
        task.plannedDate?.let { add(TaskMetaChip("${strings.plan} $it")) }
        task.dueTime?.let { add(TaskMetaChip("${strings.due} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}")) }
        task.snoozedUntil?.let { add(TaskMetaChip("${strings.snooze} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}")) }
        if (task.priority > 0) {
            add(TaskMetaChip("${strings.priority} ${getTaskPriorityLabel(task.priority, languageCode)}"))
        }
        getSyncStatusLabel(task.syncStatus, languageCode)?.let {
            add(TaskMetaChip(it, attention = task.syncStatus != SyncStatus.Synced))
        }
    }
}

private fun Task.dueLocalDate(displayTimeZone: String): LocalDate? {
    return dueTime?.let {
        runCatching {
            ShanghaiTime.localDate(it, displayTimeZone)
        }.getOrNull()
    }
}

private fun conflictSnapshotTitle(value: String?): String? {
    if (value.isNullOrBlank()) return null
    return runCatching {
        JSONObject(value).optString("title").trim().takeIf { it.isNotBlank() }
    }.getOrNull()
}

private fun conflictSnapshotDetailText(task: Task, languageCode: String): String? {
    val differences = conflictSnapshotDetailRows(task, languageCode)
    if (differences.isEmpty()) return null
    val prefix = if (languageCode == "en-US") "Differences" else "差异"
    return "$prefix: ${differences.joinToString("；") { it.label }}"
}

private fun conflictSnapshotDetailRows(task: Task, languageCode: String): List<ConflictSnapshotDiff> {
    val local = conflictSnapshotJson(task.conflictLocalJson)
    val cloud = conflictSnapshotJson(task.conflictServerJson)
    if (local == null && cloud == null) return emptyList()
    val isEnglish = languageCode == "en-US"
    val fields = listOf(
        ConflictSnapshotField(if (isEnglish) "Content" else "内容", listOf("content")),
        ConflictSnapshotField(if (isEnglish) "Due" else "截止", listOf("due_time", "dueTime")),
        ConflictSnapshotField(if (isEnglish) "Plan" else "计划", listOf("planned_date", "plannedDate")),
        ConflictSnapshotField(if (isEnglish) "Reminder" else "提醒", listOf("remind_time", "remindTime")),
        ConflictSnapshotField(if (isEnglish) "Repeat" else "重复", listOf("repeat_rule", "repeatRule"), "repeat"),
        ConflictSnapshotField(if (isEnglish) "Tag" else "标签", listOf("tag")),
        ConflictSnapshotField(if (isEnglish) "Project" else "项目", listOf("project")),
        ConflictSnapshotField(if (isEnglish) "Checklist" else "清单", listOf("checklist", "checklistJson"), "checklist"),
    )
    return fields.mapNotNull { field ->
        val localValue = snapshotConflictFieldValue(local, field, languageCode)
        val cloudValue = snapshotConflictFieldValue(cloud, field, languageCode)
        if (localValue == cloudValue || (localValue.isBlank() && cloudValue.isBlank())) {
            null
        } else {
            ConflictSnapshotDiff(field.label, localValue, cloudValue)
        }
    }
}

private fun conflictSnapshotJson(value: String?): JSONObject? {
    if (value.isNullOrBlank()) return null
    return runCatching { JSONObject(value) }.getOrNull()
}

private fun snapshotString(snapshot: JSONObject?, keys: List<String>): String {
    if (snapshot == null) return ""
    return keys.firstNotNullOfOrNull { key ->
        snapshot.optString(key).trim().takeIf { it.isNotBlank() }
    }.orEmpty()
}

private fun snapshotConflictFieldValue(
    snapshot: JSONObject?,
    field: ConflictSnapshotField,
    languageCode: String,
): String {
    return when (field.type) {
        "checklist" -> snapshotChecklistSummary(snapshot, field.keys)
        "repeat" -> getTaskRepeatRuleLabel(snapshotString(snapshot, field.keys), languageCode).orEmpty()
        else -> snapshotString(snapshot, field.keys)
    }
}

private fun snapshotChecklistSummary(snapshot: JSONObject?, keys: List<String>): String {
    if (snapshot == null) return ""
    keys.forEach { key ->
        val array = snapshot.optJSONArray(key)
        if (array != null) return "${array.length()} 项"
        val raw = snapshot.optString(key)
        if (raw.isNotBlank()) {
            runCatching { org.json.JSONArray(raw) }
                .getOrNull()
                ?.let { return "${it.length()} 项" }
        }
    }
    return ""
}

private fun getConflictConfirmationMessage(title: String, action: ConflictAction, languageCode: String): String {
    val taskTitle = if (title.isBlank()) {
        if (languageCode == "en-US") "this task" else "这条任务"
    } else {
        if (languageCode == "en-US") "\"$title\"" else "「$title」"
    }
    return if (languageCode == "en-US") {
        when (action) {
            ConflictAction.UseCloud ->
                "Keep the synced version for $taskTitle? This discards the changes currently saved on this device."
            ConflictAction.OverwriteCloud ->
                "Keep this device's version for $taskTitle? Other devices will receive this version after sync."
        }
    } else {
        when (action) {
            ConflictAction.UseCloud ->
                "确认保留 $taskTitle 同步来的版本？这会放弃当前保存在这台设备上的修改。"
            ConflictAction.OverwriteCloud ->
                "确认保留 $taskTitle 在这台设备上的版本？同步后其他设备会看到这个版本。"
        }
    }
}
