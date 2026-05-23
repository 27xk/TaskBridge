package com.taskbridge.app.data

import com.google.gson.Gson
import com.taskbridge.app.data.remote.dto.ApiEnvelope
import com.taskbridge.app.data.remote.dto.SyncPullResponseDto
import com.google.gson.reflect.TypeToken
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncDtosTest {
    @Test
    fun syncPullResponseReadsPaginationCursor() {
        val type = object : TypeToken<ApiEnvelope<SyncPullResponseDto>>() {}.type
        val envelope = Gson().fromJson<ApiEnvelope<SyncPullResponseDto>>(
            """
            {
              "code": 200,
              "message": "ok",
              "data": {
                "changed_tasks": [],
                "deleted_tasks": [],
                "server_time": "2026-05-17T12:02:00Z",
                "has_more": true,
                "next_cursor_updated_at": "2026-05-17T12:01:00Z",
                "next_cursor_id": 42
              }
            }
            """.trimIndent(),
            type,
        )

        val data = envelope.data
        assertEquals("2026-05-17T12:02:00Z", data?.serverTime)
        assertTrue(data?.hasMore == true)
        assertEquals("2026-05-17T12:01:00Z", data?.nextCursorUpdatedAt)
        assertEquals(42, data?.nextCursorId)
    }

    @Test
    fun syncPullResponseDefaultsPaginationForOlderResponses() {
        val type = object : TypeToken<ApiEnvelope<SyncPullResponseDto>>() {}.type
        val envelope = Gson().fromJson<ApiEnvelope<SyncPullResponseDto>>(
            """
            {
              "code": 200,
              "message": "ok",
              "data": {
                "changed_tasks": [],
                "deleted_tasks": [],
                "server_time": "2026-05-17T12:02:00Z"
              }
            }
            """.trimIndent(),
            type,
        )

        val data = envelope.data
        assertFalse(data?.hasMore == true)
        assertEquals(null, data?.nextCursorUpdatedAt)
        assertEquals(null, data?.nextCursorId)
    }
}
