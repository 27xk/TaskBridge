package com.taskbridge.app.ui.editor

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppDynamicStatusText
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.AppUiOption
import com.taskbridge.app.ui.components.repeatRuleOptions
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.ui.i18n.TaskBridgeStrings
import com.taskbridge.app.ui.task.getTaskPriorityLabel
import com.taskbridge.app.ui.task.getTaskPriorityOptions
import com.taskbridge.app.notification.shouldRequestReminderPermission
import com.taskbridge.app.utils.ShanghaiTime
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Composable
fun EditorScreen(
    viewModel: EditorViewModel,
    displayTimeZone: String,
    onRequestNotificationPermission: () -> Unit = {},
    onSaved: () -> Unit,
    onCancel: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val strings = LocalTaskBridgeStrings.current
    val language = LocalAppLanguage.current
    val context = LocalContext.current
    val isEnglish = language == AppLanguage.English
    var arrangeOpen by remember(state.editingLocalId) {
        mutableStateOf(state.editingLocalId != null && hasArrangementFields(state))
    }
    var bodyOpen by remember(state.editingLocalId) {
        mutableStateOf(state.editingLocalId != null && hasTaskBodyFields(state))
    }
    var advancedOpen by remember(state.editingLocalId) {
        mutableStateOf(state.editingLocalId != null && hasAdvancedMetadataFields(state))
    }
    var listMenuOpen by remember { mutableStateOf(false) }
    var priorityMenuOpen by remember { mutableStateOf(false) }
    var repeatMenuOpen by remember { mutableStateOf(false) }
    var confirmDiscardChanges by remember { mutableStateOf(false) }
    val priorityOptions = remember(language) {
        getTaskPriorityOptions(language.code).map { (value, label) -> AppUiOption(value, label) }
    }
    val listOptions = remember(language) {
        listOf(
            AppUiOption("inbox", strings.inbox),
            AppUiOption("today", strings.today),
        )
    }
    val selectedListLabel = listOptions.firstOrNull { it.value == state.listType }?.label ?: strings.inbox
    val selectedPriorityLabel = getTaskPriorityLabel(state.priority.toIntOrNull() ?: 0, language.code)
    val quickPreviewChips = remember(state.editingLocalId, state.title, displayTimeZone, language) {
        if (state.editingLocalId == null) {
            buildQuickAddPreviewChips(
                title = state.title,
                timeZoneId = displayTimeZone,
                languageCode = language.code,
            )
        } else {
            emptyList()
        }
    }
    val repeatOptions = remember(isEnglish) { repeatRuleOptions(isEnglish) }
    val selectedRepeatLabel = repeatOptions.firstOrNull { it.value == state.repeatRule }?.label
        ?: state.repeatRule.ifBlank { repeatOptions.first().label }
    val scheduleHelpMessage = strings.taskScheduleHelp
    fun pickPlannedDate() {
        showDatePicker(
            context = context,
            currentValue = state.plannedDate,
            onPicked = viewModel::updatePlannedDate,
        )
    }
    fun pickDueTime() {
        showDateTimePicker(
            context = context,
            currentValue = state.dueTime,
            timeZoneId = displayTimeZone,
            onPicked = viewModel::updateDueTime,
        )
    }
    fun pickReminder() {
        onRequestNotificationPermission()
        showDateTimePicker(
            context = context,
            currentValue = state.remindTime,
            timeZoneId = displayTimeZone,
            onPicked = viewModel::updateRemindTime,
        )
    }
    fun requestCancel() {
        if (state.hasUnsavedChanges) {
            confirmDiscardChanges = true
        } else {
            viewModel.discardDraft()
            onCancel()
        }
    }

    BackHandler {
        requestCancel()
    }

    if (confirmDiscardChanges) {
        AlertDialog(
            onDismissRequest = { confirmDiscardChanges = false },
            title = { Text(if (isEnglish) "Discard changes?" else "放弃未保存的修改？") },
            text = {
                Text(
                    if (isEnglish) {
                        "Your current task edits have not been saved."
                    } else {
                        "当前任务修改尚未保存。"
                    },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDiscardChanges = false
                        viewModel.discardDraft()
                        onCancel()
                    },
                ) {
                    Text(if (isEnglish) "Discard" else "放弃修改")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDiscardChanges = false }) {
                    Text(if (isEnglish) "Keep editing" else "继续编辑")
                }
            },
        )
    }

    AppPage(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
            bottomBar = {
                EditorBottomActions(
                    strings = strings,
                    isEnglish = isEnglish,
                    isLoadingTask = state.isLoadingTask,
                    isSaving = state.isSaving,
                    onSave = {
                        if (shouldRequestReminderPermission(state.remindTime, state.dueTime)) {
                            onRequestNotificationPermission()
                        }
                        viewModel.save(onSaved)
                    },
                    onCancel = { requestCancel() },
                )
            },
        ) { contentPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(contentPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                AppHeader(
                    title = if (state.editingLocalId == null) strings.addTask else strings.edit,
                    subtitle = strings.autoFillHint,
                )

                AppPanel {
                    OutlinedTextField(
                        value = state.title,
                        onValueChange = viewModel::updateTitle,
                        label = { Text(strings.quickAddLabel) },
                        placeholder = { Text(strings.quickAddPlaceholder) },
                        isError = state.error != null,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    QuickAddPreviewChips(chips = quickPreviewChips)
                }

                TextButton(onClick = { bodyOpen = !bodyOpen }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (bodyOpen) strings.taskHideBodyDetails else strings.taskBodyDetails)
                }

                if (bodyOpen) {
                    BodyTaskFieldsPanel(
                        state = state,
                        strings = strings,
                        onContentChanged = viewModel::updateContent,
                        onChecklistChanged = viewModel::updateChecklistText,
                    )
                }

                TextButton(onClick = { arrangeOpen = !arrangeOpen }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (arrangeOpen) strings.taskHideArrangementSettings else strings.taskArrangementSettings)
                }

                if (arrangeOpen) {
                    ArrangementTaskFieldsPanel(
                        state = state,
                        strings = strings,
                        displayTimeZone = displayTimeZone,
                        selectedListLabel = selectedListLabel,
                        listOptions = listOptions,
                        listMenuOpen = listMenuOpen,
                        onListExpandedChange = { listMenuOpen = it },
                        onListSelected = viewModel::updateListType,
                        selectedPriorityLabel = selectedPriorityLabel,
                        priorityOptions = priorityOptions,
                        priorityMenuOpen = priorityMenuOpen,
                        onPriorityExpandedChange = { priorityMenuOpen = it },
                        onPrioritySelected = viewModel::updatePriority,
                        onPickPlannedDate = { pickPlannedDate() },
                        onClearPlannedDate = { viewModel.updatePlannedDate("") },
                        onPickDueTime = { pickDueTime() },
                        onClearDueTime = { viewModel.updateDueTime("") },
                        onPickReminder = { pickReminder() },
                        onClearReminder = { viewModel.updateRemindTime("") },
                        scheduleHelpText = scheduleHelpMessage,
                        isEnglish = isEnglish,
                    )
                }

                TextButton(onClick = { advancedOpen = !advancedOpen }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (advancedOpen) strings.hideSettings else strings.moreSettings)
                }

                if (advancedOpen) {
                    AdvancedTaskFieldsPanel(
                        state = state,
                        strings = strings,
                        selectedRepeatLabel = selectedRepeatLabel,
                        repeatOptions = repeatOptions,
                        repeatMenuOpen = repeatMenuOpen,
                        onRepeatExpandedChange = { repeatMenuOpen = it },
                        onTagChanged = viewModel::updateTag,
                        onProjectChanged = viewModel::updateProject,
                        onRepeatSelected = viewModel::updateRepeatRule,
                        onTemplateChanged = viewModel::updateIsTemplate,
                        onTemplateNameChanged = viewModel::updateTemplateName,
                    )
                }

                state.error?.let {
                    AppDynamicStatusText(
                        text = localizeEditorError(it, strings),
                        isError = true,
                    )
                }
            }
        }
    }
}

@Composable
private fun EditorBottomActions(
    strings: TaskBridgeStrings,
    isEnglish: Boolean,
    isLoadingTask: Boolean,
    isSaving: Boolean,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 3.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onCancel, modifier = Modifier.weight(1f)) {
                Text(strings.cancel)
            }
            Button(
                onClick = onSave,
                enabled = !isSaving && !isLoadingTask,
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    if (isSaving) {
                        if (isEnglish) "Saving..." else "正在保存..."
                    } else {
                        strings.saveTask
                    },
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun QuickAddPreviewChips(chips: List<String>) {
    if (chips.isEmpty()) return
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        chips.forEach { chip ->
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            ) {
                Text(
                    text = chip,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

@Composable
private fun BodyTaskFieldsPanel(
    state: EditorUiState,
    strings: TaskBridgeStrings,
    onContentChanged: (String) -> Unit,
    onChecklistChanged: (String) -> Unit,
) {
    AppPanel {
        OutlinedTextField(
            value = state.content,
            onValueChange = onContentChanged,
            label = { Text(strings.content) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
        )
        OutlinedTextField(
            value = state.checklistText,
            onValueChange = onChecklistChanged,
            label = { Text(strings.checklist) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
        )
    }
}

@Composable
private fun ArrangementTaskFieldsPanel(
    state: EditorUiState,
    strings: TaskBridgeStrings,
    displayTimeZone: String,
    selectedListLabel: String,
    listOptions: List<AppUiOption<String>>,
    listMenuOpen: Boolean,
    onListExpandedChange: (Boolean) -> Unit,
    onListSelected: (String) -> Unit,
    selectedPriorityLabel: String,
    priorityOptions: List<AppUiOption<String>>,
    priorityMenuOpen: Boolean,
    onPriorityExpandedChange: (Boolean) -> Unit,
    onPrioritySelected: (String) -> Unit,
    onPickPlannedDate: () -> Unit,
    onClearPlannedDate: () -> Unit,
    onPickDueTime: () -> Unit,
    onClearDueTime: () -> Unit,
    onPickReminder: () -> Unit,
    onClearReminder: () -> Unit,
    scheduleHelpText: String,
    isEnglish: Boolean,
) {
    AppPanel {
        AppDropdownField(
            label = strings.list,
            selectedLabel = selectedListLabel,
            expanded = listMenuOpen,
            options = listOptions,
            onExpandedChange = onListExpandedChange,
            onSelect = onListSelected,
        )
        AppDropdownField(
            label = strings.priority,
            selectedLabel = selectedPriorityLabel,
            expanded = priorityMenuOpen,
            options = priorityOptions,
            onExpandedChange = onPriorityExpandedChange,
            onSelect = onPrioritySelected,
        )
        DateTimeActionRow(
            label = strings.plan,
            value = state.plannedDate,
            emptyLabel = if (isEnglish) "Pick plan date" else "选择计划日期",
            clearLabel = if (isEnglish) "Clear" else "清除",
            onPick = onPickPlannedDate,
            onClear = onClearPlannedDate,
        )
        DateTimeActionRow(
            label = "${strings.dueTime} ($displayTimeZone)",
            value = state.dueTime,
            emptyLabel = if (isEnglish) "Pick due time" else "选择截止时间",
            clearLabel = if (isEnglish) "Clear" else "清除",
            onPick = onPickDueTime,
            onClear = onClearDueTime,
        )
        DateTimeActionRow(
            label = "${strings.remindTime} ($displayTimeZone)",
            value = state.remindTime,
            emptyLabel = if (isEnglish) "Pick reminder" else "选择提醒时间",
            clearLabel = if (isEnglish) "Clear" else "清除",
            onPick = onPickReminder,
            onClear = onClearReminder,
        )
        Text(
            text = scheduleHelpText,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun DateTimeActionRow(
    label: String,
    value: String,
    emptyLabel: String,
    clearLabel: String,
    onPick: () -> Unit,
    onClear: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(
                onClick = onPick,
                modifier = Modifier.weight(1f),
            ) {
                Text(value.ifBlank { emptyLabel })
            }
            if (value.isNotBlank()) {
                TextButton(onClick = onClear) {
                    Text(clearLabel)
                }
            }
        }
    }
}

@Composable
private fun AdvancedTaskFieldsPanel(
    state: EditorUiState,
    strings: TaskBridgeStrings,
    selectedRepeatLabel: String,
    repeatOptions: List<AppUiOption<String>>,
    repeatMenuOpen: Boolean,
    onRepeatExpandedChange: (Boolean) -> Unit,
    onTagChanged: (String) -> Unit,
    onProjectChanged: (String) -> Unit,
    onRepeatSelected: (String) -> Unit,
    onTemplateChanged: (Boolean) -> Unit,
    onTemplateNameChanged: (String) -> Unit,
) {
    AppPanel {
        OutlinedTextField(
            value = state.tag,
            onValueChange = onTagChanged,
            label = { Text(strings.tag) },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.project,
            onValueChange = onProjectChanged,
            label = { Text(strings.project) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        AppDropdownField(
            label = strings.repeatRule,
            selectedLabel = selectedRepeatLabel,
            expanded = repeatMenuOpen,
            options = repeatOptions,
            onExpandedChange = onRepeatExpandedChange,
            onSelect = onRepeatSelected,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = state.isTemplate,
                onCheckedChange = onTemplateChanged,
            )
            Text(strings.saveAsTemplate, modifier = Modifier.padding(start = 4.dp))
        }
        if (state.isTemplate) {
            OutlinedTextField(
                value = state.templateName,
                onValueChange = onTemplateNameChanged,
                label = { Text(strings.templateName) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private val editorDateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

private fun hasArrangementFields(state: EditorUiState): Boolean {
    return state.listType != "inbox" ||
        state.priority.toIntOrNull()?.let { it > 0 } == true ||
        state.plannedDate.isNotBlank() ||
        state.dueTime.isNotBlank() ||
        state.remindTime.isNotBlank()
}

private fun hasTaskBodyFields(state: EditorUiState): Boolean {
    return state.content.isNotBlank() || state.checklistText.isNotBlank()
}

private fun hasAdvancedMetadataFields(state: EditorUiState): Boolean {
    return state.tag.isNotBlank() ||
        state.project.isNotBlank() ||
        state.repeatRule.isNotBlank() ||
        state.isTemplate ||
        state.templateName.isNotBlank()
}

private fun showDatePicker(
    context: android.content.Context,
    currentValue: String,
    onPicked: (String) -> Unit,
) {
    val initial = currentValue
        .takeIf { it.isNotBlank() }
        ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        ?: LocalDate.now()

    DatePickerDialog(
        context,
        { _, year, month, day ->
            onPicked(LocalDate.of(year, month + 1, day).toString())
        },
        initial.year,
        initial.monthValue - 1,
        initial.dayOfMonth,
    ).show()
}

private fun showDateTimePicker(
    context: android.content.Context,
    currentValue: String,
    timeZoneId: String,
    onPicked: (String) -> Unit,
) {
    val zone = ShanghaiTime.zone(timeZoneId)
    val initial = ShanghaiTime.inputToInstantText(currentValue, timeZoneId)
        ?.let { runCatching { Instant.parse(it).atZone(zone).toLocalDateTime() }.getOrNull() }
        ?: LocalDateTime.now(zone)

    DatePickerDialog(
        context,
        { _, year, month, day ->
            TimePickerDialog(
                context,
                { _, hour, minute ->
                    val picked = LocalDateTime.of(year, month + 1, day, hour, minute)
                    onPicked(editorDateTimeFormatter.format(picked))
                },
                initial.hour,
                initial.minute,
                true,
            ).show()
        },
        initial.year,
        initial.monthValue - 1,
        initial.dayOfMonth,
    ).show()
}

private fun localizeEditorError(error: String, strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings): String {
    return when (error) {
        "Title is required." -> strings.titleRequired
        "Invalid planned date." -> if (strings.chinese == "中文") "计划日期请选择有效日期。" else "Choose a valid plan date."
        "Invalid time." -> strings.invalidTime
        else -> error
    }
}
