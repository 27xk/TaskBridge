package com.taskbridge.app

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.local.WorkspaceMigrationCoordinator
import com.taskbridge.app.data.remote.RetrofitClient
import com.taskbridge.app.data.repository.AuthRepository
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.DeviceIdProvider
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.widget.TodayTaskWidgetRepository
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.util.concurrent.atomic.AtomicBoolean

class AppContainer internal constructor(context: Context) : Closeable {
    private val appContext = context.applicationContext
    private val database = AppDatabase.getInstance(appContext)
    val applicationJob = SupervisorJob()
    val applicationScope = CoroutineScope(applicationJob + Dispatchers.IO)
    val workScheduler = CoalescingWorkScheduler(appContext)
    private val initialized = AtomicBoolean(false)

    val tokenDataStore = TokenDataStore(appContext)
    private val apiService = RetrofitClient.create(appContext, tokenDataStore)
    private val workspaceMigration = WorkspaceMigrationCoordinator(
        database,
        database.taskDao(),
        database.syncQueueDao(),
        tokenDataStore,
    )

    private val deviceIdProvider = DeviceIdProvider(appContext)

    val authRepository = AuthRepository(apiService, tokenDataStore, deviceIdProvider)
    val taskRepository = TaskRepository(
        apiService,
        database,
        database.taskDao(),
        database.syncQueueDao(),
        tokenDataStore,
        workspaceMigration,
        onTasksChanged = { workspaceId, localIds -> updateTaskEffects(workspaceId, localIds) },
    )
    val syncRepository = SyncRepository(
        apiService = apiService,
        database = database,
        taskDao = database.taskDao(),
        syncQueueDao = database.syncQueueDao(),
        tokenDataStore = tokenDataStore,
        workspaceMigration = workspaceMigration,
        onTasksChanged = { workspaceId, localIds -> updateTaskEffects(workspaceId, localIds) },
    )
    val reminderManager = ReminderManager(appContext, tokenDataStore, database.taskDao())
    val widgetRepository = TodayTaskWidgetRepository(database, tokenDataStore, workspaceMigration)
    val syncManager = SyncManager(appContext, syncRepository, tokenDataStore, applicationScope, workScheduler)

    fun initialize() {
        if (!initialized.compareAndSet(false, true)) return
        applicationScope.launch {
            tokenDataStore.initializeLegacyWorkspaceOwnership()
            reminderManager.ensureChannel()
            combine(tokenDataStore.currentWorkspace, tokenDataStore.displayTimeZone) { workspace, zone ->
                workspace to zone
            }.distinctUntilChanged().collect { (workspace, _) ->
                if (workspace != null) workspaceMigration.ensureWorkspace(workspace)
                reminderManager.rebuildAll()
                TodayTaskWidgetUpdateWorker.enqueue(appContext)
            }
        }
    }

    private suspend fun updateTaskEffects(workspaceId: String, localIds: Set<String>) = withContext(Dispatchers.IO) {
        if (localIds.isEmpty()) return@withContext
        reminderManager.updateTasks(workspaceId, localIds)
        TodayTaskWidgetUpdateWorker.enqueue(appContext)
    }

    override fun close() {
        syncManager.close()
        applicationJob.cancel()
    }
}
