package com.taskbridge.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.taskbridge.app.data.repository.AuthRepository
import com.taskbridge.app.sync.SyncManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val usernameOrEmail: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
    private val syncManager: SyncManager,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState

    fun updateUsernameOrEmail(value: String) {
        _uiState.update { it.copy(usernameOrEmail = value, error = null) }
    }

    fun updatePassword(value: String) {
        _uiState.update { it.copy(password = value, error = null) }
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.usernameOrEmail.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(error = "Enter username/email and password.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            authRepository.login(state.usernameOrEmail.trim(), state.password)
                .onSuccess {
                    syncManager.enqueueNetworkSync()
                    syncManager.syncNow()
                    syncManager.connectForegroundWebSocket()
                    onSuccess()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(error = error.message ?: "Login failed.") }
                }
            _uiState.update { it.copy(isLoading = false) }
        }
    }
}

class LoginViewModelFactory(
    private val authRepository: AuthRepository,
    private val syncManager: SyncManager,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return LoginViewModel(authRepository, syncManager) as T
    }
}
