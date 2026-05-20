package com.taskbridge.app.ui.editor

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.AppUiOption
import com.taskbridge.app.ui.components.repeatRuleOptions
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
import java.time.Instant
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Composable
fun EditorScreen(
    viewModel: EditorViewModel,
    displayTimeZone: String,
    onSaved: () -> Unit,
    onCancel: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val strings = LocalTaskBridgeStrings.current
    val language = LocalAppLanguage.current
    val context = LocalContext.current
    val isEnglish = language == AppLanguage.English
    var advancedOpen by remember(state.editingLocalId) { mutableStateOf(state.editingLocalId != null) }
    var priorityMenuOpen by remember { mutableStateOf(false) }
    var repeatMenuOpen by remember { mutableStateOf(false) }
    val priorityOptions = remember { (0..5).map { AppUiOption(it.toString(), it.toString()) } }
    val repeatOptions = remember(isEnglish) { repeatRuleOptions(isEnglish) }
    val selectedRepeatLabel = repeatOptions.firstOrNull { it.value == state.repeatRule }?.label
        ?: state.repeatRule.ifBlank { repeatOptions.first().label }

    AppPage(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
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
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.content,
                    onValueChange = viewModel::updateContent,
                    label = { Text(strings.content) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                )
            }

            TextButton(onClick = { advancedOpen = !advancedOpen }, modifier = Modifier.fillMaxWidth()) {
                Text(if (advancedOpen) strings.hideSettings else strings.moreSettings)
            }

            if (advancedOpen) {
                AppPanel {
                    AppDropdownField(
                        label = strings.priority,
                        selectedLabel = state.priority.ifBlank { "0" },
                        expanded = priorityMenuOpen,
                        options = priorityOptions,
                        onExpandedChange = { priorityMenuOpen = it },
                        onSelect = viewModel::updatePriority,
                    )
                    OutlinedTextField(
                        value = state.tag,
                        onValueChange = viewModel::updateTag,
                        label = { Text(strings.tag) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.dueTime,
                        onValueChange = viewModel::updateDueTime,
                        label = { Text("${strings.dueTime} ($displayTimeZone)") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = {
                                showDateTimePicker(
                                    context = context,
                                    currentValue = state.dueTime,
                                    timeZoneId = displayTimeZone,
                                    onPicked = viewModel::updateDueTime,
                                )
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(if (isEnglish) "Pick due time" else "选择截止时间")
                        }
                        TextButton(onClick = { viewModel.updateDueTime("") }) {
                            Text(if (isEnglish) "Clear" else "清除")
                        }
                    }
                    OutlinedTextField(
                        value = state.remindTime,
                        onValueChange = viewModel::updateRemindTime,
                        label = { Text("${strings.remindTime} ($displayTimeZone)") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = {
                                showDateTimePicker(
                                    context = context,
                                    currentValue = state.remindTime,
                                    timeZoneId = displayTimeZone,
                                    onPicked = viewModel::updateRemindTime,
                                )
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(if (isEnglish) "Pick reminder" else "选择提醒时间")
                        }
                        TextButton(onClick = { viewModel.updateRemindTime("") }) {
                            Text(if (isEnglish) "Clear" else "清除")
                        }
                    }
                    AppDropdownField(
                        label = strings.repeatRule,
                        selectedLabel = selectedRepeatLabel,
                        expanded = repeatMenuOpen,
                        options = repeatOptions,
                        onExpandedChange = { repeatMenuOpen = it },
                        onSelect = viewModel::updateRepeatRule,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = state.isTemplate,
                            onCheckedChange = viewModel::updateIsTemplate,
                        )
                        Text(strings.saveAsTemplate, modifier = Modifier.padding(start = 4.dp))
                    }
                    if (state.isTemplate) {
                        OutlinedTextField(
                            value = state.templateName,
                            onValueChange = viewModel::updateTemplateName,
                            label = { Text(strings.templateName) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            state.error?.let {
                Text(localizeEditorError(it, strings), color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = { viewModel.save(onSaved) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(strings.saveTask)
            }
            TextButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                Text(strings.cancel)
            }
        }
    }
}

private val editorDateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

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
        "Invalid time." -> strings.invalidTime
        else -> error
    }
}
