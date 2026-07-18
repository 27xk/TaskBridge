package com.taskbridge.app.data.repository

import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.remote.ApiService
import com.taskbridge.app.data.remote.dto.LoginRequestDto
import com.taskbridge.app.data.remote.dto.PasswordChangeRequestDto
import com.taskbridge.app.data.remote.dto.RegisterRequestDto
import com.taskbridge.app.data.remote.dto.AuthSessionDto
import com.taskbridge.app.data.remote.dto.RevokeOtherSessionsRequestDto
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

    suspend fun registrationEnabled(): Result<Boolean> {
        return runCatching {
            apiService.registrationStatus().data?.registrationEnabled ?: true
        }
    }

    suspend fun currentUser(): Result<UserDto> {
        return runCatching {
            apiService.me().data ?: error("Not authenticated")
        }
    }

    suspend fun changePassword(currentPassword: String, newPassword: String): Result<Int> {
        return runCatching {
            apiService.changePassword(PasswordChangeRequestDto(currentPassword, newPassword))
                .data
                ?.revoked
                ?: error("Password change failed")
        }
    }

    suspend fun sessions(): Result<List<AuthSessionDto>> {
        return runCatching {
            apiService.getSessions().data ?: error("Session list unavailable")
        }
    }

    suspend fun revokeOtherSessions(): Result<Int> {
        return runCatching {
            apiService.revokeOtherSessions(
                RevokeOtherSessionsRequestDto(deviceIdProvider.getDeviceId()),
            ).data?.revoked ?: error("Session revocation failed")
        }
    }

    suspend fun testConnection(): Result<Unit> {
        return runCatching {
            apiService.syncStatus()
            Unit
        }
    }

    suspend fun logout() {
        tokenDataStore.clear()
    }
}
