package com.taskbridge.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalAppLanguage

sealed interface SyncStatusMessage {
    object LocalCacheReady : SyncStatusMessage
    object CompletionQueued : SyncStatusMessage
    object RestoreQueued : SyncStatusMessage
    object DeleteQueued : SyncStatusMessage
    object Purged : SyncStatusMessage
    object PurgeFailed : SyncStatusMessage
    data class BatchCompleted(val count: Int) : SyncStatusMessage
    data class BatchDeleted(val count: Int) : SyncStatusMessage
    data class BatchRestored(val count: Int) : SyncStatusMessage
    data class BatchPurged(val count: Int) : SyncStatusMessage
    object UsingCloudVersion : SyncStatusMessage
    object OverwriteCloudQueued : SyncStatusMessage
    object PostponedToTomorrow : SyncStatusMessage
    object Snoozed : SyncStatusMessage
    object PlannedForToday : SyncStatusMessage
    object MovedToInbox : SyncStatusMessage
    object Syncing : SyncStatusMessage
}

@Composable
fun SyncStatusBar(message: SyncStatusMessage, modifier: Modifier = Modifier) {
    val language = LocalAppLanguage.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Text(
            text = syncStatusMessageText(message, language),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

fun syncStatusMessageText(message: SyncStatusMessage, language: AppLanguage): String {
    return if (language == AppLanguage.Chinese) {
        when (message) {
            SyncStatusMessage.LocalCacheReady -> "本地缓存已就绪"
            SyncStatusMessage.CompletionQueued -> "已完成，等待同步"
            SyncStatusMessage.RestoreQueued -> "已恢复，等待同步"
            SyncStatusMessage.DeleteQueued -> "已删除，等待同步"
            SyncStatusMessage.Purged -> "已永久删除"
            SyncStatusMessage.PurgeFailed -> "永久删除失败，请稍后重试"
            is SyncStatusMessage.BatchCompleted -> "已批量完成 ${message.count} 条任务"
            is SyncStatusMessage.BatchDeleted -> "已批量删除 ${message.count} 条任务"
            is SyncStatusMessage.BatchRestored -> "已批量恢复 ${message.count} 条任务"
            is SyncStatusMessage.BatchPurged -> "已批量永久删除 ${message.count} 条任务"
            SyncStatusMessage.UsingCloudVersion -> "已保留同步来的版本"
            SyncStatusMessage.OverwriteCloudQueued -> "已排队保留这台设备版本"
            SyncStatusMessage.PostponedToTomorrow -> "已顺延到明天"
            SyncStatusMessage.Snoozed -> "已稍后提醒"
            SyncStatusMessage.PlannedForToday -> "已加入今日计划"
            SyncStatusMessage.MovedToInbox -> "已移回收件箱"
            SyncStatusMessage.Syncing -> "正在同步"
        }
    } else {
        when (message) {
            SyncStatusMessage.LocalCacheReady -> "Local cache is ready"
            SyncStatusMessage.CompletionQueued -> "Completion queued for sync"
            SyncStatusMessage.RestoreQueued -> "Restore queued for sync"
            SyncStatusMessage.DeleteQueued -> "Delete queued for sync"
            SyncStatusMessage.Purged -> "Permanently deleted"
            SyncStatusMessage.PurgeFailed -> "Permanent delete failed. Try again."
            is SyncStatusMessage.BatchCompleted -> "Completed ${message.count} tasks"
            is SyncStatusMessage.BatchDeleted -> "Deleted ${message.count} tasks"
            is SyncStatusMessage.BatchRestored -> "Restored ${message.count} tasks"
            is SyncStatusMessage.BatchPurged -> "Permanently deleted ${message.count} tasks"
            SyncStatusMessage.UsingCloudVersion -> "Synced version kept"
            SyncStatusMessage.OverwriteCloudQueued -> "This device version queued"
            SyncStatusMessage.PostponedToTomorrow -> "Postponed to tomorrow"
            SyncStatusMessage.Snoozed -> "Snoozed"
            SyncStatusMessage.PlannedForToday -> "Planned for today"
            SyncStatusMessage.MovedToInbox -> "Moved to inbox"
            SyncStatusMessage.Syncing -> "Syncing"
        }
    }
}
