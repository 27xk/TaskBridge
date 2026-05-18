package com.taskbridge.app.ui.settings

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.gson.Gson
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.launch
import java.time.Instant
import kotlin.math.roundToInt

@Composable
fun SettingsScreen(
    taskRepository: TaskRepository,
    tokenDataStore: TokenDataStore,
    language: AppLanguage,
    onLanguageChange: (AppLanguage) -> Unit,
    onBack: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val strings = LocalTaskBridgeStrings.current
    val scope = rememberCoroutineScope()
    val tasks = taskRepository.observeTasks().collectAsStateWithLifecycle(initialValue = emptyList()).value
    val widgetOpacity by tokenDataStore.widgetOpacityPercent.collectAsStateWithLifecycle(initialValue = 78)
    val widgetTaskScope by tokenDataStore.widgetTaskScope.collectAsStateWithLifecycle(
        initialValue = WidgetConstants.TASK_SCOPE_TODAY,
    )
    val widgetCompletionScope by tokenDataStore.widgetCompletionScope.collectAsStateWithLifecycle(
        initialValue = WidgetConstants.COMPLETION_SCOPE_OPEN,
    )
    val displayTimeZone by tokenDataStore.displayTimeZone.collectAsStateWithLifecycle(
        initialValue = ShanghaiTime.DEFAULT_ZONE_ID,
    )
    val widgetOpacityDraft = remember(widgetOpacity) { mutableStateOf(widgetOpacity.toFloat()) }
    val timeZoneDraft = remember(displayTimeZone) { mutableStateOf(displayTimeZone) }
    val languageMenuOpen = remember { mutableStateOf(false) }
    val timeZoneMenuOpen = remember { mutableStateOf(false) }
    val widgetScopeMenuOpen = remember { mutableStateOf(false) }
    val widgetCompletionMenuOpen = remember { mutableStateOf(false) }
    val isEnglish = language == AppLanguage.English
    val timeZoneOptions = remember {
        listOf(
            TimeZoneOption("Asia/Shanghai", "中国标准时间", "China Standard Time"),
            TimeZoneOption("Asia/Tokyo", "日本时间", "Japan Time"),
            TimeZoneOption("Asia/Singapore", "新加坡时间", "Singapore Time"),
            TimeZoneOption("UTC", "UTC", "UTC"),
            TimeZoneOption("Europe/London", "伦敦时间", "London Time"),
            TimeZoneOption("America/New_York", "纽约时间", "New York Time"),
            TimeZoneOption("America/Los_Angeles", "洛杉矶时间", "Los Angeles Time"),
        )
    }
    val selectedZone = timeZoneOptions.firstOrNull { it.id == timeZoneDraft.value }
    val selectedZoneLabel = selectedZone?.label(isEnglish) ?: timeZoneDraft.value

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(strings.settings, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))

        Text(strings.language, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Column {
            OutlinedButton(
                onClick = { languageMenuOpen.value = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (language == AppLanguage.Chinese) strings.chinese else strings.english)
            }
            DropdownMenu(
                expanded = languageMenuOpen.value,
                onDismissRequest = { languageMenuOpen.value = false },
            ) {
                DropdownMenuItem(
                    text = { Text(strings.chinese) },
                    onClick = {
                        languageMenuOpen.value = false
                        onLanguageChange(AppLanguage.Chinese)
                    },
                )
                DropdownMenuItem(
                    text = { Text(strings.english) },
                    onClick = {
                        languageMenuOpen.value = false
                        onLanguageChange(AppLanguage.English)
                    },
                )
            }
        }

        Spacer(Modifier.height(18.dp))
        Text(if (isEnglish) "Display time zone" else "显示时区", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Column {
            OutlinedButton(
                onClick = { timeZoneMenuOpen.value = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(selectedZoneLabel)
            }
            DropdownMenu(
                expanded = timeZoneMenuOpen.value,
                onDismissRequest = { timeZoneMenuOpen.value = false },
            ) {
                timeZoneOptions.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.label(isEnglish)) },
                        onClick = {
                            timeZoneDraft.value = option.id
                            timeZoneMenuOpen.value = false
                            scope.launch {
                                tokenDataStore.saveDisplayTimeZone(option.id)
                                TodayTaskWidgetUpdateWorker.enqueue(context)
                            }
                        },
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (isEnglish) {
                "Task times are displayed in this time zone. Sync data is still stored as UTC."
            } else {
                "任务时间会按该时区显示，同步数据仍按 UTC 保存。"
            },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )

        Spacer(Modifier.height(18.dp))
        Text(if (isEnglish) "Widget task range" else "小组件显示范围", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Column {
            OutlinedButton(
                onClick = { widgetScopeMenuOpen.value = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(widgetScopeLabel(widgetTaskScope, isEnglish))
            }
            DropdownMenu(
                expanded = widgetScopeMenuOpen.value,
                onDismissRequest = { widgetScopeMenuOpen.value = false },
            ) {
                listOf(WidgetConstants.TASK_SCOPE_TODAY, WidgetConstants.TASK_SCOPE_ALL).forEach { scopeValue ->
                    DropdownMenuItem(
                        text = { Text(widgetScopeLabel(scopeValue, isEnglish)) },
                        onClick = {
                            widgetScopeMenuOpen.value = false
                            scope.launch {
                                tokenDataStore.saveWidgetTaskScope(scopeValue)
                                TodayTaskWidgetUpdateWorker.enqueue(context)
                            }
                        },
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (isEnglish) {
                "The widget reads local Room data only. Switching range does not trigger network requests."
            } else {
                "小组件只读取本地 Room 数据，切换范围不会直接请求网络。"
            },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )

        Spacer(Modifier.height(18.dp))
        Text(if (isEnglish) "Widget completion filter" else "小组件完成状态", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Column {
            OutlinedButton(
                onClick = { widgetCompletionMenuOpen.value = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(widgetCompletionScopeLabel(widgetCompletionScope, isEnglish))
            }
            DropdownMenu(
                expanded = widgetCompletionMenuOpen.value,
                onDismissRequest = { widgetCompletionMenuOpen.value = false },
            ) {
                listOf(WidgetConstants.COMPLETION_SCOPE_OPEN, WidgetConstants.COMPLETION_SCOPE_ALL).forEach { scopeValue ->
                    DropdownMenuItem(
                        text = { Text(widgetCompletionScopeLabel(scopeValue, isEnglish)) },
                        onClick = {
                            widgetCompletionMenuOpen.value = false
                            scope.launch {
                                tokenDataStore.saveWidgetCompletionScope(scopeValue)
                                TodayTaskWidgetUpdateWorker.enqueue(context)
                            }
                        },
                    )
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        Text(
            text = if (isEnglish) {
                "Widget opacity: ${widgetOpacityDraft.value.roundToInt()}%"
            } else {
                "桌面小组件透明度：${widgetOpacityDraft.value.roundToInt()}%"
            },
            style = MaterialTheme.typography.titleMedium,
        )
        Slider(
            value = widgetOpacityDraft.value,
            onValueChange = { widgetOpacityDraft.value = it },
            onValueChangeFinished = {
                val nextOpacity = widgetOpacityDraft.value.roundToInt().coerceIn(0, 100)
                scope.launch {
                    tokenDataStore.saveWidgetOpacityPercent(nextOpacity)
                    TodayTaskWidgetUpdateWorker.enqueue(context)
                }
            },
            valueRange = 0f..100f,
            steps = 19,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = if (isEnglish) {
                "Only the widget background changes. Text stays fully opaque."
            } else {
                "只调整小组件背景透明度，文字保持不透明。"
            },
            style = MaterialTheme.typography.bodySmall,
        )

        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/json"
                    putExtra(Intent.EXTRA_SUBJECT, "TaskBridge backup")
                    putExtra(
                        Intent.EXTRA_TEXT,
                        Gson().toJson(
                            mapOf(
                                "format" to "taskbridge.local.backup.v1",
                                "exported_at" to Instant.now().toString(),
                                "tasks" to tasks,
                            ),
                        ),
                    )
                }
                context.startActivity(Intent.createChooser(intent, strings.exportBackup))
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(strings.exportBackup)
        }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Text(strings.signOut)
        }
        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text(strings.back)
        }
    }
}

private data class TimeZoneOption(
    val id: String,
    val zhName: String,
    val enName: String,
) {
    fun label(isEnglish: Boolean): String {
        return if (isEnglish) "$enName  $id" else "$zhName  $id"
    }
}

private fun widgetScopeLabel(scope: String, isEnglish: Boolean): String {
    return when (scope) {
        WidgetConstants.TASK_SCOPE_ALL -> if (isEnglish) "All tasks" else "全部任务"
        else -> if (isEnglish) "Today tasks" else "今日待办"
    }
}

private fun widgetCompletionScopeLabel(scope: String, isEnglish: Boolean): String {
    return when (scope) {
        WidgetConstants.COMPLETION_SCOPE_ALL -> if (isEnglish) "Open and completed" else "未完成和已完成"
        else -> if (isEnglish) "Open only" else "只显示未完成"
    }
}
