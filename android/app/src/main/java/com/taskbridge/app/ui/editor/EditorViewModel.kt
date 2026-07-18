package com.taskbridge.app.ui.editor

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.usecase.QuickAddParser
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.ui.task.getTaskPriorityLabel
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID

data class EditorUiState(
    val editingLocalId: String? = null,
    val title: String = "",
    val content: String = "",
    val priority: String = "0",
    val tag: String = "",
    val project: String = "",
    val dueTime: String = "",
    val remindTime: String = "",
    val repeatRule: String = "",
    val listType: String = "inbox",
    val plannedDate: String = "",
    val checklistText: String = "",
    val isTemplate: Boolean = false,
    val templateName: String = "",
    val hasUnsavedChanges: Boolean = false,
    val isLoadingTask: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
)

enum class EditorEntryPreset {
    Default,
    Today,
}

data class EditorDraftSnapshot(
    val editingLocalId: String? = null,
    val title: String = "",
    val content: String = "",
    val priority: String = "0",
    val tag: String = "",
    val project: String = "",
    val dueTime: String = "",
    val remindTime: String = "",
    val repeatRule: String = "",
    val listType: String = "inbox",
    val plannedDate: String = "",
    val checklistText: String = "",
    val isTemplate: Boolean = false,
    val templateName: String = "",
)

private data class EditorChecklistItem(
    val id: String,
    val title: String,
    val done: Boolean = false,
)

private val editorGson = Gson()
private val editorChecklistType = object : TypeToken<List<EditorChecklistItem>>() {}.type
private const val EDITOR_DRAFT_ID_KEY = "editor_draft_id"
private const val EDITOR_EDITING_LOCAL_ID_KEY = "editor_editing_local_id"

class EditorViewModel(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
    private val savedStateHandle: SavedStateHandle,
    private val draftStore: EditorDraftStore = FileEditorDraftStore(appContext),
) : ViewModel() {
    private val restoredDraftId: String? = savedStateHandle[EDITOR_DRAFT_ID_KEY]
    private val draftId = restoredDraftId ?: UUID.randomUUID().toString()
    private val restoredEditingLocalId: String? = savedStateHandle[EDITOR_EDITING_LOCAL_ID_KEY]
    private val _uiState = MutableStateFlow(EditorUiState(editingLocalId = restoredEditingLocalId))
    private var savedSnapshot = EditorDraftSnapshot(editingLocalId = restoredEditingLocalId)
    @Volatile
    private var restoredDraftLoaded = false
    @Volatile
    private var draftStorageCleared = false
    private val draftStoreMutex = Mutex()
    private val operations = EditorOperationCoordinator()
    private val restoreRevision = operations.captureRevision()
    private val restoreJob = restoredDraftId?.let { id ->
        viewModelScope.launch(Dispatchers.IO) {
            val stored = runCatching { draftStore.read(id) }.getOrNull() ?: return@launch
            val restoredState = decodeEditorState(stored.stateJson) ?: return@launch
            val restoredSnapshot = decodeEditorSnapshot(stored.snapshotJson) ?: return@launch
            if (!operations.canApplyLoadedTask(restoreRevision)) return@launch
            savedSnapshot = restoredSnapshot
            _uiState.value = restoredState.copy(isLoadingTask = false, isSaving = false)
            restoredDraftLoaded = true
        }
    }
    private val reminderManager = ReminderManager(appContext, tokenDataStore)
    val uiState: StateFlow<EditorUiState> = _uiState
    val displayTimeZone: StateFlow<String> = tokenDataStore.displayTimeZone
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShanghaiTime.DEFAULT_ZONE_ID)

    fun updateTitle(value: String) = updateDraft { it.copy(title = value, error = null) }
    fun updateContent(value: String) = updateDraft { it.copy(content = value) }
    fun updatePriority(value: String) = updateDraft {
        it.copy(priority = value.filter { char -> char.isDigit() })
    }
    fun updateTag(value: String) = updateDraft { it.copy(tag = value) }
    fun updateProject(value: String) = updateDraft { it.copy(project = value) }
    fun updateDueTime(value: String) = updateDraft { it.copy(dueTime = value) }
    fun updateRemindTime(value: String) = updateDraft { it.copy(remindTime = value) }
    fun updateRepeatRule(value: String) = updateDraft { it.copy(repeatRule = value) }
    fun updateListType(value: String) = updateDraft {
        editorDraftWithListType(
            state = it,
            value = value,
            today = ShanghaiTime.todayDate(displayTimeZone.value),
        )
    }
    fun updatePlannedDate(value: String) = updateDraft {
        editorDraftWithPlannedDate(
            state = it,
            value = value,
            today = ShanghaiTime.todayDate(displayTimeZone.value),
        )
    }
    fun updateChecklistText(value: String) = updateDraft { it.copy(checklistText = value) }
    fun updateTemplateName(value: String) = updateDraft { it.copy(templateName = value) }
    fun updateIsTemplate(value: Boolean) = updateDraft { it.copy(isTemplate = value) }

    fun startNewTask(preset: EditorEntryPreset = EditorEntryPreset.Default) {
        viewModelScope.launch {
            restoreJob?.join()
            if (restoredDraftLoaded && _uiState.value.editingLocalId == null) return@launch
            draftStorageCleared = false
            val next = initialEditorDraftForPreset(
                preset = preset,
                displayTimeZone = displayTimeZone.value,
            )
            savedSnapshot = snapshotFromState(next)
            _uiState.value = next.copy(hasUnsavedChanges = false)
            persistDraft()
        }
    }

    fun loadTask(localId: String) {
        val revisionAtLoadStart = operations.captureRevision()
        _uiState.update { it.copy(editingLocalId = localId, isLoadingTask = true, error = null) }
        viewModelScope.launch {
            restoreJob?.join()
            if (restoredDraftLoaded && _uiState.value.editingLocalId == localId) {
                _uiState.update { it.copy(isLoadingTask = false) }
                return@launch
            }
            val task = taskRepository.getTask(localId)
            if (task == null) {
                if (operations.canApplyLoadedTask(revisionAtLoadStart)) {
                    _uiState.update { it.copy(isLoadingTask = false, error = "Task could not be loaded.") }
                }
                return@launch
            }
            val loaded = EditorUiState(
                editingLocalId = task.localId,
                title = task.title,
                content = task.content.orEmpty(),
                priority = task.priority.toString(),
                tag = task.tag.orEmpty(),
                project = task.project.orEmpty(),
                dueTime = ShanghaiTime.toInputText(task.dueTime, displayTimeZone.value),
                remindTime = ShanghaiTime.toInputText(task.remindTime, displayTimeZone.value),
                repeatRule = task.repeatRule.orEmpty(),
                listType = task.listType,
                plannedDate = task.plannedDate.orEmpty(),
                checklistText = checklistJsonToText(task.checklistJson),
                isTemplate = task.isTemplate,
                templateName = task.templateName.orEmpty(),
            )
            if (!operations.canApplyLoadedTask(revisionAtLoadStart)) {
                _uiState.update { it.copy(isLoadingTask = false) }
                return@launch
            }
            savedSnapshot = snapshotFromState(loaded)
            _uiState.value = loaded.copy(hasUnsavedChanges = false)
            persistDraft()
        }
    }

    fun save(onSaved: () -> Unit) {
        val state = _uiState.value
        if (state.title.isBlank()) {
            _uiState.update { it.copy(error = "Title is required.") }
            return
        }
        if (!isValidPlannedDateInput(state.plannedDate)) {
            _uiState.update { it.copy(error = "Invalid planned date.") }
            return
        }
        val timeZoneId = displayTimeZone.value
        if (!ShanghaiTime.isValidInput(state.dueTime, timeZoneId) || !ShanghaiTime.isValidInput(state.remindTime, timeZoneId)) {
            _uiState.update { it.copy(error = "Invalid time.") }
            return
        }
        if (!operations.tryBeginSave()) return
        _uiState.update { it.copy(isSaving = true, error = null) }

        viewModelScope.launch {
            val result = runCatching {
                val editingLocalId = state.editingLocalId
                val localId = if (editingLocalId == null) {
                    val parsed = QuickAddParser.parse(state.title, timeZoneId)
                    val tag = state.tag.trim().ifBlank { parsed.tag.orEmpty() }.ifBlank { null }
                    val project = state.project.trim().ifBlank { parsed.project.orEmpty() }.ifBlank { null }
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
                        project = project,
                        listType = state.listType,
                        plannedDate = state.plannedDate.trim().ifBlank { parsed.plannedDate.orEmpty() }.ifBlank { null },
                        checklistJson = checklistTextToJson(state.checklistText),
                        isTemplate = state.isTemplate,
                        templateName = state.templateName.ifBlank { null },
                    )
                } else {
                    val existingChecklistJson = taskRepository.getTask(editingLocalId)?.checklistJson
                    taskRepository.updateTask(
                        localId = editingLocalId,
                        title = state.title.trim(),
                        content = state.content.ifBlank { null },
                        priority = state.priority.toIntOrNull()?.coerceIn(0, 5) ?: 0,
                        tag = state.tag.trim().ifBlank { null },
                        project = state.project.trim().ifBlank { null },
                        updateProject = true,
                        dueTime = ShanghaiTime.inputToInstantText(state.dueTime, timeZoneId),
                        remindTime = ShanghaiTime.inputToInstantText(state.remindTime, timeZoneId),
                        repeatRule = state.repeatRule.ifBlank { null },
                        listType = state.listType,
                        plannedDate = state.plannedDate.trim().ifBlank { null },
                        updatePlannedDate = true,
                        checklistJson = checklistTextToJson(state.checklistText, existingChecklistJson),
                        isTemplate = state.isTemplate,
                        templateName = state.templateName.ifBlank { null },
                        updateTemplateName = true,
                    )
                    editingLocalId
                }
                taskRepository.getTask(localId)?.let(reminderManager::schedule)
                TodayTaskWidgetUpdateWorker.enqueue(appContext)
                syncManager.enqueueNetworkSync()
                syncManager.syncNow()
                savedSnapshot = snapshotFromState(_uiState.value)
                clearPersistedDraft()
            }
            operations.finishSave()
            result.onSuccess {
                _uiState.update { it.copy(isSaving = false) }
                onSaved()
            }.onFailure {
                _uiState.update { it.copy(isSaving = false, error = "Task could not be saved.") }
            }
        }
    }

    fun discardDraft() {
        clearPersistedDraft()
    }

    private fun updateDraft(transform: (EditorUiState) -> EditorUiState) {
        if (_uiState.value.isSaving) return
        operations.markDraftChanged()
        _uiState.update { current ->
            val next = transform(current)
            next.copy(hasUnsavedChanges = snapshotFromState(next) != savedSnapshot)
        }
        persistDraft()
    }

    private fun persistDraft() {
        val reference = editorSavedStateReference(draftId, _uiState.value.editingLocalId)
        savedStateHandle[EDITOR_DRAFT_ID_KEY] = reference.draftId
        if (reference.editingLocalId == null) {
            savedStateHandle.remove<String>(EDITOR_EDITING_LOCAL_ID_KEY)
        } else {
            savedStateHandle[EDITOR_EDITING_LOCAL_ID_KEY] = reference.editingLocalId
        }
        val stored = StoredEditorDraft(
            stateJson = editorGson.toJson(_uiState.value),
            snapshotJson = editorGson.toJson(savedSnapshot),
        )
        viewModelScope.launch(Dispatchers.IO) {
            draftStoreMutex.withLock {
                if (!draftStorageCleared) runCatching { draftStore.write(draftId, stored) }
            }
        }
    }

    private fun clearPersistedDraft() {
        draftStorageCleared = true
        savedStateHandle.remove<String>(EDITOR_DRAFT_ID_KEY)
        savedStateHandle.remove<String>(EDITOR_EDITING_LOCAL_ID_KEY)
        viewModelScope.launch(Dispatchers.IO) {
            draftStoreMutex.withLock {
                runCatching { draftStore.delete(draftId) }
            }
        }
    }
}

private fun decodeEditorState(value: String): EditorUiState? {
    return runCatching { editorGson.fromJson(value, EditorUiState::class.java) }.getOrNull()
}

private fun decodeEditorSnapshot(value: String): EditorDraftSnapshot? {
    return runCatching { editorGson.fromJson(value, EditorDraftSnapshot::class.java) }.getOrNull()
}

fun isValidPlannedDateInput(value: String): Boolean {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return true
    return runCatching { LocalDate.parse(trimmed) }.isSuccess
}

fun initialEditorDraftForPreset(
    preset: EditorEntryPreset,
    displayTimeZone: String = ShanghaiTime.DEFAULT_ZONE_ID,
    today: LocalDate = ShanghaiTime.todayDate(displayTimeZone),
): EditorUiState {
    return when (preset) {
        EditorEntryPreset.Today -> EditorUiState(listType = "today", plannedDate = today.toString())
        EditorEntryPreset.Default -> EditorUiState()
    }
}

fun editorDraftWithPlannedDate(
    state: EditorUiState,
    value: String,
    today: LocalDate = ShanghaiTime.todayDate(ShanghaiTime.DEFAULT_ZONE_ID),
): EditorUiState {
    val nextListType = if (state.listType == "today" && value.trim() != today.toString()) {
        "inbox"
    } else {
        state.listType
    }
    return state.copy(plannedDate = value, listType = nextListType)
}

fun editorDraftWithListType(
    state: EditorUiState,
    value: String,
    today: LocalDate = ShanghaiTime.todayDate(ShanghaiTime.DEFAULT_ZONE_ID),
): EditorUiState {
    val nextListType = when (value.trim()) {
        "today" -> "today"
        "inbox" -> "inbox"
        else -> "inbox"
    }
    val nextPlannedDate = if (nextListType == "today" && state.plannedDate.isBlank()) {
        today.toString()
    } else {
        state.plannedDate
    }
    return state.copy(listType = nextListType, plannedDate = nextPlannedDate)
}

fun buildQuickAddPreviewChips(
    title: String,
    timeZoneId: String = ShanghaiTime.DEFAULT_ZONE_ID,
    languageCode: String = "zh-CN",
    now: LocalDateTime = LocalDateTime.now(ShanghaiTime.zone(timeZoneId)),
): List<String> {
    val rawTitle = title.trim()
    if (rawTitle.isBlank()) return emptyList()
    val parsed = QuickAddParser.parse(rawTitle, timeZoneId, now)
    val isEnglish = languageCode == "en-US"
    val chips = mutableListOf<String>()
    if (parsed.title.isNotBlank() && parsed.title != rawTitle) {
        chips += "${if (isEnglish) "Title" else "标题"}: ${parsed.title}"
    }
    if (parsed.dueTime != null) {
        chips += "${if (isEnglish) "Due" else "截止"}: ${ShanghaiTime.formatDateTime(parsed.dueTime, timeZoneId)}"
    } else if (parsed.plannedDate != null) {
        chips += "${if (isEnglish) "Plan" else "计划"}: ${parsed.plannedDate}"
    }
    if (parsed.priority > 0) {
        chips += getTaskPriorityLabel(parsed.priority, languageCode)
    }
    parsed.tag?.let { chips += "#$it" }
    parsed.project?.let { chips += "@$it" }
    return chips
}

private fun snapshotFromState(state: EditorUiState): EditorDraftSnapshot {
    return EditorDraftSnapshot(
        editingLocalId = state.editingLocalId,
        title = state.title,
        content = state.content,
        priority = state.priority,
        tag = state.tag,
        project = state.project,
        dueTime = state.dueTime,
        remindTime = state.remindTime,
        repeatRule = state.repeatRule,
        listType = state.listType,
        plannedDate = state.plannedDate,
        checklistText = state.checklistText,
        isTemplate = state.isTemplate,
        templateName = state.templateName,
    )
}

private fun checklistJsonToText(value: String?): String {
    return checklistJsonToItems(value)
        .map { it.title }
        .filter { it.isNotBlank() }
        .joinToString("\n")
}

private fun checklistTextToJson(value: String, existingJson: String? = null): String {
    val existing = checklistJsonToItems(existingJson)
    val usedIndexes = mutableSetOf<Int>()
    val items = value
        .lineSequence()
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .mapIndexed { index, title ->
            val previous = preserveChecklistItemState(title, index, existing, usedIndexes)
            EditorChecklistItem(
                id = previous?.id ?: UUID.randomUUID().toString(),
                title = title,
                done = previous?.done ?: false,
            )
        }
        .toList()
    return editorGson.toJson(items)
}

private fun checklistJsonToItems(value: String?): List<EditorChecklistItem> {
    if (value.isNullOrBlank()) return emptyList()
    return runCatching {
        editorGson.fromJson<List<EditorChecklistItem>>(value, editorChecklistType)
            .filter { it.title.isNotBlank() }
    }.getOrDefault(emptyList())
}

private fun preserveChecklistItemState(
    title: String,
    index: Int,
    existing: List<EditorChecklistItem>,
    usedIndexes: MutableSet<Int>,
): EditorChecklistItem? {
    val direct = existing.getOrNull(index)
    if (direct != null && index !in usedIndexes && direct.title.trim() == title) {
        usedIndexes += index
        return direct
    }
    val match = existing.withIndex().firstOrNull { (itemIndex, item) ->
        itemIndex !in usedIndexes && item.title.trim() == title
    }
    return if (match != null) {
        usedIndexes += match.index
        match.value
    } else {
        null
    }
}

class EditorViewModelFactory(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        return EditorViewModel(
            appContext,
            taskRepository,
            syncManager,
            tokenDataStore,
            extras.createSavedStateHandle(),
        ) as T
    }
}
