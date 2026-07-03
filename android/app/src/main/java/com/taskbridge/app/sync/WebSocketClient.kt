package com.taskbridge.app.sync

import android.net.Uri
import com.google.gson.JsonParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

class WebSocketClient(
    private val scope: CoroutineScope,
    private val webSocketUrlProvider: suspend () -> String,
    private val ticketProvider: suspend (deviceId: String) -> String?,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .build()
    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    private var shouldReconnect = false
    private var lastDeviceId: String? = null
    private var lastOnTaskChanged: (suspend () -> Unit)? = null
    @Volatile
    private var connecting = false

    suspend fun connect(deviceId: String, onTaskChanged: suspend () -> Unit) {
        shouldReconnect = true
        lastDeviceId = deviceId
        lastOnTaskChanged = onTaskChanged
        if (webSocket != null || connecting) return
        connecting = true
        val ticket = ticketProvider(deviceId)
        if (ticket.isNullOrBlank()) {
            connecting = false
            scheduleReconnect()
            return
        }

        val request = runCatching {
            val url = Uri.parse(webSocketUrlProvider())
                .buildUpon()
                .appendQueryParameter("ticket", ticket)
                .appendQueryParameter("device_id", deviceId)
                .build()
                .toString()
            Request.Builder().url(url).build()
        }.getOrElse {
            connecting = false
            scheduleReconnect()
            return
        }

        webSocket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    connecting = false
                    reconnectAttempt = 0
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
                    scheduleReconnect()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    connecting = false
                    this@WebSocketClient.webSocket = null
                    scheduleReconnect()
                }
            },
        )
    }

    fun disconnect() {
        shouldReconnect = false
        reconnectJob?.cancel()
        reconnectJob = null
        connecting = false
        webSocket?.close(1000, "App moved to background")
        webSocket = null
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect || reconnectJob?.isActive == true) return
        val deviceId = lastDeviceId ?: return
        val onTaskChanged = lastOnTaskChanged ?: return
        val delayMillis = minOf(30_000L, 1_000L * (1L shl reconnectAttempt.coerceAtMost(5)))
        reconnectAttempt += 1
        reconnectJob = scope.launch {
            delay(delayMillis)
            reconnectJob = null
            connect(deviceId, onTaskChanged)
        }
    }
}
