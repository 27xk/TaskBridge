package com.taskbridge.app.ui.components

import com.taskbridge.app.ui.i18n.AppLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SyncStatusBarTest {
    @Test
    fun queuedStatusMessagesUseUserFacingSyncCopy() {
        val messages = listOf(
            syncStatusMessageText(SyncStatusMessage.CompletionQueued, AppLanguage.Chinese),
            syncStatusMessageText(SyncStatusMessage.RestoreQueued, AppLanguage.Chinese),
            syncStatusMessageText(SyncStatusMessage.DeleteQueued, AppLanguage.Chinese),
        )

        assertEquals(listOf("已完成，等待同步", "已恢复，等待同步", "已删除，等待同步"), messages)
        messages.forEach { message ->
            assertFalse(message.contains("同步队列"))
        }
    }

    @Test
    fun conflictStatusMessagesUseVersionChoiceWording() {
        assertEquals("已保留同步来的版本", syncStatusMessageText(SyncStatusMessage.UsingCloudVersion, AppLanguage.Chinese))
        assertEquals("This device version queued", syncStatusMessageText(SyncStatusMessage.OverwriteCloudQueued, AppLanguage.English))
    }

    @Test
    fun syncRunMessagesHaveTerminalSuccessFailureAndOfflineCopy() {
        assertEquals("同步完成", syncStatusMessageText(SyncStatusMessage.SyncSucceeded, AppLanguage.Chinese))
        assertEquals("Sync failed. Try again.", syncStatusMessageText(SyncStatusMessage.SyncFailed, AppLanguage.English))
        assertEquals("Offline. Changes will sync automatically when connected.", syncStatusMessageText(SyncStatusMessage.Offline, AppLanguage.English))
    }
}
