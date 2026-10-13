package com.taskbridge.app.ui.editor

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class EditorInputValidationTest {
    @Test
    fun taskInputLimitsMatchTheBackendContract() {
        assertEquals(EditorInputError.TitleRequired, validateEditorTaskInput(EditorUiState()))
        assertEquals(
            EditorInputError.TitleTooLong,
            validateEditorTaskInput(EditorUiState(title = "x".repeat(256))),
        )
        assertEquals(
            EditorInputError.ContentTooLong,
            validateEditorTaskInput(EditorUiState(title = "Task", content = "x".repeat(10_001))),
        )
        assertEquals(
            EditorInputError.TagTooLong,
            validateEditorTaskInput(EditorUiState(title = "Task", tag = "x".repeat(65))),
        )
        assertEquals(
            EditorInputError.ProjectTooLong,
            validateEditorTaskInput(EditorUiState(title = "Task", project = "x".repeat(129))),
        )
        assertEquals(
            EditorInputError.TemplateNameTooLong,
            validateEditorTaskInput(EditorUiState(title = "Task", isTemplate = true, templateName = "x".repeat(129))),
        )
        assertEquals(
            EditorInputError.ChecklistItemTooLong,
            validateEditorTaskInput(EditorUiState(title = "Task", checklistText = "x".repeat(256))),
        )
        assertEquals(
            EditorInputError.TooManyChecklistItems,
            validateEditorTaskInput(
                EditorUiState(
                    title = "Task",
                    checklistText = (1..101).joinToString("\n") { "Step $it" },
                ),
            ),
        )
        assertNull(
            validateEditorTaskInput(
                EditorUiState(
                    title = "x".repeat(255),
                    content = "x".repeat(10_000),
                    tag = "x".repeat(64),
                    project = "x".repeat(128),
                    isTemplate = true,
                    templateName = "x".repeat(128),
                    checklistText = (1..100).joinToString("\n") { "Step $it" },
                ),
            ),
        )
    }

    @Test
    fun taskInputLimitsCountUnicodeCodePointsWithoutSplittingEmoji() {
        val emoji = "\uD83D\uDE00"

        assertNull(validateEditorTaskInput(EditorUiState(title = emoji.repeat(255))))
        assertEquals(
            EditorInputError.TitleTooLong,
            validateEditorTaskInput(EditorUiState(title = emoji.repeat(256))),
        )
    }

    @Test
    fun editorInputUpdatesDoNotSilentlyTruncateUserText() {
        val source = androidSource("src/main/java/com/taskbridge/app/ui/editor/EditorViewModel.kt")

        assertFalse(source.contains(".take(TASK_TITLE_MAX_LENGTH)"))
        assertFalse(source.contains(".take(TASK_CONTENT_MAX_LENGTH)"))
        assertFalse(source.contains(".take(TASK_TAG_MAX_LENGTH)"))
        assertFalse(source.contains(".take(TASK_PROJECT_MAX_LENGTH)"))
        assertFalse(source.contains(".take(TASK_TEMPLATE_NAME_MAX_LENGTH)"))
    }

    @Test
    fun plannedDateAllowsEmptyOrIsoLocalDate() {
        assertTrue(isValidPlannedDateInput(""))
        assertTrue(isValidPlannedDateInput("2026-06-07"))
    }

    @Test
    fun plannedDateRejectsInvalidCalendarDatesAndFreeText() {
        assertFalse(isValidPlannedDateInput("2026-13-01"))
        assertFalse(isValidPlannedDateInput("2026-02-30"))
        assertFalse(isValidPlannedDateInput("next Friday"))
    }

    @Test
    fun quickAddPreviewShowsParsedFieldsBeforeSaving() {
        val chips = buildQuickAddPreviewChips(
            title = "明天下午3点 写周报 #工作 @运营 P3",
            timeZoneId = "Asia/Shanghai",
            languageCode = "zh-CN",
            now = LocalDateTime.of(2026, 6, 9, 9, 0),
        )

        assertEquals(
            listOf("标题: 写周报", "截止: 2026-06-10 15:00", "高", "#工作", "@运营"),
            chips,
        )
    }

    @Test
    fun todayEntryPresetCreatesATodayDraftWithoutMakingItDirty() {
        val state = initialEditorDraftForPreset(
            preset = EditorEntryPreset.Today,
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        assertEquals("2026-06-09", state.plannedDate)
        assertEquals("today", state.listType)
        assertFalse(state.hasUnsavedChanges)
        assertEquals(null, state.editingLocalId)
    }

    @Test
    fun todayDraftChangingPlannedDateMovesBackToInbox() {
        val state = initialEditorDraftForPreset(
            preset = EditorEntryPreset.Today,
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        val next = editorDraftWithPlannedDate(
            state = state,
            value = "2026-06-10",
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        assertEquals("2026-06-10", next.plannedDate)
        assertEquals("inbox", next.listType)
    }

    @Test
    fun todayDraftClearingPlannedDateMovesBackToInbox() {
        val state = initialEditorDraftForPreset(
            preset = EditorEntryPreset.Today,
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        val next = editorDraftWithPlannedDate(
            state = state,
            value = "",
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        assertEquals("", next.plannedDate)
        assertEquals("inbox", next.listType)
    }

    @Test
    fun inboxDraftSettingTodayDateDoesNotForceHiddenTodayListType() {
        val next = editorDraftWithPlannedDate(
            state = EditorUiState(listType = "inbox"),
            value = "2026-06-09",
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        assertEquals("2026-06-09", next.plannedDate)
        assertEquals("inbox", next.listType)
    }

    @Test
    fun selectingTodayLocationKeepsNewTaskVisibleToday() {
        val next = editorDraftWithListType(
            state = EditorUiState(listType = "inbox", plannedDate = ""),
            value = "today",
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        assertEquals("today", next.listType)
        assertEquals("2026-06-09", next.plannedDate)
    }

    @Test
    fun invalidListTypeFallsBackToInbox() {
        val next = editorDraftWithListType(
            state = EditorUiState(listType = "today", plannedDate = "2026-06-09"),
            value = "archive",
            today = java.time.LocalDate.of(2026, 6, 9),
        )

        assertEquals("inbox", next.listType)
        assertEquals("2026-06-09", next.plannedDate)
    }

    @Test
    fun disablingTemplateModeClearsTheTemplateName() {
        val next = editorDraftWithTemplateState(
            state = EditorUiState(isTemplate = true, templateName = "Weekly review"),
            value = false,
        )

        assertFalse(next.isTemplate)
        assertEquals("", next.templateName)
    }

    @Test
    fun shortSharedTextUsesTitleOnly() {
        val draft = sharedTextToEditorDraft("Review release checklist")

        assertEquals("Review release checklist", draft.title)
        assertEquals("", draft.content)
    }

    @Test
    fun longSharedTextKeepsFullTextInContent() {
        val shared = """
            Release checklist

            1. Verify Android build
            2. Verify desktop build
            3. Publish notes
        """.trimIndent()

        val draft = sharedTextToEditorDraft(shared)

        assertEquals("Release checklist", draft.title)
        assertEquals(shared, draft.content)
    }

    @Test
    fun sharedEmojiTitleIsTruncatedOnCodePointBoundaries() {
        val emoji = "\uD83D\uDE00"
        val shared = emoji.repeat(256)

        val draft = sharedTextToEditorDraft(shared)

        assertEquals(255, draft.title.codePointCount(0, draft.title.length))
        assertFalse(draft.title.last().isHighSurrogate())
        assertEquals(shared, draft.content)
    }
}
