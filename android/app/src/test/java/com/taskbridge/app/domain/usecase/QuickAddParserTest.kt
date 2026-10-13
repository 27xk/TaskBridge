package com.taskbridge.app.domain.usecase

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

class QuickAddParserTest {
    @Test
    fun keepsQuantitiesInPlainTitlesInsteadOfTreatingThemAsTimes() {
        val parsed = QuickAddParser.parse(
            input = "购买 2 个苹果",
            now = LocalDateTime.of(2026, 5, 20, 14, 50),
        )

        assertEquals("购买 2 个苹果", parsed.title)
        assertEquals(null, parsed.dueTime)
    }

    @Test
    fun interpretsUnqualifiedPastClockAsLaterToday() {
        val parsed = QuickAddParser.parse(
            input = "report 8点",
            now = LocalDateTime.of(2026, 5, 20, 14, 50),
        )

        assertEquals("2026-05-20T12:00:00Z", parsed.dueTime)
    }

    @Test
    fun rollsUnqualifiedPastClockToTomorrowWhenEveningHasPassed() {
        val parsed = QuickAddParser.parse(
            input = "report 8点",
            now = LocalDateTime.of(2026, 5, 20, 21, 0),
        )

        assertEquals("2026-05-21T00:00:00Z", parsed.dueTime)
    }

    @Test
    fun keepsUnqualifiedFutureClockOnToday() {
        val parsed = QuickAddParser.parse(
            input = "report 16点",
            now = LocalDateTime.of(2026, 5, 20, 14, 50),
        )

        assertEquals("2026-05-20T08:00:00Z", parsed.dueTime)
    }

    @Test
    fun extractsProjectShorthandWithoutPollutingTitle() {
        val parsed = QuickAddParser.parse(
            input = "明天 9 write launch notes @Growth #release P3",
            now = LocalDateTime.of(2026, 5, 20, 14, 50),
        )

        assertEquals("write launch notes", parsed.title)
        assertEquals("Growth", parsed.project)
        assertEquals("release", parsed.tag)
        assertEquals(3, parsed.priority)
        assertEquals("2026-05-21", parsed.plannedDate)
        assertEquals("2026-05-21T01:00:00Z", parsed.dueTime)
    }

    @Test
    fun preservesFullClockMinutesBeforeTheTitle() {
        val now = LocalDateTime.of(2026, 5, 20, 8, 0)
        listOf(
            Triple("09:30 meeting", "meeting", "2026-05-20T01:30:00Z"),
            Triple("Meet 09:30 planning", "Meet planning", "2026-05-20T01:30:00Z"),
            Triple("明天09:30 开会", "开会", "2026-05-21T01:30:00Z"),
            Triple("明天 09:30 开会", "开会", "2026-05-21T01:30:00Z"),
        ).forEach { (input, title, dueTime) ->
            val parsed = QuickAddParser.parse(input = input, now = now)
            assertEquals(input, title, parsed.title)
            assertEquals(input, dueTime, parsed.dueTime)
        }
    }

    @Test
    fun preservesTrailingQuantitiesWithoutTimeMarkers() {
        listOf("苹果数量 2", "report 8", "release 16", "购买 2 个苹果").forEach { title ->
            val parsed = QuickAddParser.parse(
                input = title,
                now = LocalDateTime.of(2026, 5, 20, 14, 50),
            )
            assertEquals(title, parsed.title)
            assertEquals(null, parsed.dueTime)
            assertEquals(null, parsed.plannedDate)
        }
    }

    @Test
    fun recognizesExplicitPeriodsAndClockMarkers() {
        listOf("下午3 开会", "下午3点 开会", "开会 下午3点").forEach { input ->
            val parsed = QuickAddParser.parse(
                input = input,
                now = LocalDateTime.of(2026, 5, 20, 8, 0),
            )
            assertEquals(input, "开会", parsed.title)
            assertEquals(input, "2026-05-20T07:00:00Z", parsed.dueTime)
        }
    }
}
