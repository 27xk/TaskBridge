package com.taskbridge.app.ui.components

const val connectionReadyMessageKey = "connection_ready"
const val connectionFailureMessageKey = "connection_failed"
const val connectionFailureMessagePrefix = "connection_failed:"
const val authNetworkErrorKey = "network_error"
const val authServerErrorKey = "server_error"
const val loginFailureMessageKey = "login_failed"
const val registrationFailureMessageKey = "registration_failed"
const val registrationDisabledMessageKey = "registration_disabled"
const val registrationStatusUnknownMessageKey = "registration_status_unknown"

fun userFacingConnectionMessage(message: String, isEnglish: Boolean): String {
    return when {
        message == connectionReadyMessageKey -> if (isEnglish) "Connection is ready." else "连接可用。"
        message == connectionFailureMessageKey -> userFacingConnectionErrorMessage(null, isEnglish)
        message.startsWith(connectionFailureMessagePrefix) -> {
            userFacingConnectionErrorMessage(IllegalArgumentException(message.removePrefix(connectionFailureMessagePrefix)), isEnglish)
        }
        else -> message
    }
}

fun connectionFailureMessage(error: Throwable): String {
    val detail = error.message.orEmpty().trim()
    return if (detail.isBlank()) connectionFailureMessageKey else "$connectionFailureMessagePrefix$detail"
}

fun userFacingConnectionErrorMessage(error: Throwable?, isEnglish: Boolean): String {
    val normalized = error?.message.orEmpty().trim().lowercase()
    return when {
        normalized.isBlank() -> genericConnectionFailure(isEnglish)
        isServerUrlRequiredError(normalized) -> if (isEnglish) {
            "Enter the server address."
        } else {
            "请输入服务器地址。"
        }
        isServerUrlFormatError(normalized) -> if (isEnglish) {
            "The server address format is invalid. Use an address that starts with http:// or https://."
        } else {
            "服务器地址格式不正确，请填写以 http:// 或 https:// 开头的地址。"
        }
        normalized == "invalid api url" -> if (isEnglish) {
            "The advanced request address format is invalid. Use an address that starts with http:// or https://."
        } else {
            "高级请求地址格式不正确，请填写以 http:// 或 https:// 开头的地址。"
        }
        normalized == "invalid websocket url" -> if (isEnglish) {
            "The advanced sync connection address format is invalid. Use an address that starts with ws:// or wss://."
        } else {
            "高级同步连接地址格式不正确，请填写以 ws:// 或 wss:// 开头的地址。"
        }
        isServerUnavailableError(normalized) -> if (isEnglish) {
            "The server is temporarily unavailable. Try again later."
        } else {
            "服务器暂时不可用，请稍后重试。"
        }
        isNetworkConnectionError(normalized) -> if (isEnglish) {
            "Cannot connect to the server. Check the server address, network, or whether the service is running."
        } else {
            "无法连接服务器，请检查服务器地址、网络或服务是否已启动。"
        }
        else -> genericConnectionFailure(isEnglish)
    }
}

fun userFacingAuthErrorKey(error: Throwable?, fallbackKey: String): String {
    val normalized = error?.message.orEmpty().trim().lowercase()
    return when {
        normalized.contains("registration disabled") -> registrationDisabledMessageKey
        isServerUnavailableError(normalized) -> authServerErrorKey
        isNetworkConnectionError(normalized) -> authNetworkErrorKey
        else -> fallbackKey
    }
}

fun userFacingAuthErrorMessage(errorKey: String, isEnglish: Boolean, fallback: String): String {
    return when (errorKey) {
        authNetworkErrorKey -> if (isEnglish) {
            "Cannot connect to the server. Check the server address or network."
        } else {
            "无法连接服务器，请检查服务器地址或网络。"
        }
        authServerErrorKey -> if (isEnglish) {
            "The server is temporarily unavailable. Try again later."
        } else {
            "服务器暂时不可用，请稍后重试。"
        }
        else -> fallback
    }
}

private fun genericConnectionFailure(isEnglish: Boolean): String {
    return if (isEnglish) {
        "Connection check failed. Check the server address or contact the server administrator."
    } else {
        "连接检查失败，请检查服务器地址，或联系服务器管理员。"
    }
}

private fun isServerUnavailableError(message: String): Boolean {
    return listOf("500", "502", "503", "504", "server error", "internal server error").any { message.contains(it) }
}

private fun isServerUrlFormatError(message: String): Boolean {
    return listOf(
        "invalid server url",
        "server url must start",
        "invalid url",
        "no host",
        "illegal character",
    ).any { message.contains(it) }
}

private fun isServerUrlRequiredError(message: String): Boolean {
    return message.contains("server url required")
}

private fun isNetworkConnectionError(message: String): Boolean {
    return listOf(
        "connection refused",
        "connection reset",
        "econnrefused",
        "failed to connect",
        "network",
        "timeout",
        "unable to resolve host",
        "unknownhost",
    ).any { message.contains(it) }
}
