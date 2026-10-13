package com.taskbridge.app.sync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class WebSocketLifecycleTest {
    @Test
    fun aTicketFromThePreviousForegroundSessionCannotOpenANewSocket() = runTest {
        val oldTicket = CompletableDeferred<String?>()
        val newTicket = CompletableDeferred<String?>()
        var ticketCalls = 0
        var urlCalls = 0
        val client = WebSocketClient(
            backgroundScope,
            webSocketUrlProvider = { urlCalls += 1; "ws://127.0.0.1:9/ws" },
            ticketProvider = { if (++ticketCalls == 1) oldTicket.await() else newTicket.await() },
        )
        backgroundScope.launch { client.connect("device") {} }
        runCurrent()
        client.disconnect()
        backgroundScope.launch { client.connect("device") {} }
        runCurrent()
        oldTicket.complete("stale-ticket")
        runCurrent()
        assertEquals(0, urlCalls)
        newTicket.complete("current-ticket")
        runCurrent()
        assertEquals(1, urlCalls)
        client.close()
    }
}
