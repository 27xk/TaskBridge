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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.taskbridge.app.BuildConfig
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppDrawer
import com.taskbridge.app.ui.components.AppDynamicStatusText
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppHelpTooltip
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
import com.taskbridge.app.ui.components.AppToast
import com.taskbridge.app.ui.components.tryOpenExternalUri
import com.taskbridge.app.ui.components.loginFailureMessageKey
import com.taskbridge.app.ui.components.registrationDisabledMessageKey
import com.taskbridge.app.ui.components.userFacingAuthErrorMessage
import com.taskbridge.app.ui.components.userFacingConnectionMessage
import com.taskbridge.app.ui.components.languageOptions
import com.taskbridge.app.ui.i18n.AppLanguage
import com.taskbridge.app.ui.i18n.LocalAppLanguage
import com.taskbridge.app.ui.i18n.LocalTaskBridgeStrings

private const val LOCAL_TRIAL_GUIDE_URL =
    "https://github.com/27xk/TaskBridge/blob/main/docs/user-quick-start.md#%E6%B2%A1%E6%9C%89%E6%9C%8D%E5%8A%A1%E5%99%A8%E5%9C%B0%E5%9D%80"
private const val SELF_HOST_GUIDE_URL =
    "https://github.com/27xk/TaskBridge/blob/main/deploy/README.md"

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    canContinueOffline: Boolean,
    onLanguageChange: (AppLanguage) -> Unit,
    onLoginSuccess: () -> Unit,
    onContinueOffline: () -> Unit,
    onRegisterClick: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val strings = LocalTaskBridgeStrings.current
    val language = LocalAppLanguage.current
    var languageMenuOpen by remember { mutableStateOf(false) }
    var advancedConnectionOpen by remember { mutableStateOf(false) }
    var pendingRegisterNavigation by remember { mutableStateOf(false) }
    var showRegistrationStatusUnknownAfterCheck by remember { mutableStateOf(false) }
    var signInAttempt by remember { mutableStateOf(0) }
    var connectionAttempt by remember { mutableStateOf(0) }
    var manualConnectionTestRequested by remember { mutableStateOf(false) }
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

            SignInPanel(
                state = state,
                strings = strings,
                registrationAvailability = registrationAvailability,
                showRegistrationStatusUnknownAfterCheck = showRegistrationStatusUnknownAfterCheck,
                isEnglish = isEnglish,
                canContinueOffline = canContinueOffline,
                signInAttempt = signInAttempt,
                onServerBaseUrlChange = viewModel::updateServerBaseUrl,
                onUsernameOrEmailChange = viewModel::updateUsernameOrEmail,
                onPasswordChange = viewModel::updatePassword,
                onSignIn = {
                    viewModel.clearFeedback()
                    manualConnectionTestRequested = false
                    signInAttempt += 1
                    viewModel.login(onLoginSuccess)
                },
                onContinueOffline = onContinueOffline,
                onCreateAccount = {
                    viewModel.clearFeedback()
                    manualConnectionTestRequested = false
                    if (state.registrationStatusKnown && state.registrationEnabled) {
                        viewModel.saveConnectionSettings()
                        onRegisterClick()
                    } else {
                        showRegistrationStatusUnknownAfterCheck = false
                        pendingRegisterNavigation = true
                        connectionAttempt += 1
                        viewModel.testConnection()
                    }
                },
            )

            authConnectionFeedback(
                message = state.connectionMessage,
                isError = state.connectionMessageIsError,
                manualTestRequested = manualConnectionTestRequested,
                isAuthenticating = state.isLoading,
                authError = state.error,
            )?.let {
                AppDynamicStatusText(
                    text = localizeConnectionMessage(it, isEnglish),
                    isError = state.connectionMessageIsError,
                    eventKey = Triple(connectionAttempt, signInAttempt, it),
                )
            }

            if (BuildConfig.DEBUG) AppPanel {
                Text(
                    text = strings.connectionSettings,
                    style = MaterialTheme.typography.titleMedium,
                )
                localhostWarningText(state.serverBaseUrl, isEnglish)?.let { warning ->
                    AppHelpTooltip(
                        text = warning,
                        label = if (isEnglish) "Local address help" else "本机地址说明",
                    )
                }
                TextButton(onClick = { advancedConnectionOpen = !advancedConnectionOpen }) {
                    Text(strings.advancedConnectionSettings)
                }
                AppHelpTooltip(
                    text = strings.advancedConnectionSecondaryHint,
                    label = if (isEnglish) "Advanced connection help" else "高级连接说明",
                )
                if (advancedConnectionOpen) {
                    OutlinedButton(
                        onClick = {
                            viewModel.clearFeedback()
                            manualConnectionTestRequested = true
                            connectionAttempt += 1
                            viewModel.testConnection()
                        },
                        enabled = !state.isTestingConnection && !state.isLoading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (state.isTestingConnection) strings.testingConnection else strings.saveAndTestConnection,
                        )
                    }
                    OutlinedTextField(
                        value = state.apiBaseUrl,
                        onValueChange = viewModel::updateApiBaseUrl,
                        label = { Text(strings.requestUrlAdvanced) },
                        isError = state.connectionMessageIsError,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.webSocketUrl,
                        onValueChange = viewModel::updateWebSocketUrl,
                        label = { Text(strings.syncConnectionUrlAdvanced) },
                        isError = state.connectionMessageIsError,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    TextButton(onClick = { viewModel.resetGeneratedEndpoints() }) {
                        Text(strings.regenerateFromServerUrl)
                    }
                }
                AppHelpTooltip(
                    text = strings.savedBeforeSignIn,
                    label = if (isEnglish) "Connection saving help" else "连接保存说明",
                )
            }

            if (BuildConfig.DEBUG) FirstUseGuide(strings = strings)
        }
    }
}

@Composable
private fun SignInPanel(
    state: LoginUiState,
    strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings,
    registrationAvailability: RegistrationAvailabilityUi,
    showRegistrationStatusUnknownAfterCheck: Boolean,
    isEnglish: Boolean,
    canContinueOffline: Boolean,
    signInAttempt: Int,
    onServerBaseUrlChange: (String) -> Unit,
    onUsernameOrEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
    onContinueOffline: () -> Unit,
    onCreateAccount: () -> Unit,
) {
    AppPanel {
        Text(
            text = strings.signIn,
            style = MaterialTheme.typography.titleMedium,
        )
        if (BuildConfig.DEBUG) {
            OutlinedTextField(
                value = state.serverBaseUrl,
                onValueChange = onServerBaseUrlChange,
                label = { Text(strings.serverUrl) },
                isError = state.connectionMessageIsError,
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (BuildConfig.DEBUG) {
            AppHelpTooltip(
                text = strings.serverUrlHint,
                label = if (isEnglish) "Server address help" else "服务器地址说明",
            )
        }
        if (canContinueOffline) {
            AppHelpTooltip(
                text = strings.localWorkspaceAvailableBody,
                label = strings.localWorkspaceAvailableTitle,
            )
            OutlinedButton(
                onClick = onContinueOffline,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(strings.continueWithLocalTasks)
            }
        }
        OutlinedTextField(
            value = state.usernameOrEmail,
            onValueChange = onUsernameOrEmailChange,
            label = { Text(strings.usernameOrEmail) },
            isError = state.error != null,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        PasswordTextField(
            value = state.password,
            onValueChange = onPasswordChange,
            strings = strings,
            isError = state.error != null,
            modifier = Modifier.fillMaxWidth(),
        )
        AppHelpTooltip(
            text = passwordRecoveryHelp(isEnglish),
            label = if (isEnglish) "Forgot password?" else "忘记密码？",
        )
        state.error?.let {
            AppDynamicStatusText(
                text = localizeLoginError(it, strings),
                isError = true,
                eventKey = signInAttempt to it,
            )
        }
        Button(
            onClick = onSignIn,
            enabled = !state.isLoading && !state.isTestingConnection,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (state.isLoading) strings.signingIn else strings.signIn)
        }
        if (registrationAvailability.showCreateAccountAction) {
            TextButton(
                onClick = onCreateAccount,
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
            AppHelpTooltip(
                text = registrationHelperText,
                label = if (isEnglish) "Registration help" else "注册说明",
            )
        }
    }
}

@Composable
private fun FirstUseGuide(strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings) {
    var detailsOpen by remember { mutableStateOf(false) }
    var externalLinkError by remember { mutableStateOf("") }
    var externalLinkAttempt by remember { mutableStateOf(0) }
    val uriHandler = LocalUriHandler.current
    fun openGuide(url: String) {
        externalLinkError = ""
        externalLinkAttempt += 1
        if (!tryOpenExternalUri(uriHandler, url)) externalLinkError = strings.externalLinkFailed
    }
    TextButton(onClick = { detailsOpen = true }, modifier = Modifier.fillMaxWidth()) {
        Text(strings.setupHelpSummary)
    }
    if (detailsOpen) {
        AppDrawer(
            onDismissRequest = { detailsOpen = false },
            title = { Text(strings.signInFirstUseTitle) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(strings.signInFirstUseBody)
                    Text(strings.localTrialHelp)
                    Text(strings.localTrialGuide)
                    Text(strings.selfHostGuide)
                    OutlinedButton(
                        onClick = { openGuide(LOCAL_TRIAL_GUIDE_URL) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.openLocalTrialGuide)
                    }
                    TextButton(
                        onClick = { openGuide(SELF_HOST_GUIDE_URL) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(strings.openSelfHostGuide)
                    }
                }
            },
        )
    }
    if (externalLinkError.isNotBlank()) {
        AppToast(
            text = externalLinkError,
            isError = true,
            eventKey = externalLinkAttempt,
            onDismiss = { externalLinkError = "" },
        )
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

private fun passwordRecoveryHelp(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Forgot your password? Ask the server administrator to reset it."
    } else {
        "忘记密码？请联系服务器管理员重置。"
    }
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
