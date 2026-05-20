package com.taskbridge.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.taskbridge.app.ui.components.AppDropdownField
import com.taskbridge.app.ui.components.AppHeader
import com.taskbridge.app.ui.components.AppPage
import com.taskbridge.app.ui.components.AppPanel
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

            AppPanel {
                AppDropdownField(
                    label = strings.language,
                    selectedLabel = if (language == AppLanguage.Chinese) strings.chinese else strings.english,
                    expanded = languageMenuOpen,
                    options = languageOptions(strings),
                    onExpandedChange = { languageMenuOpen = it },
                    onSelect = onLanguageChange,
                )
                OutlinedTextField(
                    value = state.usernameOrEmail,
                    onValueChange = viewModel::updateUsernameOrEmail,
                    label = { Text(strings.usernameOrEmail) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.password,
                    onValueChange = viewModel::updatePassword,
                    label = { Text(strings.password) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
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
                TextButton(onClick = onRegisterClick, modifier = Modifier.fillMaxWidth()) {
                    Text(strings.createAccount)
                }
            }
        }
    }
}

private fun localizeLoginError(error: String, strings: com.taskbridge.app.ui.i18n.TaskBridgeStrings): String {
    return when (error) {
        "Enter username/email and password." -> strings.loginRequired
        "Login failed." -> strings.loginFailed
        else -> error
    }
}
