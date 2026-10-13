package com.taskbridge.app.domain.usecase

import com.taskbridge.app.utils.ShanghaiTime
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

data class ParsedQuickTask(
    val title: String,
    val priority: Int,
    val tag: String?,
    val project: String?,
    val dueTime: String?,
    val plannedDate: String?,
)

object QuickAddParser {
    private val priorityRegex = Regex("""(?i)\bP([0-5])\b""")
    private val tagRegex = Regex("""#([\p{L}\p{N}_-]{1,32})""")
    private val projectRegex = Regex("""@([\p{L}\p{N}_-]{1,64})""")
    private val dateTimeRegex = Regex(
        """(今天|明天|后天|今晚)\s*(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?::(\d{2}))?\s*(点|:)?(?=\s|$)""",
    )
    private val dateRegex = Regex("今天|明天|后天|今晚")
    private val timeRegex = Regex(
        """(?<![\p{L}\p{N}_])(?=(?:上午|下午|晚上|中午)\s*\d|\d{1,2}(?::\d{2}(?!\d)|\s*点))(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?::(\d{2}))?\s*点?(?![\d:])""",
    )

    fun parse(
        input: String,
        timeZoneId: String = ShanghaiTime.DEFAULT_ZONE_ID,
        now: LocalDateTime = LocalDateTime.now(ShanghaiTime.zone(timeZoneId)),
    ): ParsedQuickTask {
        val targetZone = ShanghaiTime.zone(timeZoneId)
        var working = input.trim()

        val priority = priorityRegex.find(working)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0
        working = working.replace(priorityRegex, "").trim()

        val tag = tagRegex.find(working)?.groupValues?.getOrNull(1)
        working = working.replace(tagRegex, "").trim()

        val project = projectRegex.find(working)?.groupValues?.getOrNull(1)
        working = working.replace(projectRegex, "").trim()

        val dateTimeMatch = dateTimeRegex.find(working)
        val date: java.time.LocalDate?
        val timeMatch: MatchResult?
        val parsedTime: LocalTime?
        if (dateTimeMatch != null) {
            date = dateFromKeyword(dateTimeMatch.groupValues[1], now)
            parsedTime = parseClock(
                period = dateTimeMatch.groupValues.getOrNull(2).orEmpty(),
                hourText = dateTimeMatch.groupValues.getOrNull(3).orEmpty(),
                minuteText = dateTimeMatch.groupValues.getOrNull(4).orEmpty(),
            )
            timeMatch = dateTimeMatch
            working = working.removeRange(dateTimeMatch.range).trim()
        } else {
            val dateMatch = dateRegex.find(working)
            date = dateMatch?.let { dateFromKeyword(it.value, now) }
            if (dateMatch != null) working = working.removeRange(dateMatch.range).trim()
            timeMatch = timeRegex.find(working)
            parsedTime = timeMatch?.let { match ->
                parseClock(
                    period = match.groupValues.getOrNull(1).orEmpty(),
                    hourText = match.groupValues.getOrNull(2).orEmpty(),
                    minuteText = match.groupValues.getOrNull(3).orEmpty(),
                )
            }
            if (timeMatch != null) working = working.removeRange(timeMatch.range).trim()
        }

        val plannedDate = date?.format(DateTimeFormatter.ISO_LOCAL_DATE)
        val dueTime = if (date != null || parsedTime != null) {
            resolveDueDateTime(date, parsedTime, timeMatch, now)
                .atZone(targetZone)
                .toInstant()
                .toString()
        } else {
            null
        }

        return ParsedQuickTask(
            title = working.ifBlank { input.trim() },
            priority = priority,
            tag = tag?.lowercase(Locale.getDefault()),
            project = project,
            dueTime = dueTime,
            plannedDate = plannedDate,
        )
    }

    private fun resolveDueDateTime(
        explicitDate: java.time.LocalDate?,
        parsedTime: LocalTime?,
        timeMatch: MatchResult?,
        now: LocalDateTime,
    ): LocalDateTime {
        val dueClock = parsedTime ?: LocalTime.of(18, 0)
        val dueDateTime = LocalDateTime.of(explicitDate ?: now.toLocalDate(), dueClock)
        if (explicitDate != null || parsedTime == null || !isBareSmallHour(timeMatch)) return dueDateTime

        if (dueDateTime.isBefore(now)) {
            val eveningDateTime = dueDateTime.plusHours(12)
            if (eveningDateTime.isAfter(now)) return eveningDateTime
            return dueDateTime.plusDays(1)
        }
        return dueDateTime
    }

    private fun isBareSmallHour(timeMatch: MatchResult?): Boolean {
        val match = timeMatch ?: return false
        if (match.groupValues.getOrNull(1).orEmpty().isNotBlank()) return false
        val hourRaw = match.groupValues.getOrNull(2)?.toIntOrNull() ?: return false
        return hourRaw in 1..11
    }

    private fun dateFromKeyword(keyword: String, now: LocalDateTime): java.time.LocalDate {
        return when (keyword) {
            "后天" -> now.toLocalDate().plusDays(2)
            "明天" -> now.toLocalDate().plusDays(1)
            else -> now.toLocalDate()
        }
    }

    private fun parseClock(period: String, hourText: String, minuteText: String): LocalTime? {
        if (hourText.isBlank()) return null
        val hourRaw = hourText.toIntOrNull() ?: return null
        val minute = minuteText.toIntOrNull() ?: 0
        val hour = when {
            period in listOf("下午", "晚上") && hourRaw < 12 -> hourRaw + 12
            period == "中午" && hourRaw < 12 -> hourRaw + 12
            else -> hourRaw
        }.coerceIn(0, 23)
        return LocalTime.of(hour, minute.coerceIn(0, 59))
    }
}
