package com.taskbridge.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class UserFacingErrorsTest {
    @Test
    fun invalidApiUrlGetsActionableChineseCopy() {
        assertEquals(
            "高级请求地址格式不正确，请填写以 http:// 或 https:// 开头的地址。",
            userFacingConnectionErrorMessage(IllegalArgumentException("invalid api url"), isEnglish = false),
        )
    }

    @Test
    fun invalidWebSocketUrlGetsActionableEnglishCopy() {
        assertEquals(
            "The advanced sync connection address format is invalid. Use an address that starts with ws:// or wss://.",
            userFacingConnectionErrorMessage(IllegalArgumentException("invalid websocket url"), isEnglish = true),
        )
    }
}
