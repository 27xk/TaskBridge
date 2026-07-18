package com.taskbridge.app.ui.editor

enum class ExternalEditorNavigationDecision {
    Navigate,
    ConfirmDiscard,
}

fun externalEditorNavigationDecision(
    currentRoute: String?,
    hasUnsavedChanges: Boolean,
): ExternalEditorNavigationDecision {
    val isEditorRoute = currentRoute?.substringBefore('/')?.startsWith("editor") == true
    return if (isEditorRoute && hasUnsavedChanges) {
        ExternalEditorNavigationDecision.ConfirmDiscard
    } else {
        ExternalEditorNavigationDecision.Navigate
    }
}
