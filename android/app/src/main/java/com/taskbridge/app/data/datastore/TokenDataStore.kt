package com.taskbridge.app.data.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

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

    suspend fun hasAccessToken(): Boolean {
        return accessToken.first().isNullOrBlank().not()
    }

    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        withContext(Dispatchers.IO) {
            securePreferences.edit()
                .putString(ACCESS_TOKEN, accessToken)
                .putString(REFRESH_TOKEN, refreshToken)
                .apply()
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
        val LEGACY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        val LEGACY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val LEGACY_LAST_SYNC_TIME = stringPreferencesKey("last_sync_time")
    }
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
