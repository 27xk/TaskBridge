package com.taskbridge.app.ui.task

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskStatus
import com.taskbridge.app.domain.model.isOverdueAt
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
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
    val now = rememberTimelineNow()

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

    AppPage(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TextButton(onClick = onBack) {
                Text(strings.back)
            }

            val current = task
            if (current == null) {
                AppHeader(title = strings.taskNotFound)
                AppPanel {
                    Button(onClick = onAddClick, modifier = Modifier.fillMaxWidth()) {
                        Text(strings.addTask)
                    }
                }
            } else {
                AppHeader(
                    title = current.title,
                    subtitle = if (current.status == TaskStatus.Completed) strings.completed else strings.todo,
                )
                AppPanel {
                    Text(
                        text = current.content?.takeIf { it.isNotBlank() } ?: strings.noContent,
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        text = current.detailMeta(strings, displayTimeZone, now),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                AppPanel {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(strings.checklist, style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = parseChecklist(current.checklistJson).size.toString(),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    val checklist = remember(current.checklistJson) {
                        parseChecklist(current.checklistJson)
                    }
                    checklist.forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
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
                                modifier = Modifier.weight(1f),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
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
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
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
                        ) {
                            Text(strings.add)
                        }
                    }
                }

                AppPanel {
                    Button(
                        onClick = { onEditClick(current.localId) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.edit)
                    }
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
    }
}

private fun Task.detailMeta(
    strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings,
    displayTimeZone: String,
    now: Instant,
): String {
    return listOfNotNull(
        strings.overdue.takeIf { isOverdueAt(now, displayTimeZone) },
        project?.let { "${strings.project} $it" },
        plannedDate?.let { "${strings.plan} $it" },
        dueTime?.let { "${strings.due} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
        remindTime?.let { "${strings.reminder} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
        snoozedUntil?.let { "${strings.snoozed} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
        completedAt?.let { "${strings.completed} ${ShanghaiTime.formatDateTime(it, displayTimeZone)}" },
        tag?.let { "#$it" },
        "${strings.list} $listType",
        "${strings.priority} $priority",
    ).joinToString("\n")
}

private fun parseChecklist(value: String): List<UiChecklistItem> {
    if (value.isBlank()) return emptyList()
    return runCatching {
        detailGson.fromJson<List<UiChecklistItem>>(value, detailChecklistType)
    }.getOrDefault(emptyList())
}
