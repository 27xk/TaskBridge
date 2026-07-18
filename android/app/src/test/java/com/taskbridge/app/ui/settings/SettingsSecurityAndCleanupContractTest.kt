package com.taskbridge.app.ui.settings

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsSecurityAndCleanupContractTest {
    @Test
    fun accountSettingsCallPasswordAndSessionActions() {
        val repository = androidSource("src/main/java/com/taskbridge/app/data/repository/AuthRepository.kt")
        val screen = androidSource("src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt")

        assertTrue(repository.contains("suspend fun changePassword("))
        assertTrue(repository.contains("suspend fun sessions("))
        assertTrue(repository.contains("suspend fun revokeOtherSessions("))
        assertTrue(screen.contains("authRepository.changePassword("))
        assertTrue(screen.contains("authRepository.sessions()"))
        assertTrue(screen.contains("authRepository.revokeOtherSessions()"))
        assertTrue(screen.contains("confirmRevokeOtherSessions"))
    }

    @Test
    fun editingPasswordClearsTheVisibleValidationError() {
        val screen = androidSource("src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt")

        assertTrue(
            screen.contains(
                "currentPassword = it\n                            passwordNote = \"\"\n                            passwordNoteIsError = false",
            ),
        )
    }

    @Test
    fun successfulSessionRefreshOnlyClearsAStaleErrorMessage() {
        val screen = androidSource("src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt")

        assertTrue(screen.contains("if (sessionNoteIsError) sessionNote = \"\""))
    }

    @Test
    fun revokingOtherSessionsHasASingleFlightGuardAndAlwaysReenablesControls() {
        val screen = androidSource("src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt")
        val revokeFunction = screen
            .substringAfter("fun revokeOtherSessions() {")
            .substringBefore("LaunchedEffect(initialSection)")

        assertTrue(revokeFunction.contains("if (sessionsLoading) return"))
        assertTrue(revokeFunction.indexOf("sessionsLoading = true") < revokeFunction.indexOf("authRepository.revokeOtherSessions()"))
        assertTrue(revokeFunction.contains("finally"))
        assertTrue(revokeFunction.contains("sessionsLoading = false"))
    }

    @Test
    fun blockedClearCopySaysExportDoesNotResolveSync() {
        val english = policyText("clearLocalDataBlockedHint", true)
        val chinese = policyText("clearLocalDataBlockedHint", false)

        assertTrue(english.contains("does not sync or resolve"))
        assertFalse(english.contains("or export a local backup before clearing"))
        assertTrue(chinese.contains("不能完成同步，也不能解决这些问题"))
    }

    @Test
    fun clearConfirmationExplainsRecoveryAndItsLimit() {
        val english = policyText("clearLocalDataConfirmationText", true)
        val chinese = policyText("clearLocalDataConfirmationText", false)

        assertTrue(english.contains("exported backup can be imported later"))
        assertTrue(english.contains("does not sync pending changes"))
        assertTrue(chinese.contains("已导出的备份以后可以重新导入"))
        assertTrue(chinese.contains("导出不会同步待处理修改"))
    }

    private fun policyText(methodName: String, isEnglish: Boolean): String {
        val owner = Class.forName("com.taskbridge.app.ui.settings.SettingsUiPolicyKt")
        val method = owner.methods.firstOrNull {
            it.name == methodName && it.parameterTypes.contentEquals(arrayOf(Boolean::class.javaPrimitiveType))
        }
        assertNotNull("$methodName is missing", method)
        return method?.invoke(null, isEnglish) as? String ?: ""
    }
}
