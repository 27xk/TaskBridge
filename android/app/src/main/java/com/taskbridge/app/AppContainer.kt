package com.taskbridge.app

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.remote.RetrofitClient
import com.taskbridge.app.data.repository.AuthRepository
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.DeviceIdProvider
import com.taskbridge.app.sync.SyncManager

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val database = AppDatabase.getInstance(appContext)

    val tokenDataStore = TokenDataStore(appContext)
    private val apiService = RetrofitClient.create(appContext, tokenDataStore)

    private val deviceIdProvider = DeviceIdProvider(appContext)

    val authRepository = AuthRepository(apiService, tokenDataStore, deviceIdProvider)
    val taskRepository = TaskRepository(apiService, database, database.taskDao(), database.syncQueueDao(), tokenDataStore)
    val syncRepository = SyncRepository(
        apiService = apiService,
        database = database,
        taskDao = database.taskDao(),
        syncQueueDao = database.syncQueueDao(),
        tokenDataStore = tokenDataStore,
    )
    val syncManager = SyncManager(appContext, syncRepository, tokenDataStore)
    val reminderManager = ReminderManager(appContext, tokenDataStore)
}
