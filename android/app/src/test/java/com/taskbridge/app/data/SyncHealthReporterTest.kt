package com.taskbridge.app.data

import com.taskbridge.app.data.repository.SyncHealthReporter
import com.taskbridge.app.data.local.SyncHealthSnapshot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class SyncHealthReporterTest {
    @Test
    fun stalledHealthTransportCannotHoldThePrimarySyncOpen() = runTest {
        val reporter = SyncHealthReporter(
            currentWorkspaceId = { "workspace" }, hasAccessToken = { true },
            readHealth = { SyncHealthSnapshot(0, null, 0) },
            sendHealth = { _, _ -> awaitCancellation() },
        )
        withTimeout(6_000) {
            reporter.report("workspace", "phone", succeeded = true)
        }
    }

    @Test
    fun reportsAggregatesAndThrottlesSuccessAndFailureAttempts() = runTest {
        var elapsed = 0L
        val reports = mutableListOf<com.taskbridge.app.data.remote.dto.SyncHealthReportDto>()
        val reporter = SyncHealthReporter(
            currentWorkspaceId = { "workspace" },
            hasAccessToken = { true },
            readHealth = { SyncHealthSnapshot(3, "2026-05-20T11:58:00Z", 2) },
            sendHealth = { report, _ -> reports += report },
            now = { Instant.parse("2026-05-20T12:00:00Z") },
            elapsedMillis = { elapsed },
        )
        reporter.report("workspace", "phone", succeeded = true)
        reporter.report("workspace", "phone", succeeded = false)
        assertEquals(1, reports.size)
        assertEquals(3, reports.single().pendingCount)
        assertEquals(120L, reports.single().oldestPendingSeconds)
        assertEquals(2, reports.single().conflictCount)
        assertEquals(0L, reports.single().lastSuccessAgeSeconds)
        elapsed = 60_000
        reporter.report("workspace", "phone", succeeded = false)
        assertEquals(2, reports.size)
    }

    @Test
    fun noTokenOrChangedWorkspaceSkipsDatabaseAndNetwork() = runTest {
        var workspace = "other"
        var token = true
        var reads = 0
        val reporter = SyncHealthReporter(
            currentWorkspaceId = { workspace }, hasAccessToken = { token },
            readHealth = { reads++; SyncHealthSnapshot(0, null, 0) },
            sendHealth = { _, _ -> error("must not send") },
        )
        reporter.report("expected", "phone", succeeded = true)
        workspace = "expected"
        token = false
        reporter.report("expected", "phone", succeeded = true)
        assertEquals(0, reads)
    }

    @Test
    fun workspaceSwitchDuringReadSkipsNetworkAndFailureIsBestEffort() = runTest {
        var workspace = "expected"
        var sent = false
        val reporter = SyncHealthReporter(
            currentWorkspaceId = { workspace }, hasAccessToken = { true },
            readHealth = { workspace = "other"; SyncHealthSnapshot(0, null, 0) },
            sendHealth = { _, _ -> sent = true },
        )
        reporter.report("expected", "phone", succeeded = false)
        assertTrue(!sent)
        SyncHealthReporter(
            currentWorkspaceId = { "expected" }, hasAccessToken = { true },
            readHealth = { SyncHealthSnapshot(0, null, 0) },
            sendHealth = { _, _ -> throw java.io.IOException("offline") },
        ).report("expected", "phone", succeeded = false)
    }

    @Test
    fun cancellationPropagatesAndUnknownSuccessAgeRemainsNull() = runTest {
        var unknownAge: Long? = -1L
        val reporter = SyncHealthReporter(
            currentWorkspaceId = { "expected" }, hasAccessToken = { true },
            readHealth = { SyncHealthSnapshot(0, null, 0) },
            sendHealth = { report, _ -> unknownAge = report.lastSuccessAgeSeconds; throw CancellationException("cancel") },
        )
        var cancelled = false
        try {
            reporter.report("expected", "phone", succeeded = false)
        } catch (_: CancellationException) {
            cancelled = true
        }
        assertTrue(cancelled)
        assertNull(unknownAge)
    }
}
