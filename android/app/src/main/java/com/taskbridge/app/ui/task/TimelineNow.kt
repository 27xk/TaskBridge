package com.taskbridge.app.ui.task

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import java.time.Instant
import kotlinx.coroutines.delay

@Composable
fun rememberTimelineNow(): Instant {
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = Instant.now()
            val delayMillis = 60_000L - (System.currentTimeMillis() % 60_000L)
            delay(delayMillis.coerceAtLeast(1_000L))
        }
    }
    return now
}
