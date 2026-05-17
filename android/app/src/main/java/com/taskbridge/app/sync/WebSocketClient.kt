package com.taskbridge.app.sync

import com.google.gson.JsonParser
import com.taskbridge.app.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

class WebSocketClient(
    private val scope: CoroutineScope,
    private val ticketProvider: suspend (deviceId: String) -> String?,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .build()
    private var webSocket: WebSocket? = null
    @Volatile
    private var connecting = false

    suspend fun connect(deviceId: String, onTaskChanged: suspend () -> Unit) {
        if (webSocket != null || connecting) return
        connecting = true
        val ticket = ticketProvider(deviceId)
        if (ticket.isNullOrBlank()) {
            connecting = false
            return
        }

        val request = runCatching {
            val url = BuildConfig.TASKBRIDGE_WS_URL.toHttpUrl()
                .newBuilder()
                .addQueryParameter("ticket", ticket)
                .addQueryParameter("device_id", deviceId)
                .build()
            Request.Builder().url(url).build()
        }.getOrElse {
            connecting = false
            return
        }

        webSocket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    connecting = false
                    webSocket.send("ping")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    val event = runCatching {
                        JsonParser.parseString(text).asJsonObject.get("event").asString
                    }.getOrNull()
                    if (event == "task_changed") {
                        scope.launch { onTaskChanged() }
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    connecting = false
                    this@WebSocketClient.webSocket = null
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    connecting = false
                    this@WebSocketClient.webSocket = null
                }
            },
        )
    }

    fun disconnect() {
        connecting = false
        webSocket?.close(1000, "App moved to background")
        webSocket = null
    }
}
