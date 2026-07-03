package com.taskbridge.app.ui.login

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RegistrationAvailabilityTest {
    @Test
    fun unknownRegistrationStatusShowsCheckActionBeforeAccountCreation() {
        val ui = registrationAvailabilityUi(
            registrationStatusKnown = false,
            registrationEnabled = true,
            isLoading = false,
            isEnglish = false,
        )

        assertTrue(ui.showCreateAccountAction)
        assertTrue(ui.canEditAccountFields)
        assertFalse(ui.canSubmitRegistration)
        assertEquals("检查并创建账号", ui.actionText)
        assertEquals("点击“检查并创建账号”即可确认当前服务器是否开放注册。已有账号可以直接登录。", ui.helperText)
    }

    @Test
    fun enabledRegistrationShowsActionAndAllowsSubmitWhenIdle() {
        val ui = registrationAvailabilityUi(
            registrationStatusKnown = true,
            registrationEnabled = true,
            isLoading = false,
            isEnglish = true,
        )

        assertTrue(ui.showCreateAccountAction)
        assertTrue(ui.canEditAccountFields)
        assertTrue(ui.canSubmitRegistration)
        assertEquals(null, ui.actionText)
        assertEquals(null, ui.helperText)
    }

    @Test
    fun disabledRegistrationShowsActionableHelp() {
        val ui = registrationAvailabilityUi(
            registrationStatusKnown = true,
            registrationEnabled = false,
            isLoading = false,
            isEnglish = true,
        )

        assertFalse(ui.showCreateAccountAction)
        assertFalse(ui.canEditAccountFields)
        assertFalse(ui.canSubmitRegistration)
        assertEquals(null, ui.actionText)
        assertEquals(
            "Open registration is disabled on this server. Use an existing account or ask the server admin to create one.",
            ui.helperText,
        )
    }

    @Test
    fun pendingRegistrationNavigationClearsWhenStatusStaysUnknownAfterCheck() {
        val next = reducePendingRegistrationNavigation(
            pendingRegisterNavigation = true,
            registrationStatusKnown = false,
            registrationEnabled = false,
            isTestingConnection = false,
            connectionMessageIsError = false,
        )

        assertFalse(next.pendingRegisterNavigation)
        assertFalse(next.shouldNavigateToRegister)
        assertTrue(next.shouldShowUnknownRegistrationMessage)
    }

    @Test
    fun pendingRegistrationNavigationMovesToRegisterWhenEnabled() {
        val next = reducePendingRegistrationNavigation(
            pendingRegisterNavigation = true,
            registrationStatusKnown = true,
            registrationEnabled = true,
            isTestingConnection = false,
            connectionMessageIsError = false,
        )

        assertFalse(next.pendingRegisterNavigation)
        assertTrue(next.shouldNavigateToRegister)
        assertFalse(next.shouldShowUnknownRegistrationMessage)
    }
}
