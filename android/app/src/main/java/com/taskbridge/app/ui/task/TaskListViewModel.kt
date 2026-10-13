package com.taskbridge.app.ui.task

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.domain.model.TaskFilter
import com.taskbridge.app.ui.components.SyncStatusMessage
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.sync.SyncRunState
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

data class TaskListUiState(
    val syncMessage: SyncStatusMessage = SyncStatusMessage.LocalCacheReady,
    val searchQuery: String = "",
    val filter: TaskListFilter = TaskListFilter.All,
)

typealias TaskListFilter = TaskFilter

@OptIn(ExperimentalCoroutinesApi::class)
class TaskListViewModel(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModel() {
    val displayTimeZone: StateFlow<String> = tokenDataStore.displayTimeZone
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShanghaiTime.DEFAULT_ZONE_ID)

    private val timelineNow = flow {
        while (true) {
            emit(Instant.now())
            val delayMillis = 60_000L - (System.currentTimeMillis() % 60_000L)
            delay(delayMillis.coerceAtLeast(1_000L))
        }
    }

    private val pager = TaskListPager(viewModelScope, tokenDataStore.displayTimeZone, timelineNow, taskRepository::observeTaskPage)
    val page = pager.page
    private var todayOnly = false

    private val _uiState = MutableStateFlow(TaskListUiState())
    val uiState: StateFlow<TaskListUiState> = _uiState

    init {
        viewModelScope.launch {
            syncManager.syncState.collect { syncState ->
                val message = when (syncState) {
                    SyncRunState.Idle -> null
                    SyncRunState.Syncing -> SyncStatusMessage.Syncing
                    SyncRunState.Success -> SyncStatusMessage.SyncSucceeded
                    SyncRunState.Offline -> SyncStatusMessage.Offline
                    is SyncRunState.Failure -> SyncStatusMessage.SyncFailed
                }
                if (message != null) {
                    _uiState.update { it.copy(syncMessage = message) }
                }
            }
        }
        syncManager.requestSync()
    }

    fun complete(localId: String) {
        viewModelScope.launch {
            taskRepository.completeTask(localId)
            requestSync(SyncStatusMessage.CompletionQueued)
        }
    }

    fun undoComplete(localId: String) {
        viewModelScope.launch {
            taskRepository.undoCompleteTask(localId)
            requestSync(SyncStatusMessage.RestoreQueued)
        }
    }

    fun restoreDeleted(localId: String) {
        viewModelScope.launch {
            taskRepository.restoreDeletedTask(localId)
            requestSync(SyncStatusMessage.RestoreQueued)
        }
    }

    fun purgeDeleted(localId: String) {
        viewModelScope.launch {
            val taskBeforePurge = taskRepository.getTask(localId) ?: return@launch
            if (shouldBlockOfflinePurge(listOf(taskBeforePurge), !tokenDataStore.accessToken.first().isNullOrBlank())) {
                _uiState.update { state -> state.copy(syncMessage = SyncStatusMessage.PurgeRequiresConnection) }
                return@launch
            }
            runCatching {
                taskRepository.purgeDeletedTask(localId)
            }.onSuccess {
                _uiState.update { state -> state.copy(syncMessage = SyncStatusMessage.Purged) }
            }.onFailure {
                _uiState.update { state -> state.copy(syncMessage = SyncStatusMessage.PurgeFailed) }
            }
        }
    }

    fun delete(localId: String) {
        viewModelScope.launch {
            taskRepository.softDeleteTask(localId)
            requestSync(SyncStatusMessage.DeleteQueued)
        }
    }

    fun batchComplete(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchComplete(localIds)
            requestSync(SyncStatusMessage.BatchCompleted(localIds.size))
        }
    }

    fun batchDelete(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchDelete(localIds)
            requestSync(SyncStatusMessage.BatchDeleted(localIds.size))
        }
    }

    fun batchRestoreDeleted(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchRestoreDeleted(localIds)
            requestSync(SyncStatusMessage.BatchRestored(localIds.size))
        }
    }

    fun batchPurgeDeleted(localIds: List<String>) {
        viewModelScope.launch {
            val tasks = localIds.distinct().mapNotNull { taskRepository.getTask(it) }
            if (shouldBlockOfflinePurge(tasks, !tokenDataStore.accessToken.first().isNullOrBlank())) {
                _uiState.update { state -> state.copy(syncMessage = SyncStatusMessage.PurgeRequiresConnection) }
                return@launch
            }
            runCatching {
                taskRepository.batchPurgeDeleted(localIds)
            }.onSuccess {
                _uiState.update { state -> state.copy(syncMessage = SyncStatusMessage.BatchPurged(localIds.distinct().size)) }
            }.onFailure {
                _uiState.update { state -> state.copy(syncMessage = SyncStatusMessage.PurgeFailed) }
            }
        }
    }

    fun resolveConflictUseServer(localId: String) {
        viewModelScope.launch {
            taskRepository.resolveConflictUseServer(localId)
            requestSync(SyncStatusMessage.UsingCloudVersion)
        }
    }

    fun forceOverwriteServer(localId: String) {
        viewModelScope.launch {
            taskRepository.forceOverwriteServer(localId)
            requestSync(SyncStatusMessage.OverwriteCloudQueued)
        }
    }

    fun postponeToTomorrow(localId: String) {
        viewModelScope.launch {
            val tomorrow = ShanghaiTime.todayDate(displayTimeZone.value).plusDays(1)
            val dueTime = tomorrow
                .atTime(9, 0)
                .atZone(ShanghaiTime.zone(displayTimeZone.value))
                .toInstant()
                .toString()
            taskRepository.postponeTask(
                localId = localId,
                dueTime = dueTime,
                remindTime = null,
                plannedDate = tomorrow.toString(),
            )
            requestSync(SyncStatusMessage.PostponedToTomorrow)
        }
    }

    fun snoozeOneHour(localId: String) {
        viewModelScope.launch {
            taskRepository.snoozeTask(localId, Instant.now().plusSeconds(3_600).toString())
            requestSync(SyncStatusMessage.Snoozed)
        }
    }

    fun planToday(localId: String) {
        viewModelScope.launch {
            taskRepository.planTaskForToday(localId, ShanghaiTime.todayString(displayTimeZone.value))
            requestSync(SyncStatusMessage.PlannedForToday)
        }
    }

    fun moveInbox(localId: String) {
        viewModelScope.launch {
            taskRepository.moveTaskToInbox(localId)
            requestSync(SyncStatusMessage.MovedToInbox)
        }
    }

    fun refresh() {
        requestSync(SyncStatusMessage.Syncing)
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        updatePageSelection()
    }

    fun setFilter(filter: TaskListFilter) {
        _uiState.update { it.copy(filter = filter) }
        updatePageSelection()
    }

    fun setTodayOnly(value: Boolean) {
        todayOnly = value
        updatePageSelection()
    }

    fun nextPage() = pager.next()

    fun previousPage() = pager.previous()

    private fun updatePageSelection() {
        val state = _uiState.value
        pager.select(todayOnly, state.filter, state.searchQuery)
    }

    private fun requestSync(message: SyncStatusMessage) {
        _uiState.update { it.copy(syncMessage = message) }
        syncManager.requestSync(followUpIfRunning = message != SyncStatusMessage.Syncing)
    }
}

fun shouldBlockOfflinePurge(tasks: List<Task>, hasAccessToken: Boolean): Boolean {
    return !hasAccessToken && tasks.any { it.serverId != null }
}

class TaskListViewModelFactory(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return TaskListViewModel(appContext, taskRepository, syncManager, tokenDataStore) as T
    }
}
