package com.taskbridge.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.datastore.deriveNetworkEndpoints
import com.taskbridge.app.data.datastore.inferServerBaseUrlFromApi
import com.taskbridge.app.data.datastore.validateApiBaseUrl
import com.taskbridge.app.data.datastore.validateWebSocketUrl
import com.taskbridge.app.data.repository.AuthRepository
import com.taskbridge.app.sync.SyncManager
import com.taskbridge.app.ui.components.connectionFailureMessage
import com.taskbridge.app.ui.components.connectionReadyMessageKey
import com.taskbridge.app.ui.components.loginFailureMessageKey
import com.taskbridge.app.ui.components.userFacingAuthErrorKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val usernameOrEmail: String = "",
    val password: String = "",
    val serverBaseUrl: String = "",
    val apiBaseUrl: String = "",
    val webSocketUrl: String = "",
    val advancedEndpointsEdited: Boolean = false,
    val registrationEnabled: Boolean = false,
    val registrationStatusKnown: Boolean = false,
    val isLoading: Boolean = false,
    val isTestingConnection: Boolean = false,
    val connectionMessage: String? = null,
    val connectionMessageIsError: Boolean = false,
    val error: String? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    init {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    serverBaseUrl = tokenDataStore.serverBaseUrl.first(),
                    apiBaseUrl = tokenDataStore.apiBaseUrl.first(),
                    webSocketUrl = tokenDataStore.webSocketUrl.first(),
                )
            }
            authRepository.registrationEnabled()
                .onSuccess { enabled ->
                    _uiState.update { it.copy(registrationEnabled = enabled, registrationStatusKnown = true) }
                }
                .onFailure {
                    _uiState.update { it.copy(registrationEnabled = false, registrationStatusKnown = false) }
                }
        }
    }

    fun updateUsernameOrEmail(value: String) {
        _uiState.update { it.copy(usernameOrEmail = value, error = null) }
    }

    fun updatePassword(value: String) {
        _uiState.update { it.copy(password = value, error = null) }
    }

    fun updateServerBaseUrl(value: String) {
        _uiState.update {
            it.copy(
                serverBaseUrl = value,
                advancedEndpointsEdited = false,
                registrationEnabled = false,
                registrationStatusKnown = false,
                error = null,
                connectionMessage = null,
                connectionMessageIsError = false,
            )
        }
    }

    fun updateApiBaseUrl(value: String) {
        _uiState.update {
            val serverBaseUrl = runCatching { inferServerBaseUrlFromApi(validateApiBaseUrl(value)) }
                .getOrDefault(it.serverBaseUrl)
            it.copy(
                serverBaseUrl = serverBaseUrl,
                apiBaseUrl = value,
                advancedEndpointsEdited = true,
                registrationEnabled = false,
                registrationStatusKnown = false,
                error = null,
            )
        }
    }

    fun updateWebSocketUrl(value: String) {
        _uiState.update { it.copy(webSocketUrl = value, advancedEndpointsEdited = true, error = null) }
    }

    fun saveConnectionSettings() {
        viewModelScope.launch {
            val state = resolveConnectionStateOrReport(resetRegistrationStatus = false) ?: return@launch
            saveConnectionStateOrReport(state)
        }
    }

    fun resetGeneratedEndpoints() {
        applyServerBaseUrlOrReport()
    }

    fun applyServerBaseUrl(resetRegistrationStatus: Boolean = true): LoginUiState {
        val endpoints = deriveNetworkEndpoints(_uiState.value.serverBaseUrl)
        val current = _uiState.value
        val next = current.copy(
            serverBaseUrl = endpoints.serverBaseUrl,
            apiBaseUrl = endpoints.apiBaseUrl,
            webSocketUrl = endpoints.webSocketUrl,
            advancedEndpointsEdited = false,
            registrationEnabled = if (resetRegistrationStatus) false else current.registrationEnabled,
            registrationStatusKnown = if (resetRegistrationStatus) false else current.registrationStatusKnown,
            error = null,
            connectionMessage = null,
            connectionMessageIsError = false,
        )
        _uiState.value = next
        return next
    }

    fun testConnection() {
        viewModelScope.launch {
            val state = resolveConnectionStateOrReport() ?: return@launch
            _uiState.update { it.copy(isTestingConnection = true, error = null, connectionMessage = null, connectionMessageIsError = false) }
            if (!saveConnectionStateOrReport(state)) {
                _uiState.update { it.copy(isTestingConnection = false) }
                return@launch
            }
            ensureConnectionReadyForAuth()
            _uiState.update { it.copy(isTestingConnection = false) }
        }
    }

    private suspend fun refreshRegistrationStatus() {
        authRepository.registrationEnabled()
            .onSuccess { enabled ->
                _uiState.update { it.copy(registrationEnabled = enabled, registrationStatusKnown = true) }
            }
            .onFailure {
                _uiState.update { it.copy(registrationEnabled = false, registrationStatusKnown = false) }
            }
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.usernameOrEmail.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(error = "Enter username/email and password.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val connectionState = resolveConnectionStateOrReport(resetRegistrationStatus = false)
                ?: run {
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }
            if (!saveConnectionStateOrReport(connectionState)) {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }
            if (!ensureConnectionReadyForAuth()) {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }
            authRepository.login(state.usernameOrEmail.trim(), state.password)
                .onSuccess {
                    syncManager.enqueueNetworkSync()
                    syncManager.syncNow()
                    syncManager.connectForegroundWebSocket()
                    onSuccess()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(error = userFacingAuthErrorKey(error, loginFailureMessageKey)) }
                }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private suspend fun ensureConnectionReadyForAuth(): Boolean {
        return authRepository.testConnection()
            .onSuccess {
                refreshRegistrationStatus()
                _uiState.update { it.copy(connectionMessage = connectionReadyMessageKey, connectionMessageIsError = false) }
            }
            .onFailure { error ->
                _uiState.update {
                    it.copy(
                        connectionMessage = connectionFailureMessage(error),
                        connectionMessageIsError = true,
                    )
                }
            }
            .isSuccess
    }

    private fun applyServerBaseUrlOrReport(resetRegistrationStatus: Boolean = true): LoginUiState? {
        return runCatching { applyServerBaseUrl(resetRegistrationStatus) }
            .getOrElse { error ->
                _uiState.update {
                    it.copy(
                        registrationEnabled = false,
                        registrationStatusKnown = false,
                        connectionMessage = connectionFailureMessage(error),
                        connectionMessageIsError = true,
                        error = null,
                    )
                }
                null
            }
    }

    private fun resolveConnectionStateOrReport(resetRegistrationStatus: Boolean = true): LoginUiState? {
        val current = _uiState.value
        if (!current.advancedEndpointsEdited) {
            return applyServerBaseUrlOrReport(resetRegistrationStatus)
        }
        return runCatching {
            val apiBaseUrl = validateApiBaseUrl(current.apiBaseUrl)
            val webSocketUrl = validateWebSocketUrl(current.webSocketUrl)
            current.copy(
                serverBaseUrl = inferServerBaseUrlFromApi(apiBaseUrl),
                apiBaseUrl = apiBaseUrl,
                webSocketUrl = webSocketUrl,
                registrationEnabled = if (resetRegistrationStatus) false else current.registrationEnabled,
                registrationStatusKnown = if (resetRegistrationStatus) false else current.registrationStatusKnown,
                error = null,
                connectionMessage = null,
                connectionMessageIsError = false,
            ).also { _uiState.value = it }
        }.getOrElse { error ->
            _uiState.update {
                it.copy(
                    registrationEnabled = false,
                    registrationStatusKnown = false,
                    connectionMessage = connectionFailureMessage(error),
                    connectionMessageIsError = true,
                    error = null,
                )
            }
            null
        }
    }

    private suspend fun saveConnectionStateOrReport(state: LoginUiState): Boolean {
        return runCatching {
            if (state.advancedEndpointsEdited) {
                tokenDataStore.saveNetworkEndpoints(state.apiBaseUrl, state.webSocketUrl)
            } else {
                tokenDataStore.saveServerBaseUrl(state.serverBaseUrl)
            }
        }.onFailure { error ->
            _uiState.update {
                it.copy(
                    connectionMessage = connectionFailureMessage(error),
                    connectionMessageIsError = true,
                    error = null,
                )
            }
        }.isSuccess
    }
}

class LoginViewModelFactory(
    private val authRepository: AuthRepository,
    private val syncManager: SyncManager,
    private val tokenDataStore: TokenDataStore,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return LoginViewModel(authRepository, syncManager, tokenDataStore) as T
    }
}
