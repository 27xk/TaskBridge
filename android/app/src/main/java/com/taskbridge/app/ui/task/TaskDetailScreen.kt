package com.taskbridge.app.ui.task

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

private val detailGson = Gson()
private val detailChecklistType = object : TypeToken<List<UiChecklistItem>>() {}.type

private data class UiChecklistItem(
    val id: String,
    val title: String,
    val done: Boolean,
)

@Composable
fun TaskDetailScreen(
    taskRepository: TaskRepository,
    localId: String,
    onBack: () -> Unit,
    onAddClick: () -> Unit,
    onTaskChanged: () -> Unit,
) {
    var task by remember(localId) { mutableStateOf<Task?>(null) }
    var newChecklistTitle by remember(localId) { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(localId) {
        task = taskRepository.getTask(localId)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        TextButton(onClick = onBack) {
            Text("Back")
        }
        Spacer(Modifier.height(8.dp))

        val current = task
        if (current == null) {
            Text("Task not found", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Button(onClick = onAddClick, modifier = Modifier.fillMaxWidth()) {
                Text("Add task")
            }
        } else {
            Text(
                text = current.title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = if (current.status == TaskStatus.Completed) "Completed" else "Todo",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(16.dp))
            Text(current.content ?: "No content", style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(16.dp))
            Text(
                text = listOfNotNull(
                    current.project?.let { "Project $it" },
                    current.plannedDate?.let { "Plan $it" },
                    current.dueTime?.let { "Due $it" },
                    current.remindTime?.let { "Reminder $it" },
                    current.snoozedUntil?.let { "Snoozed $it" },
                    current.completedAt?.let { "Completed $it" },
                    current.tag?.let { "#$it" },
                    "List ${current.listType}",
                    "Priority ${current.priority}",
                ).joinToString("\n"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(16.dp))
            Text("Checklist", style = MaterialTheme.typography.titleMedium)
            val checklist = remember(current.checklistJson) {
                parseChecklist(current.checklistJson)
            }
            checklist.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth()) {
                    Checkbox(
                        checked = item.done,
                        onCheckedChange = {
                            scope.launch {
                                taskRepository.toggleChecklistItem(current.localId, item.id)
                                onTaskChanged()
                                task = taskRepository.getTask(localId)
                            }
                        },
                    )
                    Text(
                        text = item.title,
                        modifier = Modifier
                            .weight(1f)
                            .padding(top = 12.dp),
                    )
                    TextButton(
                        onClick = {
                            scope.launch {
                                taskRepository.deleteChecklistItem(current.localId, item.id)
                                onTaskChanged()
                                task = taskRepository.getTask(localId)
                            }
                        },
                    ) {
                        Text("Delete")
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = newChecklistTitle,
                    onValueChange = { newChecklistTitle = it },
                    label = { Text("New checklist item") },
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    onClick = {
                        val title = newChecklistTitle.trim()
                        if (title.isNotBlank()) {
                            scope.launch {
                                taskRepository.addChecklistItem(current.localId, title)
                                newChecklistTitle = ""
                                onTaskChanged()
                                task = taskRepository.getTask(localId)
                            }
                        }
                    },
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Text("Add")
                }
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    scope.launch {
                        if (current.status == TaskStatus.Completed) {
                            taskRepository.undoCompleteTask(current.localId)
                        } else {
                            taskRepository.completeTask(current.localId)
                        }
                        onTaskChanged()
                        task = taskRepository.getTask(localId)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (current.status == TaskStatus.Completed) "Restore" else "Complete")
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    scope.launch {
                        val tomorrow = LocalDate.now().plusDays(1)
                        val dueTime = tomorrow
                            .atTime(9, 0)
                            .atZone(ZoneId.systemDefault())
                            .toInstant()
                            .toString()
                        taskRepository.postponeTask(current.localId, dueTime, null, tomorrow.toString())
                        onTaskChanged()
                        task = taskRepository.getTask(localId)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Postpone to tomorrow")
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    scope.launch {
                        taskRepository.snoozeTask(
                            current.localId,
                            Instant.now().plusSeconds(3_600).toString(),
                        )
                        onTaskChanged()
                        task = taskRepository.getTask(localId)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Snooze 1 hour")
            }
            if (!current.repeatRule.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            taskRepository.createNextOccurrence(current.localId)
                            onTaskChanged()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Create next occurrence")
                }
            }
            if (current.isTemplate) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            taskRepository.instantiateTemplate(current.localId)
                            onTaskChanged()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Use template")
                }
            }
        }
    }
}

private fun parseChecklist(value: String): List<UiChecklistItem> {
    if (value.isBlank()) return emptyList()
    return runCatching {
        detailGson.fromJson<List<UiChecklistItem>>(value, detailChecklistType)
    }.getOrDefault(emptyList())
}
