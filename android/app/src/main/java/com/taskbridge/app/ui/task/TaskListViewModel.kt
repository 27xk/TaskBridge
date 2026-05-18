package com.taskbridge.app.ui.task

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.domain.model.Task
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class TaskListUiState(
    val syncText: String = "本地缓存已就绪",
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
}

class TaskListViewModel(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
) : ViewModel() {
    private val shanghaiZone = ZoneId.of("Asia/Shanghai")
    private val todayPrefix = LocalDate.now(shanghaiZone).toString()
    private val reminderManager = ReminderManager(appContext)

    val tasks: StateFlow<List<Task>> = taskRepository.observeTasks()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val todayTasks: StateFlow<List<Task>> = taskRepository.observeTodayTasks(todayPrefix)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _uiState = MutableStateFlow(TaskListUiState())
    val uiState: StateFlow<TaskListUiState> = _uiState

    init {
        syncManager.enqueueNetworkSync()
        syncManager.syncNow()
        viewModelScope.launch {
            todayTasks
                .distinctUntilChanged()
                .collect { TodayTaskWidgetUpdateWorker.enqueue(appContext) }
        }
    }

    fun complete(localId: String) {
        viewModelScope.launch {
            taskRepository.completeTask(localId)
            taskRepository.getTask(localId)?.let(reminderManager::cancel)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("完成已加入同步队列")
        }
    }

    fun undoComplete(localId: String) {
        viewModelScope.launch {
            taskRepository.undoCompleteTask(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("恢复待办已加入同步队列")
        }
    }

    fun delete(localId: String) {
        viewModelScope.launch {
            taskRepository.softDeleteTask(localId)
            taskRepository.getTask(localId)?.let(reminderManager::cancel)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("删除已加入同步队列")
        }
    }

    fun batchComplete(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchComplete(localIds)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已批量完成 ${localIds.size} 条任务")
        }
    }

    fun batchDelete(localIds: List<String>) {
        viewModelScope.launch {
            taskRepository.batchDelete(localIds)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已批量删除 ${localIds.size} 条任务")
        }
    }

    fun resolveConflictUseServer(localId: String) {
        viewModelScope.launch {
            taskRepository.resolveConflictUseServer(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已采用云端版本")
        }
    }

    fun forceOverwriteServer(localId: String) {
        viewModelScope.launch {
            taskRepository.forceOverwriteServer(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已排队覆盖云端")
        }
    }

    fun postponeToTomorrow(localId: String) {
        viewModelScope.launch {
            val tomorrow = LocalDate.now(shanghaiZone).plusDays(1)
            val dueTime = tomorrow
                .atTime(9, 0)
                .atZone(shanghaiZone)
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
            requestSync("已顺延到明天")
        }
    }

    fun snoozeOneHour(localId: String) {
        viewModelScope.launch {
            taskRepository.snoozeTask(localId, Instant.now().plusSeconds(3_600).toString())
            taskRepository.getTask(localId)?.let(reminderManager::schedule)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已稍后提醒")
        }
    }

    fun planToday(localId: String) {
        viewModelScope.launch {
            taskRepository.planTaskForToday(localId, LocalDate.now(shanghaiZone).toString())
            taskRepository.getTask(localId)?.let(reminderManager::schedule)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已加入今日计划")
        }
    }

    fun moveInbox(localId: String) {
        viewModelScope.launch {
            taskRepository.moveTaskToInbox(localId)
            TodayTaskWidgetUpdateWorker.enqueue(appContext)
            requestSync("已移回收件箱")
        }
    }

    fun refresh() {
        requestSync("正在同步")
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun setFilter(filter: TaskListFilter) {
        _uiState.update { it.copy(filter = filter) }
    }

    private fun requestSync(message: String) {
        _uiState.update { it.copy(syncText = message) }
        syncManager.enqueueNetworkSync()
        syncManager.syncNow()
    }
}

class TaskListViewModelFactory(
    private val appContext: Context,
    private val taskRepository: TaskRepository,
    private val syncManager: SyncManager,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return TaskListViewModel(appContext, taskRepository, syncManager) as T
    }
}
