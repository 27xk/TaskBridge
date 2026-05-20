package com.taskbridge.app.ui.settings

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.gson.Gson
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.AppSection
import com.taskbridge.app.ui.components.AppUiOption
import com.taskbridge.app.ui.components.languageOptions
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    val context = androidx.compose.ui.platform.LocalContext.current
    val strings = LocalTaskBridgeStrings.current
    val scope = rememberCoroutineScope()
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
    var widgetOpacityDraft by remember(widgetOpacity) { mutableStateOf(widgetOpacity.toFloat()) }
    var timeZoneDraft by remember(displayTimeZone) { mutableStateOf(displayTimeZone) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    var timeZoneMenuOpen by remember { mutableStateOf(false) }
    var widgetScopeMenuOpen by remember { mutableStateOf(false) }
    var widgetCompletionMenuOpen by remember { mutableStateOf(false) }
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
    val selectedZone = timeZoneOptions.firstOrNull { it.id == timeZoneDraft }
    val selectedZoneLabel = selectedZone?.label(isEnglish) ?: timeZoneDraft

    AppPage(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            AppHeader(
                title = strings.settings,
                trailing = {
                    TextButton(onClick = onBack) {
                        Text(strings.back)
                    }
                },
            )

            AppSection(
                title = if (isEnglish) "Account and display" else "账号与显示",
            ) {
                AppPanel {
                    AppDropdownField(
                        label = strings.language,
                        selectedLabel = if (language == AppLanguage.Chinese) strings.chinese else strings.english,
                        expanded = languageMenuOpen,
                        options = languageOptions(strings),
                        onExpandedChange = { languageMenuOpen = it },
                        onSelect = onLanguageChange,
                    )
                    AppDropdownField(
                        label = if (isEnglish) "Display time zone" else "显示时区",
                        selectedLabel = selectedZoneLabel,
                        expanded = timeZoneMenuOpen,
                        options = timeZoneOptions.map { AppUiOption(it.id, it.label(isEnglish)) },
                        onExpandedChange = { timeZoneMenuOpen = it },
                        onSelect = { nextZone ->
                            timeZoneDraft = nextZone
                            scope.launch {
                                tokenDataStore.saveDisplayTimeZone(nextZone)
                                TodayTaskWidgetUpdateWorker.enqueue(context)
                            }
                        },
                    )
                    Text(
                        text = if (isEnglish) {
                            "Task times use this display zone. Synced data stays in UTC."
                        } else {
                            "任务时间按该时区显示，同步数据仍按 UTC 保存。"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            AppSection(
                title = if (isEnglish) "Widget settings" else "小组件设置",
            ) {
                AppPanel {
                    AppDropdownField(
                        label = if (isEnglish) "Widget task range" else "小组件显示范围",
                        selectedLabel = widgetScopeLabel(widgetTaskScope, isEnglish),
                        expanded = widgetScopeMenuOpen,
                        options = listOf(
                            AppUiOption(WidgetConstants.TASK_SCOPE_TODAY, widgetScopeLabel(WidgetConstants.TASK_SCOPE_TODAY, isEnglish)),
                            AppUiOption(WidgetConstants.TASK_SCOPE_ALL, widgetScopeLabel(WidgetConstants.TASK_SCOPE_ALL, isEnglish)),
                        ),
                        onExpandedChange = { widgetScopeMenuOpen = it },
                        onSelect = { nextScope ->
                            scope.launch {
                                tokenDataStore.saveWidgetTaskScope(nextScope)
                                TodayTaskWidgetUpdateWorker.enqueue(context)
                            }
                        },
                    )
                    Text(
                        text = if (isEnglish) {
                            "The widget reads local Room data only. Switching range does not trigger network requests."
                        } else {
                            "小组件只读取本地 Room 数据，切换范围不会直接请求网络。"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    AppDropdownField(
                        label = if (isEnglish) "Widget completion filter" else "小组件完成状态",
                        selectedLabel = widgetCompletionScopeLabel(widgetCompletionScope, isEnglish),
                        expanded = widgetCompletionMenuOpen,
                        options = listOf(
                            AppUiOption(WidgetConstants.COMPLETION_SCOPE_OPEN, widgetCompletionScopeLabel(WidgetConstants.COMPLETION_SCOPE_OPEN, isEnglish)),
                            AppUiOption(WidgetConstants.COMPLETION_SCOPE_ALL, widgetCompletionScopeLabel(WidgetConstants.COMPLETION_SCOPE_ALL, isEnglish)),
                        ),
                        onExpandedChange = { widgetCompletionMenuOpen = it },
                        onSelect = { nextScope ->
                            scope.launch {
                                tokenDataStore.saveWidgetCompletionScope(nextScope)
                                TodayTaskWidgetUpdateWorker.enqueue(context)
                            }
                        },
                    )
                    Text(
                        text = if (isEnglish) {
                            "Widget opacity: ${widgetOpacityDraft.roundToInt()}%"
                        } else {
                            "桌面小组件透明度：${widgetOpacityDraft.roundToInt()}%"
                        },
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Slider(
                        value = widgetOpacityDraft,
                        onValueChange = { widgetOpacityDraft = it },
                        onValueChangeFinished = {
                            val nextOpacity = widgetOpacityDraft.roundToInt().coerceIn(0, 100)
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            AppSection(
                title = if (isEnglish) "Data and session" else "数据与会话",
            ) {
                AppPanel {
                    Button(
                        onClick = {
                            scope.launch {
                                val tasks = taskRepository.exportBackupTasks()
                                val backupJson = withContext(Dispatchers.Default) {
                                    Gson().toJson(
                                        mapOf(
                                            "format" to "taskbridge.local.backup.v1",
                                            "exported_at" to Instant.now().toString(),
                                            "tasks" to tasks,
                                        ),
                                    )
                                }
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = "application/json"
                                    putExtra(Intent.EXTRA_SUBJECT, "TaskBridge backup")
                                    putExtra(Intent.EXTRA_TEXT, backupJson)
                                }
                                context.startActivity(Intent.createChooser(intent, strings.exportBackup))
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.exportBackup)
                    }
                    Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                        Text(strings.signOut)
                    }
                }
            }
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
