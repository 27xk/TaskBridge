package com.taskbridge.app.data.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.net.URI
import java.time.ZoneId

private val Context.syncPreferences by preferencesDataStore(name = "taskbridge_sync")
private val Context.legacyTokenPreferences by preferencesDataStore(name = "taskbridge_tokens")

class TokenDataStore(context: Context) {
    private val appContext = context.applicationContext
    private val securePreferences = createSecurePreferences(appContext)
    private val accessTokenState = MutableStateFlow(securePreferences.getString(ACCESS_TOKEN, null))
    private val refreshTokenState = MutableStateFlow(securePreferences.getString(REFRESH_TOKEN, null))

    val accessToken: Flow<String?> = accessTokenState
    val refreshToken: Flow<String?> = refreshTokenState
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

    val lastSyncTime: Flow<String?> = appContext.syncPreferences.data.map { preferences ->
        preferences[LAST_SYNC_TIME]
    }

    val language: Flow<String> = appContext.syncPreferences.data.map { preferences ->
        preferences[LANGUAGE] ?: DEFAULT_LANGUAGE
    }

    val widgetOpacityPercent: Flow<Int> = appContext.syncPreferences.data.map { preferences ->
        preferences[WIDGET_OPACITY_PERCENT] ?: DEFAULT_WIDGET_OPACITY_PERCENT
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
        val userId = preferences[CURRENT_USER_ID]
        val userTimeZone = userId?.let { preferences[userDisplayTimeZoneKey(it)] }
        normalizeTimeZone(userTimeZone ?: preferences[DISPLAY_TIME_ZONE] ?: DEFAULT_DISPLAY_TIME_ZONE)
    }

    val lastBackupImportUndoItems: Flow<String?> = appContext.syncPreferences.data.map { preferences ->
        preferences[LAST_BACKUP_IMPORT_UNDO_ITEMS]
    }

    suspend fun hasAccessToken(): Boolean {
        return accessToken.first().isNullOrBlank().not()
    }

    suspend fun saveTokens(accessToken: String, refreshToken: String, userId: Int? = null) {
        withContext(Dispatchers.IO) {
            securePreferences.edit()
                .putString(ACCESS_TOKEN, accessToken)
                .putString(REFRESH_TOKEN, refreshToken)
                .apply()
        }
        userId?.let { id ->
            appContext.syncPreferences.edit { preferences ->
                preferences[CURRENT_USER_ID] = id.toString()
            }
        }
        accessTokenState.value = accessToken
        refreshTokenState.value = refreshToken
        clearLegacyTokenPreferences()
    }

    suspend fun saveLastSyncTime(serverTime: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[LAST_SYNC_TIME] = serverTime
        }
    }

    suspend fun saveLanguage(language: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[LANGUAGE] = if (language == ENGLISH) ENGLISH else DEFAULT_LANGUAGE
        }
    }

    suspend fun saveNetworkEndpoints(apiBaseUrl: String, webSocketUrl: String) {
        appContext.syncPreferences.edit { preferences ->
            preferences[API_BASE_URL] = validateApiBaseUrl(apiBaseUrl)
            preferences[WEB_SOCKET_URL] = validateWebSocketUrl(webSocketUrl)
            preferences[SERVER_BASE_URL] = inferServerBaseUrlFromApi(validateApiBaseUrl(apiBaseUrl))
        }
    }

    suspend fun saveLastBackupImportUndoItems(raw: String) {
        appContext.syncPreferences.edit { preferences ->
            val value = raw.trim()
            if (value.isBlank() || value == "[]") {
                preferences.remove(LAST_BACKUP_IMPORT_UNDO_ITEMS)
            } else {
                preferences[LAST_BACKUP_IMPORT_UNDO_ITEMS] = value
            }
        }
    }

    suspend fun clearLastBackupImportUndoItems() {
        appContext.syncPreferences.edit { preferences ->
            preferences.remove(LAST_BACKUP_IMPORT_UNDO_ITEMS)
        }
    }

    suspend fun saveServerBaseUrl(serverBaseUrl: String) {
        val endpoints = deriveNetworkEndpoints(serverBaseUrl)
        appContext.syncPreferences.edit { preferences ->
            preferences[SERVER_BASE_URL] = endpoints.serverBaseUrl
            preferences[API_BASE_URL] = endpoints.apiBaseUrl
            preferences[WEB_SOCKET_URL] = endpoints.webSocketUrl
        }
    }

    suspend fun saveWidgetOpacityPercent(opacityPercent: Int) {
        appContext.syncPreferences.edit { preferences ->
            preferences[WIDGET_OPACITY_PERCENT] = opacityPercent.coerceIn(0, 100)
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
        val userId = appContext.syncPreferences.data.first()[CURRENT_USER_ID]
        val normalized = normalizeTimeZone(timeZoneId)
        appContext.syncPreferences.edit { preferences ->
            if (userId.isNullOrBlank()) {
                preferences[DISPLAY_TIME_ZONE] = normalized
            } else {
                preferences[userDisplayTimeZoneKey(userId)] = normalized
            }
        }
    }

    suspend fun clear() {
        withContext(Dispatchers.IO) {
            securePreferences.edit()
                .remove(ACCESS_TOKEN)
                .remove(REFRESH_TOKEN)
                .apply()
        }
        accessTokenState.value = null
        refreshTokenState.value = null
        appContext.syncPreferences.edit { preferences ->
            preferences.remove(LAST_SYNC_TIME)
            preferences.remove(CURRENT_USER_ID)
        }
        clearLegacyTokenPreferences()
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

private fun normalizeTimeZone(timeZoneId: String): String {
    return runCatching { ZoneId.of(timeZoneId.trim()).id }
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
