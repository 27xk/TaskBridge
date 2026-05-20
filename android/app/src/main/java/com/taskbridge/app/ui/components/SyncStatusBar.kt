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

@Composable
fun SyncStatusBar(text: String, modifier: Modifier = Modifier) {
    val language = LocalAppLanguage.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Text(
            text = localizeSyncText(text, language),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

private fun localizeSyncText(text: String, language: AppLanguage): String {
    if (language == AppLanguage.Chinese) return text
    return when {
        text == "鏈湴缂撳瓨宸插氨缁?" -> "Local cache is ready"
        text == "瀹屾垚宸插姞鍏ュ悓姝ラ槦鍒?" -> "Completion queued for sync"
        text == "鎭㈠寰呭姙宸插姞鍏ュ悓姝ラ槦鍒?" -> "Restore queued for sync"
        text == "鍒犻櫎宸插姞鍏ュ悓姝ラ槦鍒?" -> "Delete queued for sync"
        text.startsWith("宸叉壒閲忓畬鎴?") -> text.replace("宸叉壒閲忓畬鎴?", "Completed").replace("鏉′换鍔?", "tasks")
        text.startsWith("宸叉壒閲忓垹闄?") -> text.replace("宸叉壒閲忓垹闄?", "Deleted").replace("鏉′换鍔?", "tasks")
        text == "宸查噰鐢ㄤ簯绔増鏈?" -> "Using cloud version"
        text == "宸叉帓闃熻鐩栦簯绔?" -> "Overwrite cloud queued"
        text == "宸查『寤跺埌鏄庡ぉ" -> "Postponed to tomorrow"
        text == "宸茬◢鍚庢彁閱?" -> "Snoozed"
        text == "宸插姞鍏ヤ粖鏃ヨ鍒?" -> "Planned for today"
        text == "宸茬Щ鍥炴敹浠剁" -> "Moved to inbox"
        text == "姝ｅ湪鍚屾" -> "Syncing"
        else -> text
    }
}
