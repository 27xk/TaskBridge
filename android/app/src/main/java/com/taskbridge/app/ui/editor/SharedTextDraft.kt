package com.taskbridge.app.ui.editor

private const val MAX_SHARED_TITLE_LENGTH = 255

data class SharedTextEditorDraft(
    val title: String,
    val content: String = "",
)

fun sharedTextToEditorDraft(text: String): SharedTextEditorDraft {
    val trimmed = text.trim()
    if (trimmed.length <= MAX_SHARED_TITLE_LENGTH && !trimmed.contains('\n') && !trimmed.contains('\r')) {
        return SharedTextEditorDraft(title = trimmed)
    }

    val firstLine = trimmed
        .lineSequence()
        .map(String::trim)
        .firstOrNull(String::isNotBlank)
        .orEmpty()
    val title = firstLine
        .ifBlank { trimmed.take(80).trim() }
        .take(MAX_SHARED_TITLE_LENGTH)

    return SharedTextEditorDraft(title = title, content = trimmed)
}
