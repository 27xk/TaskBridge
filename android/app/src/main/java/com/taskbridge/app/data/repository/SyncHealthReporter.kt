package com.taskbridge.app.data.repository

import com.taskbridge.app.data.local.SyncHealthSnapshot
import com.taskbridge.app.data.remote.dto.SyncHealthReportDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Duration
import java.time.Instant

/** Health is a bounded, best-effort observation; it never changes the sync queue. */
class SyncHealthReporter(
    private val currentWorkspaceId: suspend () -> String?,
    private val hasAccessToken: suspend () -> Boolean,
    private val readHealth: suspend (String) -> SyncHealthSnapshot,
    private val sendHealth: suspend (SyncHealthReportDto, String) -> Unit,
    private val now: () -> Instant = { Instant.now() },
    private val elapsedMillis: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    private val mutex = Mutex()
    private var lastAttemptAt: Long? = null
    private var lastSuccessWorkspace: String? = null
    private var lastSuccessAt: Instant? = null

    suspend fun report(workspaceId: String, deviceId: String, succeeded: Boolean) {
        try {
            mutex.withLock {
                if (currentWorkspaceId() != workspaceId || !hasAccessToken()) return
                val currentTime = now()
                if (succeeded) {
                    lastSuccessWorkspace = workspaceId
                    lastSuccessAt = currentTime
                }
                val elapsed = elapsedMillis()
                if (lastAttemptAt?.let { elapsed - it < 60_000 } == true) return
                // Throttle attempts, including read/network failures, to avoid retry storms.
                lastAttemptAt = elapsed
                withTimeoutOrNull(5_000) {
                    val snapshot = readHealth(workspaceId)
                    if (currentWorkspaceId() != workspaceId || !hasAccessToken()) return@withTimeoutOrNull
                    sendHealth(
                        SyncHealthReportDto(
                            deviceId = deviceId,
                            pendingCount = snapshot.pendingCount.coerceIn(0, 1_000_000),
                            conflictCount = snapshot.conflictCount.coerceIn(0, 1_000_000),
                            oldestPendingSeconds = ageSeconds(snapshot.oldestCreatedAt, currentTime) ?: 0,
                            lastSuccessAgeSeconds = if (lastSuccessWorkspace == workspaceId) {
                                lastSuccessAt?.let {
                                    Duration.between(it, currentTime).seconds.coerceIn(0, MAX_AGE_SECONDS)
                                }
                            } else null,
                        ),
                        workspaceId,
                    )
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // The primary sync result and its durable local state remain authoritative.
        }
    }

    private fun ageSeconds(timestamp: String?, currentTime: Instant): Long? = timestamp?.let {
        runCatching { Duration.between(Instant.parse(it), currentTime).seconds.coerceIn(0, MAX_AGE_SECONDS) }
            .getOrNull()
    }

    private companion object {
        const val MAX_AGE_SECONDS = 315_360_000L
    }
}
