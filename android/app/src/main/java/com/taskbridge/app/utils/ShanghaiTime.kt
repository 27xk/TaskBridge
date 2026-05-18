package com.taskbridge.app.utils

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

object ShanghaiTime {
    const val DEFAULT_ZONE_ID = "Asia/Shanghai"
    val zone: ZoneId = ZoneId.of(DEFAULT_ZONE_ID)

    private val displayDateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    private val displayTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    private val monthDayFormatter = DateTimeFormatter.ofPattern("M月d日", Locale.CHINA)
    private val inputFormatters = listOf(
        DateTimeFormatter.ISO_LOCAL_DATE_TIME,
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm[:ss]"),
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"),
        DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm[:ss]"),
    )
    private val storedLocalDateTimeFormatters = listOf(
        DateTimeFormatter.ISO_LOCAL_DATE_TIME,
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm[:ss]"),
        DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm[:ss]"),
    )

    fun zone(timeZoneId: String?): ZoneId {
        return runCatching { ZoneId.of(timeZoneId?.trim().orEmpty()) }.getOrDefault(zone)
    }

    fun todayDate(timeZoneId: String? = DEFAULT_ZONE_ID): LocalDate = LocalDate.now(zone(timeZoneId))

    fun todayString(timeZoneId: String? = DEFAULT_ZONE_ID): String = todayDate(timeZoneId).toString()

    fun dayBounds(day: String = todayString(), timeZoneId: String? = DEFAULT_ZONE_ID): Pair<String, String> {
        val targetZone = zone(timeZoneId)
        val date = runCatching { LocalDate.parse(day) }.getOrDefault(todayDate(timeZoneId))
        return date.atStartOfDay(targetZone).toInstant().toString() to
            date.plusDays(1).atStartOfDay(targetZone).toInstant().toString()
    }

    fun formatDateTime(value: String?, timeZoneId: String? = DEFAULT_ZONE_ID): String {
        val instant = parseStoredInstant(value) ?: return value.orEmpty()
        return displayDateTimeFormatter.format(instant.atZone(zone(timeZoneId)))
    }

    fun formatTime(value: String?, timeZoneId: String? = DEFAULT_ZONE_ID): String {
        val instant = parseStoredInstant(value) ?: return "--:--"
        return displayTimeFormatter.format(instant.atZone(zone(timeZoneId)))
    }

    fun localDate(value: String?, timeZoneId: String? = DEFAULT_ZONE_ID): LocalDate? {
        return parseStoredInstant(value)?.atZone(zone(timeZoneId))?.toLocalDate()
    }

    fun formatMonthDay(date: LocalDate): String {
        return monthDayFormatter.format(date)
    }

    fun toInputText(value: String?, timeZoneId: String? = DEFAULT_ZONE_ID): String {
        val instant = parseStoredInstant(value) ?: return ""
        return displayDateTimeFormatter.format(instant.atZone(zone(timeZoneId)))
    }

    fun inputToInstantText(value: String?, timeZoneId: String? = DEFAULT_ZONE_ID): String? {
        val raw = value?.trim().orEmpty()
        if (raw.isBlank()) return null
        parseInputInstant(raw)?.let { return it.toString() }
        val targetZone = zone(timeZoneId)
        for (formatter in inputFormatters) {
            val parsed = runCatching { LocalDateTime.parse(raw, formatter) }.getOrNull()
            if (parsed != null) {
                return parsed.atZone(targetZone).toInstant().toString()
            }
        }
        return null
    }

    fun isValidInput(value: String?, timeZoneId: String? = DEFAULT_ZONE_ID): Boolean {
        val raw = value?.trim().orEmpty()
        return raw.isBlank() || inputToInstantText(raw, timeZoneId) != null
    }

    private fun parseStoredInstant(value: String?): Instant? {
        val raw = value?.trim().orEmpty()
        if (raw.isBlank()) return null
        parseInputInstant(raw)?.let { return it }
        for (formatter in storedLocalDateTimeFormatters) {
            val parsed = runCatching { LocalDateTime.parse(raw, formatter) }.getOrNull()
            if (parsed != null) {
                return parsed.atOffset(ZoneOffset.UTC).toInstant()
            }
        }
        return null
    }

    private fun parseInputInstant(value: String): Instant? {
        runCatching { Instant.parse(value) }.getOrNull()?.let { return it }
        return runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
    }
}
