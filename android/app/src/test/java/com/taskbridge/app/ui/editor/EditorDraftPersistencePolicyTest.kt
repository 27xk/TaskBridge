package com.taskbridge.app.ui.editor

import org.junit.Assert.assertEquals
import org.junit.Test

class EditorDraftPersistencePolicyTest {
    @Test
    fun savedStateReferenceNeverContainsDraftText() {
        val reference = editorSavedStateReference("draft-123", "task-7")

        assertEquals("draft-123", reference.draftId)
        assertEquals("task-7", reference.editingLocalId)
        check(reference::class.java.declaredFields.none { it.name in setOf("title", "content", "checklistText") })
    }
}
