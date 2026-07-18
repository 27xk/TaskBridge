package com.taskbridge.app.data.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.taskbridge.app.BuildConfig
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.net.URI
import java.time.ZoneId

private val Context.syncPreferences by preferencesDataStore(name = "taskbridge_sync")
private val Context.legacyTokenPreferences by preferencesDataStore(name = "taskbridge_tokens")

data class RequestAuthContext(
    val workspace: WorkspaceIdentity?,
    val apiBaseUrl: String,
    val accessToken: String?,
)

class TokenDataStore(context: Context) {
    private val appContext = context.applicationContext
    private val securePreferences = createSecurePreferences(appContext)
    private val tokenRevision = MutableStateFlow(0L)

    val currentUserId: Flow<String?> = appContext.syncPreferences.data.map { preferences ->
        preferences[CURRENT_USER_ID]
    }

    val serverBaseUrl: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        normalizeStoredServerBaseUrl(preferences[SERVER_BASE_URL] ?: inferServerBaseUrlFromApi(preferences[API_BASE_URL]))
    }

    val apiBaseUrl: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        normalizeApiBaseUrl(preferences[API_BASE_URL])
    }

    val webSocketUrl: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        normalizeWebSocketUrl(preferences[WEB_SOCKET_URL])
    }

    val currentWorkspace: Flow<WorkspaceIdentity?> = appContext.syncPreferences.data.map { preferences ->
        workspaceFromPreferences(preferences)
    }

    val accessToken: Flow<String?> = combine(currentWorkspace, tokenRevision) { workspace, _ ->
        workspace?.let { scopedToken(ACCESS_TOKEN, it) }
    }

    val refreshToken: Flow<String?> = combine(currentWorkspace, tokenRevision) { workspace, _ ->
        workspace?.let { scopedToken(REFRESH_TOKEN, it) }
    }

    val lastSyncTime: Flow<String?> = appContext.syncPreferences.data.map { preferences ->
        val workspace = workspaceFromPreferences(preferences)
        workspace?.let { preferences[lastSyncTimeKey(it)] }
    }

    val language: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        preferences[LANGUAGE] ?: DEFAULT_LANGUAGE
    }

    val widgetOpacityPercent: Flow<Int> = appContext.syncPreferences.data.map { preferences ->
        (preferences[WIDGET_OPACITY_PERCENT] ?: DEFAULT_WIDGET_OPACITY_PERCENT).coerceIn(60, 100)
    }

    val widgetTaskScope: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        normalizeWidgetTaskScope(preferences[WIDGET_TASK_SCOPE])
    }

    val widgetCompletionScope: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        normalizeWidgetCompletionScope(preferences[WIDGET_COMPLETION_SCOPE])
    }

    val widgetStyle: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        normalizeWidgetStyle(preferences[WIDGET_STYLE])
    }

    val displayTimeZone: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        val workspace = workspaceFromPreferences(preferences)
        val workspaceTimeZone = workspace?.let { preferences[workspaceDisplayTimeZoneKey(it)] }
        val legacyUserTimeZone = workspace?.userId?.let { preferences[userDisplayTimeZoneKey(it)] }
        effectiveDisplayTimeZone(
            workspaceTimeZone ?: legacyUserTimeZone ?: preferences[DISPLAY_TIME_ZONE] ?: DEFAULT_DISPLAY_TIME_ZONE,
        )
    }

    val lastBackupImportUndoItems: Flow<String?> = appContext.syncPreferences.data.map { preferences ->
        val workspace = workspaceFromPreferences(preferences)
        workspace?.let {
            preferences[lastBackupImportUndoItemsKey(it)] ?: preferences[LAST_BACKUP_IMPORT_UNDO_ITEMS]
        }
    }

    suspend fun hasAccessToken(): Boolean {
        return accessToken.first().isNullOrBlank().not()
    }

    suspend fun requestAuthContext(): RequestAuthContext {
        val preferences = appContext.syncPreferences.data.first()
        val workspace = workspaceFromPreferences(preferences)
        return RequestAuthContext(
            workspace = workspace,
            apiBaseUrl = normalizeApiBaseUrl(preferences[API_BASE_URL]),
            accessToken = workspace?.let { scopedToken(ACCESS_TOKEN, it) },
        )
    }

    suspend fun initializeLegacyWorkspaceOwnership() {
        appContext.syncPreferences.edit { preferences ->
            if (preferences[LEGACY_WORKSPACE_OWNERSHIP_INITIALIZED] == true) return@edit
            workspaceFromPreferences(preferences)?.let { workspace ->
                val userOwnerKey = legacyWorkspaceOwnerKey(workspace.userId)
                if (preferences[userOwnerKey].isNullOrBlank()) {
                    preferences[userOwnerKey] = workspace.id
                }
                val globalOwnerKey = legacyWorkspaceOwnerKey("legacy")
                if (preferences[globalOwnerKey].isNullOrBlank()) {
                    preferences[globalOwnerKey] = workspace.id
                }
                if (
                    preferences[LAST_SYNC_TIME] != null &&
                    preferences[LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE].isNullOrBlank()
                ) {
                    preferences[LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE] = workspace.id
                }
            }
            preferences[LEGACY_WORKSPACE_OWNERSHIP_INITIALIZED] = true
        }
    }

    suspend fun canClaimLegacyWorkspace(
        ownerUserId: String,
        workspace: WorkspaceIdentity,
    ): Boolean {
        val claimedWorkspaceId = appContext.syncPreferences.data.first()[
            legacyWorkspaceOwnerKey(ownerUserId)
        ]
        return com.taskbridge.app.data.datastore.canClaimLegacyWorkspace(
            claimedWorkspaceId,
            workspace,
        )
    }

    suspend fun saveTokens(accessToken: String, refreshToken: String, userId: Int? = null) {
        currentWorkspace.first()?.let { claimLegacySyncCursor(it) }
        val resolvedUserId = userId?.toString()
            ?: currentUserId.first()?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("active user required")
        val workspace = WorkspaceIdentity.create(serverBaseUrl.first(), resolvedUserId)
        withContext(Dispatchers.IO) {
            securePreferences.edit()
                .putString(scopedSecureKey(ACCESS_TOKEN, workspace), accessToken)
                .putString(scopedSecureKey(REFRESH_TOKEN, workspace), refreshToken)
                .remove(ACCESS_TOKEN)
                .remove(REFRESH_TOKEN)
                .apply()
        }
        appContext.syncPreferences.edit { preferences ->
            preferences[CURRENT_USER_ID] = resolvedUserId
        }
        tokenRevision.value += 1
        clearLegacyTokenPreferences()
    }

    suspend fun saveLastSyncTime(serverTime: String) {
        val workspace = currentWorkspace.first() ?: return
        saveLastSyncTime(workspace, serverTime)
    }

    suspend fun saveLastSyncTime(workspace: WorkspaceIdentity, serverTime: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[lastSyncTimeKey(workspace)] = serverTime
            val legacyClaim = preferences[LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE]
            if (legacyClaim == null || legacyClaim == workspace.id) {
                preferences[LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE] = workspace.id
                preferences.remove(LAST_SYNC_TIME)
            }
        }
    }

    suspend fun lastSyncTimeFor(workspace: WorkspaceIdentity): String? {
        var resolvedCursor: String? = null
        appContext.syncPreferences.edit { preferences ->
            val resolution = resolveWorkspaceSyncCursor(
                scopedCursor = preferences[lastSyncTimeKey(workspace)],
                legacyCursor = preferences[LAST_SYNC_TIME],
                legacyClaimedWorkspaceId = preferences[LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE],
                activeWorkspaceId = workspace.id,
            )
            resolvedCursor = resolution.cursor
            if (resolution.shouldClaimLegacyCursor) {
                resolution.cursor?.let { cursor ->
                    if (preferences[lastSyncTimeKey(workspace)] == null) {
                        preferences[lastSyncTimeKey(workspace)] = cursor
                    }
                }
                preferences[LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE] = workspace.id
                preferences.remove(LAST_SYNC_TIME)
            }
        }
        return resolvedCursor
    }

    suspend fun saveLanguage(language: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[LANGUAGE] = if (language == ENGLISH) ENGLISH else DEFAULT_LANGUAGE
        }
    }

    suspend fun saveNetworkEndpoints(apiBaseUrl: String, webSocketUrl: String) {
        val normalizedApiBaseUrl = validateApiBaseUrl(apiBaseUrl)
        saveNetworkEndpoints(
            NetworkEndpoints(
                serverBaseUrl = inferServerBaseUrlFromApi(normalizedApiBaseUrl),
                apiBaseUrl = normalizedApiBaseUrl,
                webSocketUrl = validateWebSocketUrl(webSocketUrl),
            ),
        )
    }

    suspend fun saveLastBackupImportUndoItems(raw: String) {
        val workspace = currentWorkspace.first() ?: return
        appContext.syncPreferences.edit { preferences ->
            val value = raw.trim()
            if (value.isBlank() || value == "[]") {
                preferences.remove(lastBackupImportUndoItemsKey(workspace))
            } else {
                preferences[lastBackupImportUndoItemsKey(workspace)] = value
            }
            preferences.remove(LAST_BACKUP_IMPORT_UNDO_ITEMS)
        }
    }

    suspend fun clearLastBackupImportUndoItems() {
        val workspace = currentWorkspace.first()
        appContext.syncPreferences.edit { preferences ->
            workspace?.let { preferences.remove(lastBackupImportUndoItemsKey(it)) }
            preferences.remove(LAST_BACKUP_IMPORT_UNDO_ITEMS)
        }
    }

    suspend fun saveServerBaseUrl(serverBaseUrl: String) {
        saveNetworkEndpoints(deriveNetworkEndpoints(serverBaseUrl))
    }

    suspend fun saveWidgetOpacityPercent(opacityPercent: Int) {
        appContext.syncPreferences.edit { preferences ->
            preferences[WIDGET_OPACITY_PERCENT] = opacityPercent.coerceIn(60, 100)
        }
    }

    suspend fun saveWidgetTaskScope(scope: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[WIDGET_TASK_SCOPE] = normalizeWidgetTaskScope(scope)
        }
    }

    suspend fun saveWidgetCompletionScope(scope: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[WIDGET_COMPLETION_SCOPE] = normalizeWidgetCompletionScope(scope)
        }
    }

    suspend fun saveWidgetStyle(style: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[WIDGET_STYLE] = normalizeWidgetStyle(style)
        }
    }

    suspend fun saveDisplayTimeZone(timeZoneId: String) {
        val workspace = currentWorkspace.first()
        val normalized = effectiveDisplayTimeZone(timeZoneId)
        appContext.syncPreferences.edit { preferences ->
            if (workspace == null) {
                preferences[DISPLAY_TIME_ZONE] = normalized
            } else {
                preferences[workspaceDisplayTimeZoneKey(workspace)] = normalized
            }
        }
    }

    suspend fun expireSession() {
        val workspace = currentWorkspace.first()
        withContext(Dispatchers.IO) {
            securePreferences.edit().apply {
                workspace?.let {
                    remove(scopedSecureKey(ACCESS_TOKEN, it))
                    remove(scopedSecureKey(REFRESH_TOKEN, it))
                }
                remove(ACCESS_TOKEN)
                remove(REFRESH_TOKEN)
            }.apply()
        }
        tokenRevision.value += 1
        clearLegacyTokenPreferences()
    }

    suspend fun clear() {
        val workspace = currentWorkspace.first()
        workspace?.let { claimLegacySyncCursor(it) }
        withContext(Dispatchers.IO) {
            securePreferences.edit().apply {
                workspace?.let {
                    remove(scopedSecureKey(ACCESS_TOKEN, it))
                    remove(scopedSecureKey(REFRESH_TOKEN, it))
                }
                remove(ACCESS_TOKEN)
                remove(REFRESH_TOKEN)
            }.apply()
        }
        appContext.syncPreferences.edit { preferences ->
            preferences.remove(LAST_SYNC_TIME)
            preferences.remove(CURRENT_USER_ID)
        }
        tokenRevision.value += 1
        clearLegacyTokenPreferences()
    }

    private suspend fun saveNetworkEndpoints(endpoints: NetworkEndpoints) {
        val currentServerUrl = serverBaseUrl.first()
        val resetSession = shouldResetSessionForServerChange(currentServerUrl, endpoints.serverBaseUrl)
        if (resetSession) currentWorkspace.first()?.let { claimLegacySyncCursor(it) }
        appContext.syncPreferences.edit { preferences ->
            preferences[SERVER_BASE_URL] = endpoints.serverBaseUrl
            preferences[API_BASE_URL] = endpoints.apiBaseUrl
            preferences[WEB_SOCKET_URL] = endpoints.webSocketUrl
            if (resetSession) {
                preferences.remove(CURRENT_USER_ID)
                preferences.remove(LAST_SYNC_TIME)
                preferences.remove(LAST_BACKUP_IMPORT_UNDO_ITEMS)
            }
        }
        if (resetSession) tokenRevision.value += 1
    }

    private fun scopedToken(baseKey: String, workspace: WorkspaceIdentity): String? {
        return securePreferences.getString(scopedSecureKey(baseKey, workspace), null)
            ?: securePreferences.getString(baseKey, null)
    }

    private suspend fun claimLegacySyncCursor(workspace: WorkspaceIdentity) {
        lastSyncTimeFor(workspace)
    }

    private suspend fun clearLegacyTokenPreferences() {
        appContext.legacyTokenPreferences.edit { preferences ->
            preferences.remove(LEGACY_ACCESS_TOKEN)
            preferences.remove(LEGACY_REFRESH_TOKEN)
            preferences.remove(LEGACY_LAST_SYNC_TIME)
        }
    }

    private companion object {
        const val ACCESS_TOKEN = "access_token"
        const val REFRESH_TOKEN = "refresh_token"
        val LAST_SYNC_TIME = stringPreferencesKey("last_sync_time")
        val LANGUAGE = stringPreferencesKey("language")
        val SERVER_BASE_URL = stringPreferencesKey("server_base_url")
        val API_BASE_URL = stringPreferencesKey("api_base_url")
        val WEB_SOCKET_URL = stringPreferencesKey("web_socket_url")
        val WIDGET_OPACITY_PERCENT = intPreferencesKey("widget_opacity_percent")
        val WIDGET_TASK_SCOPE = stringPreferencesKey("widget_task_scope")
        val WIDGET_COMPLETION_SCOPE = stringPreferencesKey("widget_completion_scope")
        val WIDGET_STYLE = stringPreferencesKey("widget_style")
        val DISPLAY_TIME_ZONE = stringPreferencesKey("display_time_zone")
        val CURRENT_USER_ID = stringPreferencesKey("current_user_id")
        val LEGACY_SYNC_CURSOR_CLAIMED_WORKSPACE = stringPreferencesKey("legacy_sync_cursor_claimed_workspace")
        val LEGACY_WORKSPACE_OWNERSHIP_INITIALIZED = booleanPreferencesKey("legacy_workspace_ownership_initialized")
        val LAST_BACKUP_IMPORT_UNDO_ITEMS = stringPreferencesKey("last_backup_import_undo_items")
        const val DEFAULT_LANGUAGE = "zh-CN"
        const val DEFAULT_WIDGET_OPACITY_PERCENT = 78
        val DEFAULT_DISPLAY_TIME_ZONE: String = ShanghaiTime.DEFAULT_ZONE_ID
        const val ENGLISH = "en-US"
        val LEGACY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        val LEGACY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val LEGACY_LAST_SYNC_TIME = stringPreferencesKey("last_sync_time")
    }
}

data class NetworkEndpoints(
    val serverBaseUrl: String,
    val apiBaseUrl: String,
    val webSocketUrl: String,
)

fun deriveNetworkEndpoints(serverBaseUrl: String): NetworkEndpoints {
    val normalizedServerUrl = requireServerBaseUrlForUserInput(serverBaseUrl)
    val uri = URI(normalizedServerUrl)
    val wsScheme = if (uri.scheme == "https") "wss" else "ws"
    val path = uri.path.orEmpty().trimEnd('/')
    val wsPath = if (path.isBlank()) "/ws/sync" else "$path/ws/sync"
    return NetworkEndpoints(
        serverBaseUrl = normalizedServerUrl,
        apiBaseUrl = "$normalizedServerUrl/api/v1/",
        webSocketUrl = URI(wsScheme, null, uri.host, uri.port, wsPath, null, null).toString(),
    )
}

fun requireServerBaseUrlForUserInput(serverBaseUrl: String): String {
    val raw = serverBaseUrl.trim()
    if (raw.isBlank()) throw IllegalArgumentException("server url required")
    return normalizeServerBaseUrl(raw)
}

fun inferServerBaseUrlFromApi(apiBaseUrl: String?): String {
    val candidate = apiBaseUrl?.trim().orEmpty().ifBlank { BuildConfig.TASKBRIDGE_BASE_URL }
    return runCatching { normalizeServerBaseUrl(candidate) }
        .getOrDefault(defaultServerBaseUrl())
}

private fun normalizeApiBaseUrl(value: String?): String {
    val candidate = value?.trim().orEmpty().ifBlank { BuildConfig.TASKBRIDGE_BASE_URL }
    return runCatching { validateApiBaseUrl(candidate) }
        .getOrDefault(deriveNetworkEndpoints(BuildConfig.TASKBRIDGE_BASE_URL).apiBaseUrl)
}

private fun normalizeWebSocketUrl(value: String?): String {
    val candidate = value?.trim().orEmpty().ifBlank { BuildConfig.TASKBRIDGE_WS_URL }
    return runCatching { validateWebSocketUrl(candidate) }
        .getOrDefault(BuildConfig.TASKBRIDGE_WS_URL)
}

fun validateApiBaseUrl(value: String): String {
    val candidate = value.trim().trimEnd('/') + "/"
    val uri = runCatching { URI(candidate) }.getOrElse {
        throw IllegalArgumentException("invalid api url")
    }
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") {
        throw IllegalArgumentException("invalid api url")
    }
    val host = uri.host ?: throw IllegalArgumentException("invalid api url")
    if (uri.query != null || uri.fragment != null) {
        throw IllegalArgumentException("invalid api url")
    }
    val path = uri.path.orEmpty().ifBlank { "/" }
    return URI(scheme, null, host, uri.port, path, null, null).toString().trimEnd('/') + "/"
}

fun validateWebSocketUrl(value: String): String {
    val candidate = value.trim()
    val uri = runCatching { URI(candidate) }.getOrElse {
        throw IllegalArgumentException("invalid websocket url")
    }
    val scheme = uri.scheme?.lowercase()
    if (scheme != "ws" && scheme != "wss") {
        throw IllegalArgumentException("invalid websocket url")
    }
    val host = uri.host ?: throw IllegalArgumentException("invalid websocket url")
    if (uri.query != null || uri.fragment != null) {
        throw IllegalArgumentException("invalid websocket url")
    }
    val path = uri.path.orEmpty().ifBlank { "/" }
    return URI(scheme, null, host, uri.port, path, null, null).toString()
}

private fun normalizeServerBaseUrl(value: String?): String {
    val raw = value?.trim().orEmpty()
    val candidate = raw.ifBlank { BuildConfig.TASKBRIDGE_BASE_URL }
        .let { if (it.contains("://")) it else "http://$it" }
        .trimEnd('/')
    val uri = runCatching { URI(candidate) }.getOrElse {
        throw IllegalArgumentException("invalid server url")
    }
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") {
        throw IllegalArgumentException("invalid server url")
    }
    val host = uri.host ?: throw IllegalArgumentException("invalid server url")
    val path = uri.path.orEmpty()
        .replace(Regex("/api/v1/?$"), "")
        .ifBlank { "/" }
    return URI(scheme, null, host, uri.port, path, null, null).toString().trimEnd('/')
}

private fun normalizeStoredServerBaseUrl(value: String?): String {
    return runCatching { normalizeServerBaseUrl(value) }
        .getOrDefault(defaultServerBaseUrl())
}

private fun defaultServerBaseUrl(): String {
    return normalizeServerBaseUrl(BuildConfig.TASKBRIDGE_BASE_URL)
}

private fun userDisplayTimeZoneKey(userId: String) = stringPreferencesKey("display_time_zone_user_$userId")

private fun workspaceDisplayTimeZoneKey(workspace: WorkspaceIdentity) =
    stringPreferencesKey("display_time_zone_workspace_${workspace.preferenceSuffix}")

private fun lastSyncTimeKey(workspace: WorkspaceIdentity) =
    stringPreferencesKey("last_sync_time_workspace_${workspace.preferenceSuffix}")

private fun lastBackupImportUndoItemsKey(workspace: WorkspaceIdentity) =
    stringPreferencesKey("last_backup_import_undo_items_workspace_${workspace.preferenceSuffix}")

private fun scopedSecureKey(baseKey: String, workspace: WorkspaceIdentity): String =
    "${baseKey}_workspace_${workspace.preferenceSuffix}"

private fun legacyWorkspaceOwnerKey(ownerUserId: String) = stringPreferencesKey(
    "legacy_workspace_owner_${ownerUserId.trim().ifBlank { "legacy" }}",
)

private fun workspaceFromPreferences(
    preferences: androidx.datastore.preferences.core.Preferences,
): WorkspaceIdentity? {
    val userId = preferences[stringPreferencesKey("current_user_id")]?.takeIf { it.isNotBlank() } ?: return null
    val serverBaseUrl = normalizeStoredServerBaseUrl(
        preferences[stringPreferencesKey("server_base_url")]
            ?: inferServerBaseUrlFromApi(preferences[stringPreferencesKey("api_base_url")]),
    )
    return runCatching { WorkspaceIdentity.create(serverBaseUrl, userId) }.getOrNull()
}

fun effectiveDisplayTimeZone(timeZoneId: String?): String {
    return runCatching { ZoneId.of(timeZoneId.orEmpty().trim()).id }
        .getOrDefault(ShanghaiTime.DEFAULT_ZONE_ID)
}

private fun normalizeWidgetTaskScope(scope: String?): String {
    return if (scope == "all") "all" else "today"
}

private fun normalizeWidgetCompletionScope(scope: String?): String {
    return if (scope == "all") "all" else "open"
}

private fun normalizeWidgetStyle(style: String?): String {
    return if (style == "transparent") "transparent" else "clear"
}

private fun createSecurePreferences(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    return EncryptedSharedPreferences.create(
        context,
        "taskbridge_secure_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
}
