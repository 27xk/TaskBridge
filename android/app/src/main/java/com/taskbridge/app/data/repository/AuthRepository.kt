package com.taskbridge.app.data.repository

import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.remote.ApiService
import com.taskbridge.app.data.remote.dto.LoginRequestDto
import com.taskbridge.app.data.remote.dto.RegisterRequestDto
import com.taskbridge.app.data.remote.dto.UserDto
import com.taskbridge.app.sync.DeviceIdProvider

class AuthRepository(
    private val apiService: ApiService,
    private val tokenDataStore: TokenDataStore,
    private val deviceIdProvider: DeviceIdProvider,
) {
    suspend fun login(usernameOrEmail: String, password: String): Result<UserDto> {
        return runCatching {
            val envelope = apiService.login(
                LoginRequestDto(usernameOrEmail, password, deviceIdProvider.getDeviceId()),
            )
            val tokenPair = envelope.data ?: error(envelope.message)
            tokenDataStore.saveTokens(tokenPair.accessToken, tokenPair.refreshToken, tokenPair.user.id)
            tokenPair.user
        }
    }

    suspend fun register(username: String, email: String, password: String): Result<UserDto> {
        return runCatching {
            val envelope = apiService.register(
                RegisterRequestDto(username, email, password, deviceIdProvider.getDeviceId()),
            )
            val tokenPair = envelope.data ?: error(envelope.message)
            tokenDataStore.saveTokens(tokenPair.accessToken, tokenPair.refreshToken, tokenPair.user.id)
            tokenPair.user
        }
    }

    suspend fun currentUser(): Result<UserDto> {
        return runCatching {
            apiService.me().data ?: error("Not authenticated")
        }
    }

    suspend fun logout() {
        tokenDataStore.clear()
    }
}
