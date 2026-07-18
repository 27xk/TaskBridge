package com.taskbridge.app.ui.components

import androidx.compose.ui.platform.UriHandler

fun tryOpenExternalUri(uriHandler: UriHandler, uri: String): Boolean {
    return runCatching { uriHandler.openUri(uri) }.isSuccess
}
