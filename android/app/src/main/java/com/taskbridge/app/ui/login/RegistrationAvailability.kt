package com.taskbridge.app.ui.login

data class RegistrationAvailabilityUi(
    val showCreateAccountAction: Boolean,
    val canEditAccountFields: Boolean,
    val canSubmitRegistration: Boolean,
    val helperText: String?,
    val actionText: String?,
)

data class PendingRegistrationNavigationResult(
    val pendingRegisterNavigation: Boolean,
    val shouldNavigateToRegister: Boolean,
    val shouldShowUnknownRegistrationMessage: Boolean,
)

fun registrationAvailabilityUi(
    registrationStatusKnown: Boolean,
    registrationEnabled: Boolean,
    isLoading: Boolean,
    isEnglish: Boolean,
): RegistrationAvailabilityUi {
    return when {
        !registrationStatusKnown -> RegistrationAvailabilityUi(
            showCreateAccountAction = true,
            canEditAccountFields = !isLoading,
            canSubmitRegistration = !isLoading,
            helperText = registrationStatusPendingHelp(isEnglish),
            actionText = registrationCheckAction(isEnglish),
        )
        !registrationEnabled -> RegistrationAvailabilityUi(
            showCreateAccountAction = false,
            canEditAccountFields = false,
            canSubmitRegistration = false,
            helperText = registrationDisabledHelp(isEnglish),
            actionText = null,
        )
        else -> RegistrationAvailabilityUi(
            showCreateAccountAction = true,
            canEditAccountFields = !isLoading,
            canSubmitRegistration = !isLoading,
            helperText = null,
            actionText = null,
        )
    }
}

fun reducePendingRegistrationNavigation(
    pendingRegisterNavigation: Boolean,
    registrationStatusKnown: Boolean,
    registrationEnabled: Boolean,
    isTestingConnection: Boolean,
    connectionMessageIsError: Boolean,
): PendingRegistrationNavigationResult {
    if (!pendingRegisterNavigation) {
        return PendingRegistrationNavigationResult(
            pendingRegisterNavigation = false,
            shouldNavigateToRegister = false,
            shouldShowUnknownRegistrationMessage = false,
        )
    }
    if (registrationStatusKnown) {
        return PendingRegistrationNavigationResult(
            pendingRegisterNavigation = false,
            shouldNavigateToRegister = registrationEnabled,
            shouldShowUnknownRegistrationMessage = false,
        )
    }
    if (!isTestingConnection && connectionMessageIsError) {
        return PendingRegistrationNavigationResult(
            pendingRegisterNavigation = false,
            shouldNavigateToRegister = false,
            shouldShowUnknownRegistrationMessage = false,
        )
    }
    if (!isTestingConnection) {
        return PendingRegistrationNavigationResult(
            pendingRegisterNavigation = false,
            shouldNavigateToRegister = false,
            shouldShowUnknownRegistrationMessage = true,
        )
    }
    return PendingRegistrationNavigationResult(
        pendingRegisterNavigation = true,
        shouldNavigateToRegister = false,
        shouldShowUnknownRegistrationMessage = false,
    )
}

fun registrationCheckAction(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Check and create account"
    } else {
        "检查并创建账号"
    }
}

fun registrationStatusPendingHelp(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Tap Check and create account to confirm whether this server allows registration. You can still sign in with an existing account."
    } else {
        "点击“检查并创建账号”即可确认当前服务器是否开放注册。已有账号可以直接登录。"
    }
}

fun registrationStatusUnknownAfterCheckHelp(isEnglish: Boolean): String {
    return if (isEnglish) {
        "The server is reachable, but TaskBridge could not confirm whether registration is open. Try again, or sign in with an existing account."
    } else {
        "服务器可以连接，但暂时无法确认是否开放注册。请稍后重试，或使用已有账号登录。"
    }
}

fun registrationDisabledHelp(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Open registration is disabled on this server. Use an existing account or ask the server admin to create one."
    } else {
        "当前服务器已关闭开放注册。请使用已有账号登录，或联系服务器管理员创建账号。"
    }
}
