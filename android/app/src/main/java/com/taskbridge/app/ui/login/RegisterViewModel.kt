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

data class RegisterUiState(
    val username: String = "",
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

class RegisterViewModel(
    private val authRepository: AuthRepository,
    private val syncManager: SyncManager,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState

    fun updateUsername(value: String) = _uiState.update { it.copy(username = value, error = null) }
    fun updateEmail(value: String) = _uiState.update { it.copy(email = value, error = null) }
    fun updatePassword(value: String) = _uiState.update { it.copy(password = value, error = null) }

    fun register(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.username.isBlank() || state.email.isBlank() || state.password.length < 8) {
            _uiState.update { it.copy(error = "Enter username, email and an 8+ character password.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            authRepository.register(state.username.trim(), state.email.trim(), state.password)
                .onSuccess {
                    syncManager.enqueueNetworkSync()
                    syncManager.syncNow()
                    syncManager.connectForegroundWebSocket()
                    onSuccess()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(error = error.message ?: "Registration failed.") }
                }
            _uiState.update { it.copy(isLoading = false) }
        }
    }
}

class RegisterViewModelFactory(
    private val authRepository: AuthRepository,
    private val syncManager: SyncManager,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return RegisterViewModel(authRepository, syncManager) as T
    }
}
