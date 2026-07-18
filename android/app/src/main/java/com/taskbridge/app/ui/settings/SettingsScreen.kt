package com.taskbridge.app.ui.settings

import android.content.ClipData
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.gson.Gson
import com.taskbridge.app.BuildConfig
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.datastore.deriveNetworkEndpoints
import com.taskbridge.app.data.datastore.inferServerBaseUrlFromApi
import com.taskbridge.app.data.datastore.validateApiBaseUrl
import com.taskbridge.app.data.datastore.validateWebSocketUrl
import com.taskbridge.app.data.repository.AuthRepository
import com.taskbridge.app.data.remote.dto.AuthSessionDto
import com.taskbridge.app.data.local.SyncQueueCounts
import com.taskbridge.app.data.local.SyncQueueEntity
import com.taskbridge.app.data.repository.BackupImportErrorCode
import com.taskbridge.app.data.repository.BackupImportPreview
import com.taskbridge.app.data.repository.BackupImportUndoItem
import com.taskbridge.app.data.repository.TaskRepository
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.sync.SyncRunState
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppDynamicStatusText
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.AppSection
import com.taskbridge.app.ui.components.AppUiOption
import com.taskbridge.app.ui.components.languageOptions
import com.taskbridge.app.ui.components.tryOpenExternalUri
import com.taskbridge.app.ui.components.userFacingConnectionErrorMessage
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings
import com.taskbridge.app.ui.login.PasswordTextField
import com.taskbridge.app.utils.ShanghaiTime
import com.taskbridge.app.widget.TodayTaskWidgetUpdateWorker
import com.taskbridge.app.widget.WidgetConstants
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt

private const val MAX_SELECTED_BACKUP_BYTES = 20_000_000
private const val LATEST_RELEASE_URL = "https://github.com/27xk/TaskBridge/releases/latest"

private data class PendingBackupImport(
    val raw: String,
    val preview: BackupImportPreview,
)

private enum class SettingsSection {
    Preferences,
    Connection,
    Account,
    Data,
    Troubleshooting,
}

private fun initialSettingsSection(initialSection: String?): SettingsSection {
    return when (initialSection) {
        "connection" -> SettingsSection.Connection
        "account" -> SettingsSection.Account
        "data" -> SettingsSection.Data
        "sync-recovery",
        "troubleshooting" -> SettingsSection.Troubleshooting
        else -> SettingsSection.Preferences
    }
}

private fun formatBackupImportPreviewMessage(preview: BackupImportPreview, isEnglish: Boolean): String {
    return if (isEnglish) {
        "This will add ${preview.importableCount} tasks from the selected backup to this device. Scanned ${preview.scannedCount} tasks and skipped ${preview.skippedCount} invalid tasks. Only the most recent import can be undone; tasks edited after import will be kept."
    } else {
        "将从所选备份向本机添加 ${preview.importableCount} 条任务。已扫描 ${preview.scannedCount} 条，跳过 ${preview.skippedCount} 条无效任务。只能撤销最近一次导入，导入后编辑过的任务会保留。"
    }
}

private fun formatBackupImportFailureMessage(errorCode: BackupImportErrorCode?, isEnglish: Boolean): String {
    return when (errorCode) {
        BackupImportErrorCode.FileTooLarge -> if (isEnglish) {
            "The backup file is too large to import."
        } else {
            "备份文件过大，已拒绝导入。"
        }
        BackupImportErrorCode.InvalidJson -> if (isEnglish) {
            "The selected file is not valid JSON."
        } else {
            "所选文件不是有效的 JSON。"
        }
        BackupImportErrorCode.UnsupportedFormat -> if (isEnglish) {
            "This backup format is not supported."
        } else {
            "备份格式不受支持。"
        }
        BackupImportErrorCode.MissingTasks -> if (isEnglish) {
            "The backup file does not contain a task list."
        } else {
            "备份文件缺少任务列表。"
        }
        BackupImportErrorCode.NoValidTasks, null -> if (isEnglish) {
            "No valid tasks were found. Check that this is a TaskBridge backup."
        } else {
            "未找到可导入的有效任务，请确认文件来自 TaskBridge 备份。"
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    taskRepository: TaskRepository,
    authRepository: AuthRepository,
    syncManager: SyncManager,
    tokenDataStore: TokenDataStore,
    language: AppLanguage,
    initialSection: String? = null,
    onLanguageChange: (AppLanguage) -> Unit,
    onBack: () -> Unit,
    onOpenConflictTasks: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val uriHandler = LocalUriHandler.current
    val strings = LocalTaskBridgeStrings.current
    val scope = rememberCoroutineScope()
    val widgetOpacity by tokenDataStore.widgetOpacityPercent.collectAsStateWithLifecycle(initialValue = 78)
    val widgetTaskScope by tokenDataStore.widgetTaskScope.collectAsStateWithLifecycle(
        initialValue = WidgetConstants.TASK_SCOPE_TODAY,
    )
    val widgetCompletionScope by tokenDataStore.widgetCompletionScope.collectAsStateWithLifecycle(
        initialValue = WidgetConstants.COMPLETION_SCOPE_OPEN,
    )
    val widgetStyle by tokenDataStore.widgetStyle.collectAsStateWithLifecycle(
        initialValue = WidgetConstants.STYLE_CLEAR,
    )
    val displayTimeZone by tokenDataStore.displayTimeZone.collectAsStateWithLifecycle(
        initialValue = ShanghaiTime.DEFAULT_ZONE_ID,
    )
    val apiBaseUrl by tokenDataStore.apiBaseUrl.collectAsStateWithLifecycle(initialValue = "")
    val serverBaseUrl by tokenDataStore.serverBaseUrl.collectAsStateWithLifecycle(initialValue = "")
    val webSocketUrl by tokenDataStore.webSocketUrl.collectAsStateWithLifecycle(initialValue = "")
    val lastBackupImportUndoItemsRaw by tokenDataStore.lastBackupImportUndoItems.collectAsStateWithLifecycle(initialValue = null)
    val gson = remember { Gson() }
    var widgetOpacityDraft by remember(widgetOpacity) { mutableStateOf(widgetOpacity.toFloat()) }
    var timeZoneDraft by remember(displayTimeZone) { mutableStateOf(displayTimeZone) }
    var serverBaseUrlDraft by remember(serverBaseUrl) { mutableStateOf(serverBaseUrl) }
    var apiBaseUrlDraft by remember(apiBaseUrl) { mutableStateOf(apiBaseUrl) }
    var webSocketUrlDraft by remember(webSocketUrl) { mutableStateOf(webSocketUrl) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    var timeZoneMenuOpen by remember { mutableStateOf(false) }
    var widgetScopeMenuOpen by remember { mutableStateOf(false) }
    var widgetCompletionMenuOpen by remember { mutableStateOf(false) }
    var widgetStyleMenuOpen by remember { mutableStateOf(false) }
    var syncQueueCounts by remember { mutableStateOf<SyncQueueCounts?>(null) }
    var conflictTaskCount by remember { mutableStateOf(0) }
    var failedSyncTaskCount by remember { mutableStateOf(0) }
    var exhaustedSyncQueuePreview by remember { mutableStateOf<List<SyncQueueEntity>>(emptyList()) }
    var syncRecoveryNote by remember { mutableStateOf("") }
    var syncRecoveryNoteIsError by remember { mutableStateOf(false) }
    var backupImportNote by remember { mutableStateOf("") }
    var backupImportNoteIsError by remember { mutableStateOf(false) }
    var pendingBackupImport by remember { mutableStateOf<PendingBackupImport?>(null) }
    var confirmBackupImport by remember { mutableStateOf(false) }
    var confirmUndoBackupImport by remember { mutableStateOf(false) }
    var lastImportedBackupLocalIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var lastImportedBackupUndoItems by remember { mutableStateOf<List<BackupImportUndoItem>>(emptyList()) }
    var connectionNote by remember { mutableStateOf("") }
    var connectionNoteIsError by remember { mutableStateOf(false) }
    var externalLinkError by remember { mutableStateOf("") }
    var testConnection by remember { mutableStateOf(false) }
    var advancedConnectionOpen by remember { mutableStateOf(false) }
    var supportToolsOpen by remember(initialSection) { mutableStateOf(initialSection == "sync-recovery") }
    var showTechnicalDiagnostics by remember { mutableStateOf(false) }
    var confirmLogoutWithPendingSync by remember { mutableStateOf(false) }
    var confirmExportBackup by remember { mutableStateOf(false) }
    var confirmClearLocalData by remember { mutableStateOf(false) }
    var confirmRevokeOtherSessions by remember { mutableStateOf(false) }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmNewPassword by remember { mutableStateOf("") }
    var passwordNote by remember { mutableStateOf("") }
    var passwordNoteIsError by remember { mutableStateOf(false) }
    var changingPassword by remember { mutableStateOf(false) }
    var sessions by remember { mutableStateOf<List<AuthSessionDto>>(emptyList()) }
    var sessionsLoading by remember { mutableStateOf(false) }
    var sessionsLoaded by remember { mutableStateOf(false) }
    var sessionNote by remember { mutableStateOf("") }
    var sessionNoteIsError by remember { mutableStateOf(false) }
    var selectedSection by remember(initialSection) { mutableStateOf(initialSettingsSection(initialSection)) }
    val isEnglish = language == AppLanguage.English

    suspend fun refreshAccountSessions() {
        sessionsLoading = true
        authRepository.sessions()
            .onSuccess { loadedSessions ->
                sessions = loadedSessions
                sessionsLoaded = true
                if (sessionNoteIsError) sessionNote = ""
                sessionNoteIsError = false
            }
            .onFailure {
                sessionNoteIsError = true
                sessionNote = if (isEnglish) {
                    "Could not load signed-in sessions. Try again."
                } else {
                    "无法加载登录会话，请重试。"
                }
            }
        sessionsLoading = false
    }

    fun loadSessions() {
        scope.launch { refreshAccountSessions() }
    }

    fun submitPasswordChange() {
        val validationError = when {
            currentPassword.isBlank() -> if (isEnglish) "Enter your current password." else "请输入当前密码。"
            newPassword.length !in 8..128 -> if (isEnglish) {
                "The new password must contain 8 to 128 characters."
            } else {
                "新密码长度必须为 8 到 128 个字符。"
            }
            newPassword != confirmNewPassword -> if (isEnglish) {
                "The new passwords do not match."
            } else {
                "两次输入的新密码不一致。"
            }
            else -> null
        }
        if (validationError != null) {
            passwordNoteIsError = true
            passwordNote = validationError
            return
        }
        scope.launch {
            changingPassword = true
            authRepository.changePassword(currentPassword, newPassword)
                .onSuccess { revoked ->
                    currentPassword = ""
                    newPassword = ""
                    confirmNewPassword = ""
                    passwordNoteIsError = false
                    passwordNote = if (isEnglish) {
                        "Password changed. $revoked other sessions were signed out."
                    } else {
                        "密码已修改，另有 $revoked 个会话已退出。"
                    }
                    refreshAccountSessions()
                }
                .onFailure {
                    passwordNoteIsError = true
                    passwordNote = if (isEnglish) {
                        "Could not change the password. Check the current password and try again."
                    } else {
                        "无法修改密码，请检查当前密码后重试。"
                    }
                }
            changingPassword = false
        }
    }

    fun revokeOtherSessions() {
        if (sessionsLoading) return
        sessionsLoading = true
        scope.launch {
            try {
                authRepository.revokeOtherSessions()
                    .onSuccess { revoked ->
                        sessionNoteIsError = false
                        sessionNote = if (isEnglish) {
                            "$revoked other sessions were signed out."
                        } else {
                            "已退出其他设备上的 $revoked 个会话。"
                        }
                        refreshAccountSessions()
                    }
                    .onFailure {
                        sessionNoteIsError = true
                        sessionNote = if (isEnglish) {
                            "Could not sign out other sessions. Try again."
                        } else {
                            "无法退出其他会话，请重试。"
                        }
                    }
            } finally {
                sessionsLoading = false
            }
        }
    }
    LaunchedEffect(initialSection) {
        selectedSection = initialSettingsSection(initialSection)
        if (initialSection == "sync-recovery") {
            supportToolsOpen = true
        }
    }
    LaunchedEffect(selectedSection) {
        if (selectedSection == SettingsSection.Account && !sessionsLoaded && !sessionsLoading) {
            refreshAccountSessions()
        }
    }
    LaunchedEffect(lastBackupImportUndoItemsRaw) {
        val undoItems = parseBackupImportUndoItems(gson, lastBackupImportUndoItemsRaw)
        lastImportedBackupUndoItems = undoItems
        lastImportedBackupLocalIds = undoItems.map { it.localId }
    }

    fun setConnectionFailure(error: Throwable) {
        connectionNoteIsError = true
        val detail = userFacingConnectionErrorMessage(error, isEnglish)
        connectionNote = if (isEnglish) "Connection failed: $detail" else "连接失败：$detail"
    }

    fun resetGeneratedEndpoints() {
        val endpoints = runCatching { deriveNetworkEndpoints(serverBaseUrlDraft) }
            .getOrElse { error ->
                setConnectionFailure(error)
                return
            }
        serverBaseUrlDraft = endpoints.serverBaseUrl
        apiBaseUrlDraft = endpoints.apiBaseUrl
        webSocketUrlDraft = endpoints.webSocketUrl
        connectionNote = ""
        connectionNoteIsError = false
    }

    fun saveAdvancedConnection() {
        val normalizedApiBaseUrl = runCatching { validateApiBaseUrl(apiBaseUrlDraft) }
            .getOrElse { error ->
                setConnectionFailure(error)
                return
            }
        val normalizedWebSocketUrl = runCatching { validateWebSocketUrl(webSocketUrlDraft) }
            .getOrElse { error ->
                setConnectionFailure(error)
                return
            }
        apiBaseUrlDraft = normalizedApiBaseUrl
        webSocketUrlDraft = normalizedWebSocketUrl
        serverBaseUrlDraft = inferServerBaseUrlFromApi(normalizedApiBaseUrl)
        scope.launch {
            testConnection = true
            tokenDataStore.saveNetworkEndpoints(normalizedApiBaseUrl, normalizedWebSocketUrl)
            authRepository.testConnection()
                .onSuccess {
                    syncManager.disconnectForegroundWebSocket()
                    syncManager.connectForegroundWebSocket()
                    syncManager.enqueueNetworkSync()
                    syncManager.syncNow()
                    connectionNoteIsError = false
                    connectionNote = if (isEnglish) {
                        "Connection is ready."
                    } else {
                        "连接可用。"
                    }
                }
                .onFailure { error ->
                    connectionNoteIsError = true
                    val detail = userFacingConnectionErrorMessage(error, isEnglish)
                    connectionNote = if (isEnglish) "Connection failed: $detail" else "连接失败：$detail"
                }
            testConnection = false
        }
    }

    val timeZoneOptions = remember {
        val preferredZones = listOf(
            "Asia/Shanghai",
            "Asia/Tokyo",
            "Asia/Singapore",
            "UTC",
            "Europe/London",
            "America/New_York",
            "America/Los_Angeles",
        )
        (preferredZones + ZoneId.getAvailableZoneIds().sorted())
            .distinct()
            .map(::TimeZoneOption)
    }
    val selectedZone = timeZoneOptions.firstOrNull { it.id == timeZoneDraft }
    val selectedZoneLabel = selectedZone?.label(isEnglish) ?: timeZoneDraft
    val pendingQueueCount = syncQueueCounts?.pending ?: 0
    val exhaustedQueueCount = syncQueueCounts?.exhausted ?: 0
    val recoverableSyncIssueCount = pendingQueueCount + exhaustedQueueCount + failedSyncTaskCount
    val clearLocalDataBlocked = recoverableSyncIssueCount > 0 || conflictTaskCount > 0
    val syncRecoveryToolsVisible = supportToolsOpen || recoverableSyncIssueCount > 0 || conflictTaskCount > 0

    suspend fun refreshSyncDiagnostics() {
        syncQueueCounts = taskRepository.getSyncQueueCounts()
        conflictTaskCount = taskRepository.getConflictTaskCount()
        failedSyncTaskCount = taskRepository.getFailedSyncTaskCount()
        exhaustedSyncQueuePreview = taskRepository.getExhaustedSyncQueuePreview()
    }

    fun showBackupImportPreview(raw: String) {
        scope.launch {
            val preview = taskRepository.previewBackupImport(raw)
            if (preview.errorCode != null || preview.importableCount <= 0) {
                backupImportNoteIsError = true
                backupImportNote = formatBackupImportFailureMessage(preview.errorCode, isEnglish)
                pendingBackupImport = null
                confirmBackupImport = false
                return@launch
            }
            pendingBackupImport = PendingBackupImport(raw = raw, preview = preview)
            confirmBackupImport = true
        }
    }

    fun importBackup(raw: String) {
        scope.launch {
            val result = taskRepository.importBackupJsonDetailed(raw)
            refreshSyncDiagnostics()
            TodayTaskWidgetUpdateWorker.enqueue(context.applicationContext)
            syncManager.enqueueNetworkSync()
            syncManager.syncNow()
            lastImportedBackupLocalIds = result.importedLocalIds
            lastImportedBackupUndoItems = result.importedUndoItems
            if (result.importedUndoItems.isEmpty()) {
                tokenDataStore.clearLastBackupImportUndoItems()
            } else {
                tokenDataStore.saveLastBackupImportUndoItems(gson.toJson(result.importedUndoItems))
            }
            backupImportNoteIsError = result.importedCount <= 0
            backupImportNote = if (result.importedCount > 0) {
                val skippedNote = if (result.skippedCount > 0) {
                    if (isEnglish) " Skipped ${result.skippedCount} invalid tasks." else " 跳过 ${result.skippedCount} 条无效任务。"
                } else {
                    ""
                }
                if (isEnglish) {
                    "Imported ${result.importedCount} tasks.$skippedNote You can undo the most recent import before making more changes; edited tasks will be kept."
                } else {
                    "已导入 ${result.importedCount} 条任务。$skippedNote 继续操作前可撤销最近一次导入；导入后编辑过的任务会保留。"
                }
            } else {
                formatBackupImportFailureMessage(result.errorCode, isEnglish)
            }
        }
    }

    fun undoLastBackupImport() {
        val undoItems = lastImportedBackupUndoItems
        if (undoItems.isEmpty()) return
        scope.launch {
            val result = taskRepository.undoImportedBackupTasks(undoItems)
            lastImportedBackupLocalIds = emptyList()
            lastImportedBackupUndoItems = emptyList()
            tokenDataStore.clearLastBackupImportUndoItems()
            refreshSyncDiagnostics()
            TodayTaskWidgetUpdateWorker.enqueue(context.applicationContext)
            syncManager.enqueueNetworkSync()
            syncManager.syncNow()
            backupImportNote = backupImportUndoResultText(
                undoneCount = result.undoneCount,
                skippedChangedCount = result.skippedChangedCount,
                isEnglish = isEnglish,
            )
            backupImportNoteIsError = false
        }
    }

    val importBackupLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val raw = withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    readBackupTextWithLimit(input)
                } ?: BackupTextReadResult.Empty
            }
            when (raw) {
                BackupTextReadResult.Empty -> {
                    backupImportNoteIsError = true
                    backupImportNote = backupImportEmptyFileMessage(isEnglish)
                }
                BackupTextReadResult.TooLarge -> {
                    backupImportNoteIsError = true
                    backupImportNote = formatBackupImportFailureMessage(BackupImportErrorCode.FileTooLarge, isEnglish)
                }
                is BackupTextReadResult.Success -> {
                    showBackupImportPreview(raw.value)
                }
            }
        }
    }

    fun shareBackup() {
        scope.launch {
            val tasks = taskRepository.exportBackupTasks()
            val backupJson = withContext(Dispatchers.Default) {
                gson.toJson(
                    mapOf(
                        "format" to "taskbridge.local.backup.v1",
                        "exported_at" to Instant.now().toString(),
                        "tasks" to tasks,
                    ),
                )
            }
            val backupFile = withContext(Dispatchers.IO) {
                val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
                File(exportDir, "taskbridge-backup-${Instant.now().toEpochMilli()}.json").apply {
                    writeText(backupJson, Charsets.UTF_8)
                }
            }
            val backupUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                backupFile,
            )
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_SUBJECT, "TaskBridge backup")
                putExtra(Intent.EXTRA_STREAM, backupUri)
                clipData = ClipData.newUri(
                    context.contentResolver,
                    "TaskBridge backup",
                    backupUri,
                )
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, strings.exportBackup))
        }
    }

    fun clearLocalDeviceData() {
        scope.launch {
            syncManager.disconnectForegroundWebSocket()
            taskRepository.clearLocalDeviceData()
            TodayTaskWidgetUpdateWorker.enqueue(context.applicationContext)
            onLogout()
        }
    }

    LaunchedEffect(Unit) {
        refreshSyncDiagnostics()
    }

    if (confirmRevokeOtherSessions) {
        AlertDialog(
            onDismissRequest = { confirmRevokeOtherSessions = false },
            title = { Text(if (isEnglish) "Sign out other devices?" else "退出其他设备？") },
            text = {
                Text(
                    if (isEnglish) {
                        "All other active sessions will be revoked. This device will stay signed in."
                    } else {
                        "其他设备上的所有有效会话都会被撤销，这台设备会保持登录。"
                    },
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmRevokeOtherSessions = false
                        revokeOtherSessions()
                    },
                ) {
                    Text(if (isEnglish) "Sign out other devices" else "退出其他设备")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmRevokeOtherSessions = false }) {
                    Text(strings.cancel)
                }
            },
        )
    }

    if (confirmLogoutWithPendingSync) {
        AlertDialog(
            onDismissRequest = { confirmLogoutWithPendingSync = false },
            title = { Text(if (isEnglish) "Sign out?" else "退出登录？") },
            text = {
                Text(
                    if (isEnglish) {
                        "There are pending, failed, or conflicted sync items. Local data stays on this device, but other devices may not see those changes yet."
                    } else {
                        "当前仍有待同步、同步失败或存在冲突的任务。本机数据仍会保留，但其他设备暂时看不到这些修改。"
                    },
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmLogoutWithPendingSync = false
                        onLogout()
                    },
                ) {
                    Text(strings.signOut)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogoutWithPendingSync = false }) {
                    Text(strings.cancel)
                }
            },
        )
    }

    if (confirmExportBackup) {
        AlertDialog(
            onDismissRequest = { confirmExportBackup = false },
            title = { Text(if (isEnglish) "Export local backup?" else "导出本地备份？") },
            text = { Text(backupExportSensitiveWarning(isEnglish)) },
            confirmButton = {
                Button(
                    onClick = {
                        confirmExportBackup = false
                        shareBackup()
                    },
                ) {
                    Text(strings.exportBackup)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmExportBackup = false }) {
                    Text(strings.cancel)
                }
            },
        )
    }

    if (confirmClearLocalData) {
        AlertDialog(
            onDismissRequest = { confirmClearLocalData = false },
            title = { Text(if (isEnglish) "Clear this device?" else "清除此设备数据？") },
            text = {
                Text(clearLocalDataConfirmationText(isEnglish))
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmClearLocalData = false
                        clearLocalDeviceData()
                    },
                ) {
                    Text(if (isEnglish) "Clear this device" else "清除此设备数据")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmClearLocalData = false }) {
                    Text(strings.cancel)
                }
            },
        )
    }

    if (confirmBackupImport) {
        val pending = pendingBackupImport
        if (pending != null) {
            AlertDialog(
                onDismissRequest = {
                    confirmBackupImport = false
                    pendingBackupImport = null
                },
                title = { Text(if (isEnglish) "Import backup?" else "导入备份？") },
                text = {
                    Text(
                        if (isEnglish) {
                            formatBackupImportPreviewMessage(pending.preview, isEnglish)
                        } else {
                            formatBackupImportPreviewMessage(pending.preview, isEnglish)
                        },
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            confirmBackupImport = false
                            pendingBackupImport = null
                            importBackup(pending.raw)
                        },
                    ) {
                        Text(strings.importBackup)
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            confirmBackupImport = false
                            pendingBackupImport = null
                        },
                    ) {
                        Text(strings.cancel)
                    }
                },
            )
        }
    }

    if (confirmUndoBackupImport) {
        AlertDialog(
            onDismissRequest = { confirmUndoBackupImport = false },
            title = { Text(if (isEnglish) "Undo import?" else "\u64a4\u9500\u5bfc\u5165\uff1f") },
            text = {
                Text(
                    backupImportUndoConfirmationText(
                        count = lastImportedBackupLocalIds.size,
                        isEnglish = isEnglish,
                    ),
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmUndoBackupImport = false
                        undoLastBackupImport()
                    },
                ) {
                    Text(if (isEnglish) "Undo last import" else "\u64a4\u9500\u4e0a\u6b21\u5bfc\u5165")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmUndoBackupImport = false }) {
                    Text(strings.cancel)
                }
            },
        )
    }

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

            AppPanel {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SettingsSectionButton(
                        text = if (isEnglish) "Preferences" else "偏好",
                        selected = selectedSection == SettingsSection.Preferences,
                        onClick = { selectedSection = SettingsSection.Preferences },
                    )
                    SettingsSectionButton(
                        text = if (isEnglish) "Connection" else "连接",
                        selected = selectedSection == SettingsSection.Connection,
                        onClick = { selectedSection = SettingsSection.Connection },
                    )
                    SettingsSectionButton(
                        text = if (isEnglish) "Account" else "账号",
                        selected = selectedSection == SettingsSection.Account,
                        onClick = { selectedSection = SettingsSection.Account },
                    )
                    SettingsSectionButton(
                        text = if (isEnglish) "Data and backups" else "数据与备份",
                        selected = selectedSection == SettingsSection.Data,
                        onClick = { selectedSection = SettingsSection.Data },
                    )
                    SettingsSectionButton(
                        text = if (isEnglish) "Sync issues" else "同步问题",
                        selected = selectedSection == SettingsSection.Troubleshooting,
                        onClick = { selectedSection = SettingsSection.Troubleshooting },
                    )
                }
                Text(
                    text = settingsSectionStatusText(
                        section = selectedSection,
                        isEnglish = isEnglish,
                        connectionHasError = connectionNoteIsError,
                        syncIssueCount = recoverableSyncIssueCount,
                        conflictTaskCount = conflictTaskCount,
                        undoImportAvailable = lastImportedBackupLocalIds.isNotEmpty(),
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            if (selectedSection == SettingsSection.Preferences) {
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
                                "The widget shows tasks already saved on this device. It updates after sync."
                            } else {
                                "小组件显示本机已保存的任务，同步后会自动更新。"
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
                        AppDropdownField(
                            label = if (isEnglish) "Widget style" else "小组件样式",
                            selectedLabel = widgetStyleLabel(widgetStyle, isEnglish),
                            expanded = widgetStyleMenuOpen,
                            options = listOf(
                                AppUiOption(WidgetConstants.STYLE_CLEAR, widgetStyleLabel(WidgetConstants.STYLE_CLEAR, isEnglish)),
                                AppUiOption(WidgetConstants.STYLE_TRANSPARENT, widgetStyleLabel(WidgetConstants.STYLE_TRANSPARENT, isEnglish)),
                            ),
                            onExpandedChange = { widgetStyleMenuOpen = it },
                            onSelect = { nextStyle ->
                                scope.launch {
                                    tokenDataStore.saveWidgetStyle(nextStyle)
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
                                val nextOpacity = widgetOpacityDraft.roundToInt().coerceIn(60, 100)
                                scope.launch {
                                    tokenDataStore.saveWidgetOpacityPercent(nextOpacity)
                                    TodayTaskWidgetUpdateWorker.enqueue(context)
                                }
                            },
                            valueRange = 60f..100f,
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
                    title = if (isEnglish) "About" else "关于",
                ) {
                    AppPanel {
                        Text(
                            text = if (isEnglish) {
                                "Installed version ${BuildConfig.VERSION_NAME}"
                            } else {
                                "当前版本 ${BuildConfig.VERSION_NAME}"
                            },
                            style = MaterialTheme.typography.titleSmall,
                        )
                        OutlinedButton(
                            onClick = {
                                externalLinkError = if (tryOpenExternalUri(uriHandler, LATEST_RELEASE_URL)) {
                                    ""
                                } else {
                                    strings.externalLinkFailed
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(if (isEnglish) "View latest release" else "查看最新版本")
                        }
                        if (externalLinkError.isNotBlank()) {
                            AppDynamicStatusText(
                                text = externalLinkError,
                                isError = true,
                            )
                        }
                    }
                }
            }

            if (selectedSection == SettingsSection.Connection) {
                AppSection(
                    title = if (isEnglish) "Connection and sync" else "连接与同步",
                ) {
                    AppPanel {
                    OutlinedTextField(
                        value = serverBaseUrlDraft,
                        onValueChange = {
                            serverBaseUrlDraft = it
                            connectionNote = ""
                            connectionNoteIsError = false
                        },
                        label = { Text(if (isEnglish) "Server URL" else "服务器地址") },
                        isError = connectionNoteIsError,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        text = if (isEnglish) {
                            "Enter the TaskBridge server address. Advanced connection settings are generated automatically."
                        } else {
                            "填写 TaskBridge 服务器地址即可，高级连接设置会自动生成。"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    localhostWarningText(serverBaseUrlDraft, isEnglish)?.let { warning ->
                        Text(
                            text = warning,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Button(
                        onClick = {
                            scope.launch {
                                testConnection = true
                                val endpoints = runCatching { deriveNetworkEndpoints(serverBaseUrlDraft) }
                                    .getOrElse { error ->
                                        setConnectionFailure(error)
                                        testConnection = false
                                        return@launch
                                    }
                                serverBaseUrlDraft = endpoints.serverBaseUrl
                                apiBaseUrlDraft = endpoints.apiBaseUrl
                                webSocketUrlDraft = endpoints.webSocketUrl
                                tokenDataStore.saveServerBaseUrl(endpoints.serverBaseUrl)
                                authRepository.testConnection()
                                    .onSuccess {
                                        connectionNoteIsError = false
                                        connectionNote = if (isEnglish) {
                                            "Connection is ready."
                                        } else {
                                            "连接可用。"
                                        }
                                    }
                                    .onFailure { error -> setConnectionFailure(error) }
                                testConnection = false
                            }
                        },
                        enabled = !testConnection,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (testConnection) {
                                if (isEnglish) "Testing..." else "测试中..."
                            } else {
                                if (isEnglish) "Test connection" else "检查连接"
                            },
                        )
                    }
                    TextButton(onClick = { advancedConnectionOpen = !advancedConnectionOpen }) {
                        Text(if (isEnglish) "Troubleshooting: custom connection URLs" else "排障：自定义连接地址")
                    }
                    if (advancedConnectionOpen) {
                        OutlinedTextField(
                            value = apiBaseUrlDraft,
                            onValueChange = {
                                apiBaseUrlDraft = it
                                runCatching { validateApiBaseUrl(it) }
                                    .onSuccess { apiUrl -> serverBaseUrlDraft = inferServerBaseUrlFromApi(apiUrl) }
                                connectionNote = ""
                                connectionNoteIsError = false
                            },
                            label = { Text(if (isEnglish) "Request address for custom proxy" else "自定义请求地址") },
                            isError = connectionNoteIsError,
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = webSocketUrlDraft,
                            onValueChange = {
                                webSocketUrlDraft = it
                                connectionNote = ""
                                connectionNoteIsError = false
                            },
                            label = { Text(if (isEnglish) "Sync address for custom proxy" else "自定义同步地址") },
                            isError = connectionNoteIsError,
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        TextButton(onClick = { resetGeneratedEndpoints() }) {
                            Text(if (isEnglish) "Regenerate from server URL" else "按服务器地址重新生成")
                        }
                        Button(
                            onClick = { saveAdvancedConnection() },
                            enabled = !testConnection,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(if (isEnglish) "Test connection" else "检查连接")
                        }
                    }
                    if (connectionNote.isNotBlank()) {
                        AppDynamicStatusText(
                            text = connectionNote,
                            isError = connectionNoteIsError,
                        )
                    }
                    }
                }
            }

            if (selectedSection == SettingsSection.Account) {
                AppSection(
                    title = if (isEnglish) "Account" else "账号",
                ) {
                    AppPanel {
                    Text(
                        text = if (isEnglish) "Change password" else "修改密码",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    PasswordTextField(
                        value = currentPassword,
                        onValueChange = {
                            currentPassword = it
                            passwordNote = ""
                            passwordNoteIsError = false
                        },
                        strings = strings,
                        label = if (isEnglish) "Current password" else "当前密码",
                        enabled = !changingPassword,
                        isError = passwordNoteIsError,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    PasswordTextField(
                        value = newPassword,
                        onValueChange = {
                            newPassword = it
                            passwordNote = ""
                            passwordNoteIsError = false
                        },
                        strings = strings,
                        label = if (isEnglish) "New password" else "新密码",
                        enabled = !changingPassword,
                        isError = passwordNoteIsError,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    PasswordTextField(
                        value = confirmNewPassword,
                        onValueChange = {
                            confirmNewPassword = it
                            passwordNote = ""
                            passwordNoteIsError = false
                        },
                        strings = strings,
                        label = if (isEnglish) "Confirm new password" else "确认新密码",
                        enabled = !changingPassword,
                        isError = passwordNoteIsError,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = { submitPasswordChange() },
                        enabled = !changingPassword,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (changingPassword) {
                                if (isEnglish) "Changing..." else "正在修改..."
                            } else {
                                if (isEnglish) "Change password" else "修改密码"
                            },
                        )
                    }
                    if (passwordNote.isNotBlank()) {
                        AppDynamicStatusText(
                            text = passwordNote,
                            isError = passwordNoteIsError,
                        )
                    }
                    Text(
                        text = if (isEnglish) "Signed-in sessions" else "登录会话",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    OutlinedButton(
                        onClick = { loadSessions() },
                        enabled = !sessionsLoading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (sessionsLoading) {
                                if (isEnglish) "Loading..." else "正在加载..."
                            } else {
                                if (isEnglish) "Refresh sessions" else "刷新会话"
                            },
                        )
                    }
                    sessions.forEach { session ->
                        Text(
                            text = session.deviceId?.takeIf { it.isNotBlank() }
                                ?: if (isEnglish) "Unknown device" else "未知设备",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            text = if (isEnglish) {
                                "Created ${ShanghaiTime.formatDateTime(session.createdAt, displayTimeZone)} · Expires ${ShanghaiTime.formatDateTime(session.expiresAt, displayTimeZone)}"
                            } else {
                                "创建于 ${ShanghaiTime.formatDateTime(session.createdAt, displayTimeZone)} · 到期于 ${ShanghaiTime.formatDateTime(session.expiresAt, displayTimeZone)}"
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Button(
                        onClick = { confirmRevokeOtherSessions = true },
                        enabled = !sessionsLoading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (isEnglish) "Sign out other devices" else "退出其他设备")
                    }
                    if (sessionNote.isNotBlank()) {
                        AppDynamicStatusText(
                            text = sessionNote,
                            isError = sessionNoteIsError,
                        )
                    }
                    Text(
                        text = if (isEnglish) {
                            "Sign out only affects this device. Local data stays here."
                        } else {
                            "退出登录只影响这台设备，本机数据仍会保留。"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Button(
                        onClick = {
                            if (recoverableSyncIssueCount > 0 || conflictTaskCount > 0) {
                                confirmLogoutWithPendingSync = true
                            } else {
                                onLogout()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.signOut)
                    }
                    TextButton(
                        onClick = { confirmClearLocalData = true },
                        enabled = !clearLocalDataBlocked,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (isEnglish) "Clear this device" else "清除此设备数据")
                    }
                    Text(
                        text = if (clearLocalDataBlocked) {
                            clearLocalDataBlockedHint(isEnglish)
                        } else {
                            clearLocalDataSafetyHint(isEnglish)
                        },
                        color = if (clearLocalDataBlocked) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        style = MaterialTheme.typography.bodySmall,
                    )
                    }
                }
            }

            if (selectedSection == SettingsSection.Data) {
                AppSection(
                    title = if (isEnglish) "Data and backups" else "数据与备份",
                ) {
                    AppPanel {
                    Text(
                        text = syncAtAGlanceText(
                            pendingQueueCount = pendingQueueCount,
                            exhaustedQueueCount = exhaustedQueueCount,
                            failedTaskCount = failedSyncTaskCount,
                            conflictTaskCount = conflictTaskCount,
                            isEnglish = isEnglish,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        text = syncNextStepText(
                            pendingQueueCount = pendingQueueCount,
                            exhaustedQueueCount = exhaustedQueueCount,
                            failedTaskCount = failedSyncTaskCount,
                            conflictTaskCount = conflictTaskCount,
                            isEnglish = isEnglish,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        text = localDataTrustText(isEnglish),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        text = if (isEnglish) {
                            "Export a local JSON backup before switching accounts or devices."
                        } else {
                            "切换账号或设备前，可先导出本地 JSON 备份。"
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Button(
                        onClick = { confirmExportBackup = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.exportBackup)
                    }
                    Button(
                        onClick = { importBackupLauncher.launch(arrayOf("application/json", "text/*", "*/*")) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.importBackup)
                    }
                    if (backupImportNote.isNotBlank()) {
                        AppDynamicStatusText(
                            text = backupImportNote,
                            isError = backupImportNoteIsError,
                        )
                    }
                    if (lastImportedBackupLocalIds.isNotEmpty()) {
                        TextButton(
                            onClick = { confirmUndoBackupImport = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(if (isEnglish) "Undo last import" else "撤销上次导入")
                        }
                    }
                    }
                }
            }

            if (selectedSection == SettingsSection.Troubleshooting) {
                AppSection(
                    title = if (isEnglish) "Sync issues" else "同步问题",
                ) {
                    AppPanel {
                        if (recoverableSyncIssueCount == 0 && conflictTaskCount == 0) {
                            TextButton(onClick = { supportToolsOpen = !supportToolsOpen }, modifier = Modifier.fillMaxWidth()) {
                                Text(syncRecoveryToolsToggleText(supportToolsOpen, isEnglish))
                            }
                        }
                        if (syncRecoveryToolsVisible) {
                            Text(
                                text = syncRecoveryToolsTitle(isEnglish),
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text(
                                text = syncRecoverySummaryText(
                                    pendingQueueCount = pendingQueueCount,
                                    exhaustedQueueCount = exhaustedQueueCount,
                                    failedTaskCount = failedSyncTaskCount,
                                    conflictTaskCount = conflictTaskCount,
                                    isEnglish = isEnglish,
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (exhaustedSyncQueuePreview.isEmpty()) {
                                Text(
                                    text = if (recoverableSyncIssueCount > 0) {
                                        syncRecoveryRetryAvailableText(isEnglish)
                                    } else {
                                        syncRecoveryNoManualRetryText(isEnglish)
                                    },
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    exhaustedSyncQueuePreview.take(5).forEach { item ->
                                        val itemTitle = item.title?.takeIf { it.isNotBlank() }
                                            ?: if (isEnglish) "Untitled task" else "未命名任务"
                                        Text(
                                            text = itemTitle,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                        Text(
                                            text = if (isEnglish) "Needs a manual retry" else "需要手动重试",
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                            }
                            TextButton(
                                onClick = { showTechnicalDiagnostics = !showTechnicalDiagnostics },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    if (showTechnicalDiagnostics) {
                                        if (isEnglish) "Hide technical diagnostics" else "收起高级诊断"
                                    } else {
                                        if (isEnglish) "Show technical diagnostics" else "查看高级诊断"
                                    },
                                )
                            }
                            if (showTechnicalDiagnostics && exhaustedSyncQueuePreview.isNotEmpty()) {
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    exhaustedSyncQueuePreview.take(5).forEach { item ->
                                        Text(
                                            text = syncQueueDiagnosticText(
                                                action = item.action,
                                                taskTitle = item.title,
                                                attemptCount = item.attemptCount,
                                                isEnglish = isEnglish,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                            }
                            if (conflictTaskCount > 0) {
                                Button(
                                    onClick = { onOpenConflictTasks() },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(syncRecoveryConflictActionText(isEnglish))
                                }
                            }
                            Button(
                                onClick = {
                                    scope.launch {
                                        taskRepository.retryExhaustedSyncQueue()
                                        syncManager.enqueueNetworkSync()
                                        val syncResult = syncManager.syncNowAndWait()
                                        refreshSyncDiagnostics()
                                        syncRecoveryNoteIsError = syncResult is SyncRunState.Failure
                                        syncRecoveryNote = when (syncResult) {
                                            SyncRunState.Success -> if (isEnglish) {
                                                "Sync completed. Diagnostics are up to date."
                                            } else {
                                                "同步完成，诊断信息已更新。"
                                            }
                                            SyncRunState.Offline -> if (isEnglish) {
                                                "Offline. Retry will resume automatically when connected."
                                            } else {
                                                "当前离线，联网后会自动继续同步。"
                                            }
                                            is SyncRunState.Failure -> if (isEnglish) {
                                                "Sync failed. Diagnostics were refreshed; try again after checking the connection."
                                            } else {
                                                "同步失败，诊断信息已刷新；请检查网络后重试。"
                                            }
                                            SyncRunState.Idle,
                                            SyncRunState.Syncing -> if (isEnglish) "Sync did not finish." else "同步尚未完成。"
                                        }
                                    }
                                },
                                enabled = recoverableSyncIssueCount > 0,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(syncRecoveryRetryButtonText(isEnglish))
                            }
                            if (syncRecoveryNote.isNotBlank()) {
                                AppDynamicStatusText(
                                    text = syncRecoveryNote,
                                    isError = syncRecoveryNoteIsError,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private sealed interface BackupTextReadResult {
    data class Success(val value: String) : BackupTextReadResult
    object Empty : BackupTextReadResult
    object TooLarge : BackupTextReadResult
}

private fun readBackupTextWithLimit(input: InputStream, maxBytes: Int = MAX_SELECTED_BACKUP_BYTES): BackupTextReadResult {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var totalBytes = 0
    while (true) {
        val read = input.read(buffer)
        if (read == -1) break
        totalBytes += read
        if (totalBytes > maxBytes) return BackupTextReadResult.TooLarge
        output.write(buffer, 0, read)
    }
    val value = output.toString(Charsets.UTF_8.name())
    return if (value.isBlank()) BackupTextReadResult.Empty else BackupTextReadResult.Success(value)
}

private fun settingsSectionStatusText(
    section: SettingsSection,
    isEnglish: Boolean,
    connectionHasError: Boolean,
    syncIssueCount: Int,
    conflictTaskCount: Int,
    undoImportAvailable: Boolean,
): String {
    return when (section) {
        SettingsSection.Preferences -> if (isEnglish) {
            "Language, time zone, and widget options save as you change them."
        } else {
            "语言、时区和小组件选项会在修改后保存。"
        }
        SettingsSection.Connection -> if (connectionHasError) {
            if (isEnglish) "Connection needs attention. Save and test the server URL again." else "连接需要处理，请重新保存并检查服务器地址。"
        } else {
            if (isEnglish) "Use the server URL first. Advanced URLs are only for custom proxies." else "优先填写服务器地址；高级地址只适合自定义代理。"
        }
        SettingsSection.Account -> if (syncIssueCount > 0 || conflictTaskCount > 0) {
            if (isEnglish) "Some local changes have not reached other devices yet. Review sync before signing out." else "仍有修改未同步到其他设备，退出前请先查看同步状态。"
        } else {
            if (isEnglish) "Signing out keeps local data on this device." else "退出登录会保留这台设备上的本机数据。"
        }
        SettingsSection.Data -> if (undoImportAvailable) {
            if (isEnglish) "The last backup import can still be undone." else "上次备份导入仍可撤销。"
        } else {
            if (isEnglish) "Export a local backup before switching accounts or devices." else "切换账号或设备前，建议先导出本机备份。"
        }
        SettingsSection.Troubleshooting -> if (syncIssueCount > 0 || conflictTaskCount > 0) {
            if (isEnglish) "There are sync items that may need a retry or conflict decision." else "存在可能需要重试或处理冲突的同步项。"
        } else {
            if (isEnglish) "No manual sync recovery is required right now." else "当前通常不需要手动处理同步恢复。"
        }
    }
}

@Composable
private fun SettingsSectionButton(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    if (selected) {
        Button(onClick = onClick) {
            Text(text)
        }
    } else {
        TextButton(onClick = onClick) {
            Text(text)
        }
    }
}

private data class TimeZoneOption(
    val id: String,
) {
    fun label(isEnglish: Boolean): String {
        return timeZoneOptionLabel(id, isEnglish)
    }
}

internal fun timeZoneOptionLabel(id: String, isEnglish: Boolean): String {
    val knownNames = mapOf(
        "Asia/Shanghai" to ("上海" to "Shanghai"),
        "Asia/Tokyo" to ("东京" to "Tokyo"),
        "Asia/Singapore" to ("新加坡" to "Singapore"),
        "UTC" to ("协调世界时" to "UTC"),
        "Europe/London" to ("伦敦" to "London"),
        "America/New_York" to ("纽约" to "New York"),
        "America/Los_Angeles" to ("洛杉矶" to "Los Angeles"),
    )
    val cityName = knownNames[id]?.let { (zh, en) -> if (isEnglish) en else zh }
        ?: id.substringAfterLast('/').replace('_', ' ')
    val offset = timeZoneOffsetLabel(id)
    return if (offset.isNullOrBlank()) cityName else "$cityName ($offset)"
}

private fun timeZoneOffsetLabel(id: String): String? {
    return runCatching {
        val offsetId = Instant.now().atZone(ZoneId.of(id)).offset.id
        if (offsetId == "Z") "UTC" else "UTC$offsetId"
    }.getOrNull()
}

private fun localhostWarningText(serverBaseUrl: String, isEnglish: Boolean): String? {
    val trimmed = serverBaseUrl.trim()
    if (trimmed.isBlank()) return null
    val candidate = if (trimmed.contains("://")) trimmed else "http://$trimmed"
    val host = runCatching { java.net.URI(candidate).host }
        .getOrNull()
        ?.trim('[', ']')
        ?.lowercase()
        ?: return null
    val isLoopback = host == "localhost" || host == "127.0.0.1" || host == "::1"
    if (!isLoopback) return null
    return if (isEnglish) {
        "127.0.0.1 points to this phone or emulator. To use a backend on your computer, enter that computer's LAN IP or domain."
    } else {
        "127.0.0.1 指这台手机或模拟器本身。要连接电脑上的后端，请填写那台电脑的局域网 IP 或域名。"
    }
}

private fun parseBackupImportUndoItems(gson: Gson, raw: String?): List<BackupImportUndoItem> {
    if (raw.isNullOrBlank()) return emptyList()
    val parsed = runCatching {
        gson.fromJson(raw, Array<BackupImportUndoItem>::class.java)?.toList().orEmpty()
    }.getOrDefault(emptyList())
    return parsed
        .map { item ->
            BackupImportUndoItem(
                localId = item.localId.trim(),
                importedUpdatedAt = item.importedUpdatedAt.trim(),
            )
        }
        .filter { item -> item.localId.isNotBlank() && item.importedUpdatedAt.isNotBlank() }
        .distinctBy { item -> item.localId }
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

private fun widgetStyleLabel(style: String, isEnglish: Boolean): String {
    return when (style) {
        WidgetConstants.STYLE_TRANSPARENT -> if (isEnglish) "Transparent, white text" else "透明白字"
        else -> if (isEnglish) "Clear, dark text" else "清晰黑字"
    }
}
