package com.taskbridge.app.ui.login

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import com.taskbridge.app.ui.i18n.TaskBridgeStrings

@Composable
fun PasswordTextField(
    value: String,
    onValueChange: (String) -> Unit,
    strings: TaskBridgeStrings,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    label: String = strings.password,
    isError: Boolean = false,
) {
    var passwordVisible by remember { mutableStateOf(false) }
    val toggleLabel = if (passwordVisible) strings.hidePassword else strings.showPassword

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        enabled = enabled,
        isError = isError,
        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            TextButton(onClick = { passwordVisible = !passwordVisible }, enabled = enabled) {
                Text(toggleLabel)
            }
        },
        singleLine = true,
        modifier = modifier,
    )
}
