package com.taskbridge.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.AppLanguage

@Composable
fun SyncStatusBar(text: String, modifier: Modifier = Modifier) {
    val language = LocalAppLanguage.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            text = localizeSyncText(text, language),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

private fun localizeSyncText(text: String, language: AppLanguage): String {
    if (language == AppLanguage.Chinese) return text
    return when {
        text == "本地缓存已就绪" -> "Local cache is ready"
        text == "完成已加入同步队列" -> "Completion queued for sync"
        text == "恢复待办已加入同步队列" -> "Restore queued for sync"
        text == "删除已加入同步队列" -> "Delete queued for sync"
        text.startsWith("已批量完成") -> text.replace("已批量完成", "Completed").replace("条任务", "tasks")
        text.startsWith("已批量删除") -> text.replace("已批量删除", "Deleted").replace("条任务", "tasks")
        text == "已采用云端版本" -> "Using cloud version"
        text == "已排队覆盖云端" -> "Overwrite cloud queued"
        text == "已顺延到明天" -> "Postponed to tomorrow"
        text == "已稍后提醒" -> "Snoozed"
        text == "已加入今日计划" -> "Planned for today"
        text == "已移回收件箱" -> "Moved to inbox"
        text == "正在同步" -> "Syncing"
        else -> text
    }
}
