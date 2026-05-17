package com.taskbridge.app

import android.content.Context
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.local.AppDatabase
import com.taskbridge.app.data.remote.RetrofitClient
import com.taskbridge.app.data.repository.AuthRepository
import com.taskbridge.app.data.repository.SyncRepository
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.notification.ReminderManager
import com.taskbridge.app.sync.SyncManager

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val database = AppDatabase.getInstance(appContext)

    val tokenDataStore = TokenDataStore(appContext)
    private val apiService = RetrofitClient.create(appContext, tokenDataStore)

    val authRepository = AuthRepository(apiService, tokenDataStore)
    val taskRepository = TaskRepository(database.taskDao(), database.syncQueueDao())
    val syncRepository = SyncRepository(
        apiService = apiService,
        taskDao = database.taskDao(),
        syncQueueDao = database.syncQueueDao(),
        tokenDataStore = tokenDataStore,
    )
    val syncManager = SyncManager(appContext, syncRepository)
    val reminderManager = ReminderManager(appContext)
}
