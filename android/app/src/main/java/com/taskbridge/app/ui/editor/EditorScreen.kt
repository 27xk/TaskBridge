package com.taskbridge.app.ui.editor

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
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
    val context = LocalContext.current
    var advancedOpen by remember(state.editingLocalId) { mutableStateOf(state.editingLocalId != null) }
    var priorityMenuOpen by remember { mutableStateOf(false) }
    var repeatMenuOpen by remember { mutableStateOf(false) }
    val priorityOptions = remember { (0..5).map { it.toString() } }
    val repeatOptions = remember {
        listOf(
            "" to "不重复",
            "daily" to "每天",
            "weekly" to "每周",
            "monthly" to "每月",
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(
            text = if (state.editingLocalId == null) strings.addTask else strings.edit,
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = state.title,
            onValueChange = viewModel::updateTitle,
            label = { Text(strings.quickAddLabel) },
            placeholder = { Text(strings.quickAddPlaceholder) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = strings.autoFillHint,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.content,
            onValueChange = viewModel::updateContent,
            label = { Text(strings.content) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
        )
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = { advancedOpen = !advancedOpen }) {
            Text(if (advancedOpen) strings.hideSettings else strings.moreSettings)
        }
        if (advancedOpen) {
            Column {
                OutlinedButton(
                    onClick = { priorityMenuOpen = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("${strings.priority}: ${state.priority.ifBlank { "0" }}")
                }
                DropdownMenu(
                    expanded = priorityMenuOpen,
                    onDismissRequest = { priorityMenuOpen = false },
                ) {
                    priorityOptions.forEach { value ->
                        DropdownMenuItem(
                            text = { Text(value) },
                            onClick = {
                                viewModel.updatePriority(value)
                                priorityMenuOpen = false
                            },
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.tag,
                onValueChange = viewModel::updateTag,
                label = { Text(strings.tag) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.dueTime,
                onValueChange = viewModel::updateDueTime,
                label = { Text("${strings.dueTime} ($displayTimeZone)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(modifier = Modifier.fillMaxWidth()) {
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
                    Text("选择截止时间")
                }
                TextButton(onClick = { viewModel.updateDueTime("") }) {
                    Text("清除")
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.remindTime,
                onValueChange = viewModel::updateRemindTime,
                label = { Text("${strings.remindTime} ($displayTimeZone)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(modifier = Modifier.fillMaxWidth()) {
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
                    Text("选择提醒时间")
                }
                TextButton(onClick = { viewModel.updateRemindTime("") }) {
                    Text("清除")
                }
            }
            Spacer(Modifier.height(12.dp))
            Column {
                OutlinedButton(
                    onClick = { repeatMenuOpen = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("${strings.repeatRule}：${repeatOptions.firstOrNull { it.first == state.repeatRule }?.second ?: state.repeatRule.ifBlank { "不重复" }}")
                }
                DropdownMenu(
                    expanded = repeatMenuOpen,
                    onDismissRequest = { repeatMenuOpen = false },
                ) {
                    repeatOptions.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = {
                                viewModel.updateRepeatRule(value)
                                repeatMenuOpen = false
                            },
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row {
                Checkbox(
                    checked = state.isTemplate,
                    onCheckedChange = viewModel::updateIsTemplate,
                )
                Text(strings.saveAsTemplate, modifier = Modifier.padding(top = 12.dp))
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
        state.error?.let {
            Spacer(Modifier.height(10.dp))
            Text(localizeEditorError(it, strings), color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(20.dp))
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
