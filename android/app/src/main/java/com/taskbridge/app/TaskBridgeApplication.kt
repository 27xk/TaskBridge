package com.taskbridge.app

import android.app.Application
import android.content.Context

class TaskBridgeApplication : Application() {
    val container: AppContainer by lazy(LazyThreadSafetyMode.SYNCHRONIZED) { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        container.initialize()
    }

    override fun onTerminate() {
        // Android owns this scope for the process lifetime. Test runtimes call onTerminate.
        container.close()
        super.onTerminate()
    }
}

val Context.appContainer: AppContainer
    get() = (applicationContext as TaskBridgeApplication).container
