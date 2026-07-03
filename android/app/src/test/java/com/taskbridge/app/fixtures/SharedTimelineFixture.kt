package com.taskbridge.app.fixtures

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.io.File

data class SharedTimelineFixture(
    val now: String,
    val displayTimeZone: String,
    val expectedOrder: List<String>,
    val tasks: List<SharedTimelineTask>,
)

data class SharedTimelineTask(
    val id: String,
    val status: String,
    val priority: Int,
    val dueTime: String?,
    val plannedDate: String?,
    val completedAt: String?,
    val sortOrder: Int,
    val updatedAt: String,
)

object SharedTimelineFixtures {
    fun load(): SharedTimelineFixture {
        val root = JsonParser.parseReader(fixtureFile().reader()).asJsonObject
        val timeline = root.getAsJsonObject("timeline")
        return SharedTimelineFixture(
            now = timeline.requiredString("now"),
            displayTimeZone = timeline.requiredString("displayTimeZone"),
            expectedOrder = timeline.getAsJsonArray("expectedOrder").map { it.asString },
            tasks = timeline.getAsJsonArray("tasks").map { element ->
                val task = element.asJsonObject
                SharedTimelineTask(
                    id = task.requiredString("id"),
                    status = task.stringOrNull("status") ?: "todo",
                    priority = task.intOrNull("priority") ?: 0,
                    dueTime = task.stringOrNull("due_time"),
                    plannedDate = task.stringOrNull("planned_date"),
                    completedAt = task.stringOrNull("completed_at"),
                    sortOrder = task.intOrNull("sort_order") ?: 0,
                    updatedAt = task.stringOrNull("updated_at") ?: "2026-05-01T00:00:00.000Z",
                )
            },
        )
    }

    private fun fixtureFile(): File {
        return listOf(
            File("shared/task-timeline-fixtures.json"),
            File("../shared/task-timeline-fixtures.json"),
            File("../../shared/task-timeline-fixtures.json"),
            File("../../../shared/task-timeline-fixtures.json"),
        ).firstOrNull { it.isFile }
            ?: error("shared task timeline fixture not found")
    }
}

private fun JsonObject.requiredString(name: String): String {
    return stringOrNull(name) ?: error("missing fixture field: $name")
}

private fun JsonObject.stringOrNull(name: String): String? {
    val value = get(name) ?: return null
    return if (value.isJsonNull) null else value.asString
}

private fun JsonObject.intOrNull(name: String): Int? {
    val value = get(name) ?: return null
    return if (value.isJsonNull) null else value.asInt
}
