package com.taskbridge.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsUiPolicyTest {
    @Test
    fun syncQueueDiagnosticsUseReadableTaskRetryCopy() {
        val text = syncQueueDiagnosticText(
            action = "update",
            taskTitle = "Review launch checklist",
            attemptCount = 3,
            isEnglish = true,
        )

        assertEquals("Review launch checklist · Update task · Tried 3 times", text)
        assertFalse(text.contains("local-"))
        assertFalse(text.contains("attempts="))
    }

    @Test
    fun untitledSyncQueueDiagnosticsRemainReadableInChinese() {
        val text = syncQueueDiagnosticText(
            action = "delete",
            taskTitle = "",
            attemptCount = 1,
            isEnglish = false,
        )

        assertEquals("未命名任务 · 删除任务 · 已尝试 1 次", text)
    }

    @Test
    fun backupExportWarningExplainsSensitiveTaskData() {
        assertEquals(
            "本地备份会包含任务标题、内容、清单、时间和同步字段。请只分享给可信应用或人员。",
            backupExportSensitiveWarning(isEnglish = false),
        )
    }

    @Test
    fun backupImportUndoOnlyAllowsUnchangedImportedTasks() {
        assertEquals(
            true,
            canUndoImportedBackupTask(
                currentUpdatedAt = "2026-06-08T01:00:00Z",
                importedUpdatedAt = "2026-06-08T01:00:00Z",
            ),
        )
        assertFalse(
            canUndoImportedBackupTask(
                currentUpdatedAt = "2026-06-08T01:05:00Z",
                importedUpdatedAt = "2026-06-08T01:00:00Z",
            ),
        )
    }

    @Test
    fun backupImportUndoCopyExplainsChangedTasksAreKept() {
        assertEquals(
            "Undo 3 imported tasks from the most recent import? Tasks edited after import will be kept.",
            backupImportUndoConfirmationText(count = 3, isEnglish = true),
        )
        assertEquals(
            "Undid 2 imported tasks. 1 changed task was kept.",
            backupImportUndoResultText(undoneCount = 2, skippedChangedCount = 1, isEnglish = true),
        )
        assertEquals(
            "No imported tasks could be undone. 2 changed tasks were kept.",
            backupImportUndoResultText(undoneCount = 0, skippedChangedCount = 2, isEnglish = true),
        )
    }

    @Test
    fun backupImportSelectionErrorsDistinguishEmptyAndOversizedFiles() {
        assertEquals(
            "The selected file is empty.",
            backupImportEmptyFileMessage(isEnglish = true),
        )
        assertEquals(
            "The backup file is too large to import.",
            backupImportOversizedFileMessage(isEnglish = true),
        )
    }

    @Test
    fun syncRecoverySummaryIncludesFailedAndConflictTasks() {
        assertEquals(
            "Resolve 4 conflicts first. Also check 3 failed, 1 retry, and 2 waiting to sync.",
            syncRecoverySummaryText(
                pendingQueueCount = 2,
                exhaustedQueueCount = 1,
                failedTaskCount = 3,
                conflictTaskCount = 4,
                isEnglish = true,
            ),
        )
        assertEquals(
            "View and resolve conflicted tasks",
            syncRecoveryConflictActionText(isEnglish = true),
        )
        assertEquals(
            "Retry pending or failed sync",
            syncRecoveryRetryButtonText(isEnglish = true),
        )
        assertEquals(
            "Pending or failed changes can be retried now.",
            syncRecoveryRetryAvailableText(isEnglish = true),
        )
        assertEquals(
            "Sync recovery tools",
            syncRecoveryToolsTitle(isEnglish = true),
        )
        assertEquals(
            "Show sync recovery tools",
            syncRecoveryToolsToggleText(isOpen = false, isEnglish = true),
        )
    }

    @Test
    fun syncAtAGlanceExplainsWhenNoManualWorkIsNeeded() {
        assertEquals(
            "No pending, failed, or conflicting tasks are shown. You usually do not need to do anything.",
            syncAtAGlanceText(
                pendingQueueCount = 0,
                exhaustedQueueCount = 0,
                failedTaskCount = 0,
                conflictTaskCount = 0,
                isEnglish = true,
            ),
        )
        assertEquals(
            "Next step: keep adding tasks. TaskBridge will sync automatically.",
            syncNextStepText(
                pendingQueueCount = 0,
                exhaustedQueueCount = 0,
                failedTaskCount = 0,
                conflictTaskCount = 0,
                isEnglish = true,
            ),
        )
    }

    @Test
    fun syncNextStepPointsToDetailsWhenWorkNeedsAttention() {
        val nextStep = syncNextStepText(
            pendingQueueCount = 2,
            exhaustedQueueCount = 1,
            failedTaskCount = 3,
            conflictTaskCount = 1,
            isEnglish = true,
        )

        assertTrue(nextStep.contains("Open sync details"))
        assertTrue(nextStep.contains("failed items or conflicts"))
        assertTrue(nextStep.contains("before clearing this device"))
    }

    @Test
    fun localDataTrustTextExplainsDeviceAndServerBoundary() {
        val text = localDataTrustText(isEnglish = true)

        assertTrue(text.contains("this device"))
        assertTrue(text.contains("Server tasks will not be deleted"))
        assertTrue(text.contains("Export a local backup"))
    }

    @Test
    fun timeZoneChoicesUseReadableCityAndOffsetLabels() {
        assertEquals("Shanghai (UTC+08:00)", timeZoneOptionLabel("Asia/Shanghai", isEnglish = true))
        assertEquals("上海 (UTC+08:00)", timeZoneOptionLabel("Asia/Shanghai", isEnglish = false))
        assertEquals("Buenos Aires", timeZoneOptionLabel("America/Argentina/Buenos_Aires", isEnglish = true).substringBefore(" ("))
    }
}
