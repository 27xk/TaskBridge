package com.taskbridge.app.ui.editor

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.usecase.QuickAddParser
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EditorUiState(
    val editingLocalId: String? = null,
    val title: String = "",
    val content: String = "",
    val priority: String = "0",
    val tag: String = "",
    val dueTime: String = "",
    val remindTime: String = "",
    val repeatRule: String = "",
    val isTemplate: Boolean = false,
    val templateName: String = "",
    val error: String? = null,
)

class EditorViewModel(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(EditorUiState())
    private val reminderManager = ReminderManager(appContext)
    val uiState: StateFlow<EditorUiState> = _uiState
    val displayTimeZone: StateFlow<String> = tokenDataStore.displayTimeZone
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShanghaiTime.DEFAULT_ZONE_ID)

    fun updateTitle(value: String) = _uiState.update { it.copy(title = value, error = null) }
    fun updateContent(value: String) = _uiState.update { it.copy(content = value) }
    fun updatePriority(value: String) = _uiState.update {
        it.copy(priority = value.filter { char -> char.isDigit() })
    }
    fun updateTag(value: String) = _uiState.update { it.copy(tag = value) }
    fun updateDueTime(value: String) = _uiState.update { it.copy(dueTime = value) }
    fun updateRemindTime(value: String) = _uiState.update { it.copy(remindTime = value) }
    fun updateRepeatRule(value: String) = _uiState.update { it.copy(repeatRule = value) }
    fun updateTemplateName(value: String) = _uiState.update { it.copy(templateName = value) }
    fun updateIsTemplate(value: Boolean) = _uiState.update { it.copy(isTemplate = value) }

    fun loadTask(localId: String) {
        viewModelScope.launch {
            val task = taskRepository.getTask(localId) ?: return@launch
            _uiState.value = EditorUiState(
                editingLocalId = task.localId,
                title = task.title,
                content = task.content.orEmpty(),
                priority = task.priority.toString(),
                tag = task.tag.orEmpty(),
                dueTime = ShanghaiTime.toInputText(task.dueTime, displayTimeZone.value),
                remindTime = ShanghaiTime.toInputText(task.remindTime, displayTimeZone.value),
                repeatRule = task.repeatRule.orEmpty(),
                isTemplate = task.isTemplate,
                templateName = task.templateName.orEmpty(),
            )
        }
    }

    fun save(onSaved: () -> Unit) {
        val state = _uiState.value
        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title is required.") }
            return
        }
        val timeZoneId = displayTimeZone.value
        if (!ShanghaiTime.isValidInput(state.dueTime, timeZoneId) || !ShanghaiTime.isValidInput(state.remindTime, timeZoneId)) {
            _uiState.update { it.copy(error = "Invalid time.") }
            return
        }

        viewModelScope.launch {
            val editingLocalId = state.editingLocalId
            val localId = if (editingLocalId == null) {
                val parsed = QuickAddParser.parse(state.title, timeZoneId)
                val tag = state.tag.trim().ifBlank { parsed.tag.orEmpty() }.ifBlank { null }
                val dueTime = ShanghaiTime.inputToInstantText(state.dueTime, timeZoneId) ?: parsed.dueTime
                val remindTime = ShanghaiTime.inputToInstantText(state.remindTime, timeZoneId)
                taskRepository.addTask(
                    title = parsed.title,
                    content = state.content.ifBlank { null },
                    priority = state.priority.toIntOrNull()?.takeIf { it > 0 } ?: parsed.priority,
                    tag = tag,
                    dueTime = dueTime,
                    remindTime = remindTime,
                    repeatRule = state.repeatRule.ifBlank { null },
                    plannedDate = parsed.plannedDate,
                    isTemplate = state.isTemplate,
                    templateName = state.templateName.ifBlank { null },
                )
            } else {
                taskRepository.updateTask(
                    localId = editingLocalId,
                    title = state.title.trim(),
                    content = state.content.ifBlank { null },
                    priority = state.priority.toIntOrNull()?.coerceIn(0, 5) ?: 0,
                    tag = state.tag.trim().ifBlank { null },
                    dueTime = ShanghaiTime.inputToInstantText(state.dueTime, timeZoneId),
                    remindTime = ShanghaiTime.inputToInstantText(state.remindTime, timeZoneId),
                    repeatRule = state.repeatRule.ifBlank { null },
                )
                editingLocalId
            }
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
    private val tokenDataStore: TokenDataStore,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return EditorViewModel(appContext, taskRepository, syncManager, tokenDataStore) as T
    }
}
