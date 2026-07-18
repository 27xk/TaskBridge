package com.taskbridge.app.ui

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertTrue
import org.junit.Test

class AccessibilityContractTest {
    @Test
    fun sharedDynamicStatusAnnouncesChangesAndErrors() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/components/AppUi.kt")

        assertTrue(source.contains("fun AppDynamicStatusText("))
        assertTrue(source.contains("liveRegion ="))
        assertTrue(source.contains("LiveRegionMode.Assertive"))
        assertTrue(source.contains("error(text)"))
    }

    @Test
    fun authenticationEditorAndSettingsUseAccessibleDynamicStatus() {
        listOf(
            "ui/login/LoginScreen.kt",
            "ui/login/RegisterScreen.kt",
            "ui/editor/EditorScreen.kt",
            "ui/settings/SettingsScreen.kt",
        ).forEach { relativePath ->
            val source = androidSource("src/main/java/com/taskbridge/app/$relativePath")
            assertTrue("$relativePath does not use AppDynamicStatusText", source.contains("AppDynamicStatusText("))
            assertTrue("$relativePath does not mark invalid input", source.contains("isError ="))
        }
    }

    @Test
    fun passwordFieldAndSyncStatusExposeAccessibleState() {
        val password = androidSource("src/main/java/com/taskbridge/app/ui/login/PasswordTextField.kt")
        val syncStatus = androidSource("src/main/java/com/taskbridge/app/ui/components/SyncStatusBar.kt")

        assertTrue(password.contains("isError: Boolean"))
        assertTrue(password.contains("isError = isError"))
        assertTrue(syncStatus.contains("liveRegion = LiveRegionMode.Polite"))
    }
}
