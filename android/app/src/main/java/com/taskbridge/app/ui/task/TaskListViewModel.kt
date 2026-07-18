package com.taskbridge.app.ui.task

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.ui.components.SyncStatusMessage
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.sync.SyncRunState
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
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

enum class TaskListFilter(val label: String) {
    All("全部"),
    Inbox("收件箱"),
    Overdue("逾期"),
    Week("本周"),
    HighPriority("高优先级"),
    Completed("已完成"),
    PendingSync("未同步"),
    Conflict("冲突"),
    Templates("模板"),
    Trash("回收站"),
}

@OptIn(ExperimentalCoroutinesApi::class)
class TaskListViewModel(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModel() {
    private val reminderManager = ReminderManager(appContext, tokenDataStore)
    val displayTimeZone: StateFlow<String> = tokenDataStore.displayTimeZone
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShanghaiTime.DEFAULT_ZONE_ID)

    private val timelineNow = flow {
        while (true) {
            emit(Instant.now())
            val delayMillis = 60_000L - (System.currentTimeMillis() % 60_000L)
            delay(delayMillis.coerceAtLeast(1_000L))
        }
    }

    val tasks: StateFlow<List<Task>> = timelineNow
        .flatMapLatest { now -> taskRepository.observeTasks(now) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val trashTasks: StateFlow<List<Task>> = taskRepository.observeTrashTasks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val todayTasks: StateFlow<List<Task>> = combine(tokenDataStore.displayTimeZone, timelineNow) { timeZoneId, now ->
        timeZoneId to now
    }
        .flatMapLatest { (timeZoneId, now) ->
            val todayPrefix = ShanghaiTime.todayDate(timeZoneId).toString()
            taskRepository.observeTodayTasks(todayPrefix, timeZoneId, now)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

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
        syncManager.enqueueNetworkSync()
        syncManager.syncNow()
        viewModelScope.launch {
            todayTasks.collect { TodayTaskWidgetUpdateWorker.enqueue(appContext) }
        }
    }

    fun complete(localId: String) {
        viewModelScope.launch {
            taskRepository.completeTask(localId)
            taskRepository.getTask(localId)?.let(reminderManager::cancel)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.CompletionQueued)
        }
    }

    fun undoComplete(localId: String) {
        viewModelScope.launch {
            taskRepository.undoCompleteTask(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.RestoreQueued)
        }
    }

    fun restoreDeleted(localId: String) {
        viewModelScope.launch {
            taskRepository.restoreDeletedTask(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.RestoreQueued)
        }
    }

    fun purgeDeleted(localId: String) {
        viewModelScope.launch {
            runCatching {
                val taskBeforePurge = taskRepository.getTask(localId)
                taskBeforePurge?.let(reminderManager::cancel)
                taskRepository.purgeDeletedTask(localId)
                TodayTaskWidgetUpdateWorker.enqueue(appContext)
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
            taskRepository.getTask(localId)?.let(reminderManager::cancel)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.DeleteQueued)
        }
    }

    fun batchComplete(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchComplete(localIds)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.BatchCompleted(localIds.size))
        }
    }

    fun batchDelete(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchDelete(localIds)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.BatchDeleted(localIds.size))
        }
    }

    fun batchRestoreDeleted(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchRestoreDeleted(localIds)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.BatchRestored(localIds.size))
        }
    }

    fun batchPurgeDeleted(localIds: List<String>) {
        viewModelScope.launch {
            runCatching {
                localIds.distinct().forEach { localId ->
                    taskRepository.getTask(localId)?.let(reminderManager::cancel)
                }
                taskRepository.batchPurgeDeleted(localIds)
                TodayTaskWidgetUpdateWorker.enqueue(appContext)
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
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.UsingCloudVersion)
        }
    }

    fun forceOverwriteServer(localId: String) {
        viewModelScope.launch {
            taskRepository.forceOverwriteServer(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
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
            taskRepository.getTask(localId)?.let(reminderManager::schedule)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.PostponedToTomorrow)
        }
    }

    fun snoozeOneHour(localId: String) {
        viewModelScope.launch {
            taskRepository.snoozeTask(localId, Instant.now().plusSeconds(3_600).toString())
            taskRepository.getTask(localId)?.let(reminderManager::schedule)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.Snoozed)
        }
    }

    fun planToday(localId: String) {
        viewModelScope.launch {
            taskRepository.planTaskForToday(localId, ShanghaiTime.todayString(displayTimeZone.value))
            taskRepository.getTask(localId)?.let(reminderManager::schedule)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.PlannedForToday)
        }
    }

    fun moveInbox(localId: String) {
        viewModelScope.launch {
            taskRepository.moveTaskToInbox(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync(SyncStatusMessage.MovedToInbox)
        }
    }

    fun refresh() {
        requestSync(SyncStatusMessage.Syncing)
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun setFilter(filter: TaskListFilter) {
        _uiState.update { it.copy(filter = filter) }
    }

    private fun requestSync(message: SyncStatusMessage) {
        _uiState.update { it.copy(syncMessage = message) }
        syncManager.enqueueNetworkSync()
        syncManager.syncNow()
    }
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
