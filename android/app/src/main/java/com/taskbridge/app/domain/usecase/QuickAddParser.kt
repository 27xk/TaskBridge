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
    val dueTime: String?,
    val plannedDate: String?,
)

object QuickAddParser {
    private val priorityRegex = Regex("""(?i)\bP([0-5])\b""")
    private val tagRegex = Regex("""#([\p{L}\p{N}_-]{1,32})""")
    private val timeRegex = Regex("""(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?::(\d{2}))?\s*(点|:)?""")

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

        val date = when {
            working.contains("后天") -> now.toLocalDate().plusDays(2)
            working.contains("明天") -> now.toLocalDate().plusDays(1)
            working.contains("今天") -> now.toLocalDate()
            working.contains("今晚") -> now.toLocalDate()
            else -> null
        }
        working = working
            .replace("后天", "")
            .replace("明天", "")
            .replace("今天", "")
            .replace("今晚", "")
            .trim()

        val timeMatch = timeRegex.find(working)
        val parsedTime = timeMatch?.let { match ->
            val period = match.groupValues.getOrNull(1).orEmpty()
            val hourRaw = match.groupValues.getOrNull(2)?.toIntOrNull() ?: return@let null
            val minute = match.groupValues.getOrNull(3)?.toIntOrNull() ?: 0
            val hour = when {
                period in listOf("下午", "晚上") && hourRaw < 12 -> hourRaw + 12
                period == "中午" && hourRaw < 12 -> hourRaw + 12
                else -> hourRaw
            }.coerceIn(0, 23)
            LocalTime.of(hour, minute.coerceIn(0, 59))
        }
        if (timeMatch != null) {
            working = working.replace(timeMatch.value, "").trim()
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
}
