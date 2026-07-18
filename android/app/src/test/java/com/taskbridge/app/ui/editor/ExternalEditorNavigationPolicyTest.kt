package com.taskbridge.app.ui.editor

import org.junit.Assert.assertEquals
import org.junit.Test

class ExternalEditorNavigationPolicyTest {
    @Test
    fun dirtyEditorRequiresConfirmationForWidgetOrNotificationNavigation() {
        assertEquals(
            ExternalEditorNavigationDecision.ConfirmDiscard,
            externalEditorNavigationDecision(currentRoute = "editor/{localId}", hasUnsavedChanges = true),
        )
    }

    @Test
    fun cleanEditorAndNonEditorRoutesNavigateImmediately() {
        assertEquals(
            ExternalEditorNavigationDecision.Navigate,
            externalEditorNavigationDecision(currentRoute = "editor", hasUnsavedChanges = false),
        )
        assertEquals(
            ExternalEditorNavigationDecision.Navigate,
            externalEditorNavigationDecision(currentRoute = "today", hasUnsavedChanges = true),
        )
    }
}
