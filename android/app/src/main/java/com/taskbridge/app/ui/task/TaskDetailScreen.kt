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
import androidx.compose.runtime.DisposableEffect
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
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch
import java.time.Instant

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
    displayTimeZone: String,
    onBack: () -> Unit,
    onAddClick: () -> Unit,
    onEditClick: (String) -> Unit,
    onTaskChanged: () -> Unit,
) {
    var task by remember(localId) { mutableStateOf<Task?>(null) }
    var newChecklistTitle by remember(localId) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val strings = LocalTaskBridgeStrings.current
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(localId) {
        task = taskRepository.getTask(localId)
    }
    DisposableEffect(lifecycleOwner, localId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch {
                    task = taskRepository.getTask(localId)
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        TextButton(onClick = onBack) {
            Text(strings.back)
        }
        Spacer(Modifier.height(8.dp))

        val current = task
        if (current == null) {
            Text(strings.taskNotFound, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Button(onClick = onAddClick, modifier = Modifier.fillMaxWidth()) {
                Text(strings.addTask)
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
                text = if (current.status == TaskStatus.Completed) strings.completed else strings.todo,
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(16.dp))
            Text(current.content ?: strings.noContent, style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(16.dp))
            Text(
                text = listOfNotNull(
                    current.project?.let { "${strings.project} $it" },
                    current.plannedDate?.let { "${strings.plan} $it" },
                    current.dueTime?.let { "${strings.due} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
                    current.remindTime?.let { "${strings.reminder} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
                    current.snoozedUntil?.let { "${strings.snoozed} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
                    current.completedAt?.let { "${strings.completed} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
                    current.tag?.let { "#$it" },
                    "${strings.list} ${current.listType}",
                    "${strings.priority} ${current.priority}",
                ).joinToString("\n"),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { onEditClick(current.localId) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(strings.edit)
            }
            Spacer(Modifier.height(8.dp))
            Text(strings.checklist, style = MaterialTheme.typography.titleMedium)
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
                        Text(strings.delete)
                    }
                }
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = newChecklistTitle,
                    onValueChange = { newChecklistTitle = it },
                    label = { Text(strings.newChecklistItem) },
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
                    Text(strings.add)
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
                Text(if (current.status == TaskStatus.Completed) strings.restore else strings.complete)
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    scope.launch {
                        val tomorrow = ShanghaiTime.todayDate(displayTimeZone).plusDays(1)
                        val dueTime = tomorrow
                            .atTime(9, 0)
                            .atZone(ShanghaiTime.zone(displayTimeZone))
                            .toInstant()
                            .toString()
                        taskRepository.postponeTask(current.localId, dueTime, null, tomorrow.toString())
                        onTaskChanged()
                        task = taskRepository.getTask(localId)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(strings.postponeTomorrow)
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
                Text(strings.snoozeOneHour)
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
                    Text(strings.createNextOccurrence)
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
                    Text(strings.useTemplate)
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
