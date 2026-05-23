package com.taskbridge.app.sync

import android.content.Context
import android.provider.Settings
import java.util.UUID

class DeviceIdProvider(
    private val context: Context,
) {
    fun getDeviceId(): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        )
        return androidId?.takeIf { it.isNotBlank() } ?: fallbackDeviceId()
    }

    private fun fallbackDeviceId(): String {
        val preferences = context.applicationContext.getSharedPreferences("taskbridge_device", Context.MODE_PRIVATE)
        val existing = preferences.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing

        val generated = UUID.randomUUID().toString()
        preferences.edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
    }
}
