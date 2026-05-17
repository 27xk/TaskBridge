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
        return androidId?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
    }
}

