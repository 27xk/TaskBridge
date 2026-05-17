package com.taskbridge.app.ui.editor

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.usecase.QuickAddParser
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EditorUiState(
    val title: String = "",
    val content: String = "",
    val priority: String = "0",
    val tag: String = "",
    val dueTime: String = "",
    val repeatRule: String = "",
    val isTemplate: Boolean = false,
    val templateName: String = "",
    val error: String? = null,
)

class EditorViewModel(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
) : ViewModel() {
    private val _uiState = MutableStateFlow(EditorUiState())
    private val reminderManager = ReminderManager(appContext)
    val uiState: StateFlow<EditorUiState> = _uiState

    fun updateTitle(value: String) = _uiState.update { it.copy(title = value, error = null) }
    fun updateContent(value: String) = _uiState.update { it.copy(content = value) }
    fun updatePriority(value: String) = _uiState.update {
        it.copy(priority = value.filter { char -> char.isDigit() })
    }
    fun updateTag(value: String) = _uiState.update { it.copy(tag = value) }
    fun updateDueTime(value: String) = _uiState.update { it.copy(dueTime = value) }
    fun updateRepeatRule(value: String) = _uiState.update { it.copy(repeatRule = value) }
    fun updateTemplateName(value: String) = _uiState.update { it.copy(templateName = value) }
    fun updateIsTemplate(value: Boolean) = _uiState.update { it.copy(isTemplate = value) }

    fun save(onSaved: () -> Unit) {
        val state = _uiState.value
        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title is required.") }
            return
        }

        viewModelScope.launch {
            val parsed = QuickAddParser.parse(state.title)
            val tag = state.tag.trim().ifBlank { parsed.tag.orEmpty() }.ifBlank { null }
            val dueTime = state.dueTime.trim().ifBlank { parsed.dueTime.orEmpty() }.ifBlank { null }
            val localId = taskRepository.addTask(
                title = parsed.title,
                content = state.content.ifBlank { null },
                priority = state.priority.toIntOrNull()?.takeIf { it > 0 } ?: parsed.priority,
                tag = tag,
                dueTime = dueTime,
                remindTime = null,
                repeatRule = state.repeatRule.ifBlank { null },
                plannedDate = parsed.plannedDate,
                isTemplate = state.isTemplate,
                templateName = state.templateName.ifBlank { null },
            )
            taskRepository.getTask(localId)?.let(reminderManager::schedule)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            syncManager.enqueueNetworkSync()
            syncManager.syncNow()
            onSaved()
        }
    }
}

class EditorViewModelFactory(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return EditorViewModel(appContext, taskRepository, syncManager) as T
    }
}
