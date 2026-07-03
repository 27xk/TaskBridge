package com.taskbridge.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.loginFailureMessageKey
import com.taskbridge.app.ui.components.registrationDisabledMessageKey
import com.taskbridge.app.ui.components.userFacingAuthErrorMessage
import com.taskbridge.app.ui.components.userFacingConnectionMessage
import com.taskbridge.app.ui.components.languageOptions
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLanguageChange: (AppLanguage) -> Unit,
    onLoginSuccess: () -> Unit,
    onRegisterClick: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val strings = LocalTaskBridgeStrings.current
    val language = LocalAppLanguage.current
    var languageMenuOpen by remember { mutableStateOf(false) }
    var advancedConnectionOpen by remember { mutableStateOf(false) }
    var pendingRegisterNavigation by remember { mutableStateOf(false) }
    var showRegistrationStatusUnknownAfterCheck by remember { mutableStateOf(false) }
    val isEnglish = language == AppLanguage.English
    val registrationAvailability = registrationAvailabilityUi(
        registrationStatusKnown = state.registrationStatusKnown,
        registrationEnabled = state.registrationEnabled,
        isLoading = state.isLoading,
        isEnglish = isEnglish,
    )

    LaunchedEffect(
        state.registrationStatusKnown,
        state.registrationEnabled,
        state.isTestingConnection,
        state.connectionMessageIsError,
        pendingRegisterNavigation,
    ) {
        val result = reducePendingRegistrationNavigation(
            pendingRegisterNavigation = pendingRegisterNavigation,
            registrationStatusKnown = state.registrationStatusKnown,
            registrationEnabled = state.registrationEnabled,
            isTestingConnection = state.isTestingConnection,
            connectionMessageIsError = state.connectionMessageIsError,
        )
        pendingRegisterNavigation = result.pendingRegisterNavigation
        showRegistrationStatusUnknownAfterCheck = result.shouldShowUnknownRegistrationMessage
        if (result.shouldNavigateToRegister) {
            viewModel.saveConnectionSettings()
            onRegisterClick()
        }
    }

    AppPage(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Spacer(Modifier.height(8.dp))
            AppHeader(
                title = "TaskBridge",
                subtitle = strings.loginSubtitle,
            )

            AppDropdownField(
                label = strings.language,
                selectedLabel = if (language == AppLanguage.Chinese) strings.chinese else strings.english,
                expanded = languageMenuOpen,
                options = languageOptions(strings),
                onExpandedChange = { languageMenuOpen = it },
                onSelect = onLanguageChange,
            )

            FirstUseGuide(strings = strings)

            AppPanel {
                Text(
                    text = strings.connectionSettings,
                    style = MaterialTheme.typography.titleMedium,
                )
                OutlinedTextField(
                    value = state.serverBaseUrl,
                    onValueChange = viewModel::updateServerBaseUrl,
                    label = { Text(strings.serverUrl) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = strings.serverUrlHint,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
                localhostWarningText(state.serverBaseUrl, isEnglish)?.let { warning ->
                    Text(
                        text = warning,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                OutlinedButton(
                    onClick = { viewModel.testConnection() },
                    enabled = !state.isTestingConnection,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        if (state.isTestingConnection) strings.testingConnection else strings.saveAndTestConnection,
                    )
                }
                state.connectionMessage?.let {
                    Text(
                        text = localizeConnectionMessage(it, isEnglish),
                        color = if (state.connectionMessageIsError) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                TextButton(onClick = { advancedConnectionOpen = !advancedConnectionOpen }) {
                    Text(strings.advancedConnectionSettings)
                }
                if (advancedConnectionOpen) {
                    OutlinedTextField(
                        value = state.apiBaseUrl,
                        onValueChange = viewModel::updateApiBaseUrl,
                        label = { Text(strings.requestUrlAdvanced) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.webSocketUrl,
                        onValueChange = viewModel::updateWebSocketUrl,
                        label = { Text(strings.syncConnectionUrlAdvanced) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    TextButton(onClick = { viewModel.resetGeneratedEndpoints() }) {
                        Text(strings.regenerateFromServerUrl)
                    }
                }
                Text(
                    text = strings.savedBeforeSignIn,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            AppPanel {
                Text(
                    text = strings.signIn,
                    style = MaterialTheme.typography.titleMedium,
                )
                OutlinedTextField(
                    value = state.usernameOrEmail,
                    onValueChange = viewModel::updateUsernameOrEmail,
                    label = { Text(strings.usernameOrEmail) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                PasswordTextField(
                    value = state.password,
                    onValueChange = viewModel::updatePassword,
                    strings = strings,
                    modifier = Modifier.fillMaxWidth(),
                )
                state.error?.let {
                    Text(localizeLoginError(it, strings), color = MaterialTheme.colorScheme.error)
                }
                Button(
                    onClick = { viewModel.login(onLoginSuccess) },
                    enabled = !state.isLoading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (state.isLoading) strings.signingIn else strings.signIn)
                }
                if (registrationAvailability.showCreateAccountAction) {
                    TextButton(
                        onClick = {
                            if (state.registrationStatusKnown && state.registrationEnabled) {
                                viewModel.saveConnectionSettings()
                                onRegisterClick()
                            } else {
                                showRegistrationStatusUnknownAfterCheck = false
                                pendingRegisterNavigation = true
                                viewModel.testConnection()
                            }
                        },
                        enabled = !state.isLoading && !state.isTestingConnection,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(registrationAvailability.actionText ?: strings.createAccount)
                    }
                }
                val registrationHelperText = if (showRegistrationStatusUnknownAfterCheck && !state.registrationStatusKnown) {
                    registrationStatusUnknownAfterCheckHelp(isEnglish)
                } else {
                    registrationAvailability.helperText
                }
                if (registrationHelperText != null) {
                    Text(
                        text = registrationHelperText,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun FirstUseGuide(strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings) {
    var detailsOpen by remember { mutableStateOf(false) }
    AppPanel {
        Text(
            text = strings.signInFirstUseTitle,
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = strings.signInFirstUseBody,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        TextButton(onClick = { detailsOpen = !detailsOpen }) {
            Text(if (detailsOpen) strings.hideSetupChoices else strings.setupHelpSummary)
        }
        if (detailsOpen) {
            Text(
                text = strings.setupChecklist,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = strings.localTrialHelp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = strings.localTrialGuide,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = strings.selfHostGuide,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

private fun localizeLoginError(error: String, strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings): String {
    val isEnglish = strings.chinese != "中文"
    return when (error) {
        "Enter username/email and password." -> strings.loginRequired
        "Login failed." -> strings.loginFailed
        loginFailureMessageKey -> strings.loginFailed
        registrationDisabledMessageKey -> registrationDisabledHelp(isEnglish)
        else -> userFacingAuthErrorMessage(error, isEnglish, strings.loginFailed)
    }
}

private fun localizeConnectionMessage(message: String, isEnglish: Boolean): String {
    return userFacingConnectionMessage(message, isEnglish)
}

private fun localhostWarningText(serverBaseUrl: String, isEnglish: Boolean): String? {
    val trimmed = serverBaseUrl.trim()
    if (trimmed.isBlank()) return null
    val candidate = if (trimmed.contains("://")) trimmed else "http://$trimmed"
    val host = runCatching { java.net.URI(candidate).host }
        .getOrNull()
        ?.trim('[', ']')
        ?.lowercase()
        ?: return null
    val isLoopback = host == "localhost" || host == "127.0.0.1" || host == "::1"
    if (!isLoopback) return null
    return if (isEnglish) {
        "127.0.0.1 points to this phone or emulator. To use a backend on your computer, enter that computer's LAN IP or domain."
    } else {
        "127.0.0.1 指这台手机或模拟器本身。要连接电脑上的后端，请填写那台电脑的局域网 IP 或域名。"
    }
}
