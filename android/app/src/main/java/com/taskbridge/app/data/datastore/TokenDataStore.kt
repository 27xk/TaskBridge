package com.taskbridge.app.data.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.taskbridge.app.utils.ShanghaiTime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
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
        val WIDGET_OPACITY_PERCENT = intPreferencesKey("widget_opacity_percent")
        val WIDGET_TASK_SCOPE = stringPreferencesKey("widget_task_scope")
        val WIDGET_COMPLETION_SCOPE = stringPreferencesKey("widget_completion_scope")
        val WIDGET_STYLE = stringPreferencesKey("widget_style")
        val DISPLAY_TIME_ZONE = stringPreferencesKey("display_time_zone")
        val CURRENT_USER_ID = stringPreferencesKey("current_user_id")
        const val DEFAULT_LANGUAGE = "zh-CN"
        const val DEFAULT_WIDGET_OPACITY_PERCENT = 78
        val DEFAULT_DISPLAY_TIME_ZONE: String = ShanghaiTime.DEFAULT_ZONE_ID
        const val ENGLISH = "en-US"
        val LEGACY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        val LEGACY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val LEGACY_LAST_SYNC_TIME = stringPreferencesKey("last_sync_time")
    }
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
