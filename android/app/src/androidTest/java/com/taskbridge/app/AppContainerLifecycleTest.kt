package com.taskbridge.app

import android.content.ContextWrapper
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppContainerLifecycleTest {
    @Test
    fun activityRecreationAndReceiverContextsReuseTheApplicationContainer() {
        val application = ApplicationProvider.getApplicationContext<TaskBridgeApplication>()
        val container = application.appContainer
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            repeat(20) {
                scenario.onActivity { activity -> assertSame(container, activity.appContainer) }
                scenario.recreate()
                assertSame(container, ContextWrapper(application).appContainer)
            }
        }
        assertSame(container, application.appContainer)
        assertTrue(container.applicationJob.isActive)
    }
}
