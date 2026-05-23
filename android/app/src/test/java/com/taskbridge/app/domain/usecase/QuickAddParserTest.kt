package com.taskbridge.app.domain.usecase

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

class QuickAddParserTest {
    @Test
    fun interpretsBarePastSmallHourAsLaterToday() {
        val parsed = QuickAddParser.parse(
            input = "report 8",
            now = LocalDateTime.of(2026, 5, 20, 14, 50),
        )

        assertEquals("2026-05-20T12:00:00Z", parsed.dueTime)
    }

    @Test
    fun rollsBarePastSmallHourToTomorrowWhenEveningHasPassed() {
        val parsed = QuickAddParser.parse(
            input = "report 8",
            now = LocalDateTime.of(2026, 5, 20, 21, 0),
        )

        assertEquals("2026-05-21T00:00:00Z", parsed.dueTime)
    }

    @Test
    fun keepsBareFutureHourOnToday() {
        val parsed = QuickAddParser.parse(
            input = "report 16",
            now = LocalDateTime.of(2026, 5, 20, 14, 50),
        )

        assertEquals("2026-05-20T08:00:00Z", parsed.dueTime)
    }
}
