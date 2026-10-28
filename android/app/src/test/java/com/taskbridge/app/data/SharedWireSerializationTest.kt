package com.taskbridge.app.data

import com.google.gson.GsonBuilder
import com.google.gson.JsonParser
import com.taskbridge.app.data.remote.dto.TaskDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SharedWireSerializationTest {
    @Test
    fun sharedTaskPreservesNullFalseDatesAndUnicode() {
        val fixture = listOf("shared", "../shared", "../../shared", "../../../shared")
            .map { File(it, "http-wire-fixtures.json") }.first { it.isFile }
        val expected = JsonParser.parseReader(fixture.reader()).asJsonObject.getAsJsonObject("task")
        val gson = GsonBuilder().serializeNulls().create()
        val task = gson.fromJson(expected, TaskDto::class.java)
        assertEquals(expected["title"].asString, task.title)
        assertEquals("契约与 Unicode 📝", task.title)
        assertEquals(null, task.content)
        assertFalse(task.checklist!!.first().done)
        assertEquals(expected["updated_at"].asString, task.updatedAt)
        val serialized = gson.toJsonTree(task).asJsonObject
        assertTrue(serialized["content"].isJsonNull)
        assertEquals(expected["planned_date"], serialized["planned_date"])
        assertEquals(expected["checklist"], serialized["checklist"])
        assertEquals(expected["priority"], serialized["priority"])
    }
}
