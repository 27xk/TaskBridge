package com.taskbridge.app.ui.editor

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings

@Composable
fun EditorScreen(
    viewModel: EditorViewModel,
    onSaved: () -> Unit,
    onCancel: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val strings = LocalTaskBridgeStrings.current
    var advancedOpen by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(strings.addTask, style = MaterialTheme.typography.headlineMedium)
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
            OutlinedTextField(
                value = state.priority,
                onValueChange = viewModel::updatePriority,
                label = { Text(strings.priority) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
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
                label = { Text(strings.dueTime) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.repeatRule,
                onValueChange = viewModel::updateRepeatRule,
                label = { Text(strings.repeatRule) },
                modifier = Modifier.fillMaxWidth(),
            )
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

private fun localizeEditorError(error: String, strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings): String {
    return when (error) {
        "Title is required." -> strings.titleRequired
        else -> error
    }
}
