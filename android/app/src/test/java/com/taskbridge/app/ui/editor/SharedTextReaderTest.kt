package com.taskbridge.app.ui.editor

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Test

class SharedTextReaderTest {
    @Test
    fun readsUtf8PayloadUpToTheByteLimit() {
        val text = "TaskBridge 分享内容"

        assertEquals(
            text,
            readUtf8TextWithLimit(ByteArrayInputStream(text.toByteArray()), text.toByteArray().size),
        )
    }

    @Test
    fun rejectsPayloadBeforeBufferingBeyondTheLimit() {
        val input = ByteArrayInputStream(ByteArray(1_025) { 'a'.code.toByte() })

        val error = runCatching { readUtf8TextWithLimit(input, 1_024) }.exceptionOrNull()

        check(error is SharedTextTooLargeException)
    }

    @Test
    fun sharedJsonBackupsUseTheBackupLimitWithoutRaisingThePlainTextLimit() {
        assertEquals(MAX_SHARED_TEXT_BYTES, sharedPayloadReadLimit("text/plain"))
        assertEquals(MAX_SHARED_BACKUP_BYTES, sharedPayloadReadLimit("application/json"))

        val payload = "a".repeat(MAX_SHARED_TEXT_BYTES + 1)
        assertEquals(payload, requireSharedPayloadWithinLimit(payload, isTaskBridgeBackup = true))
        check(
            runCatching {
                requireSharedPayloadWithinLimit(payload, isTaskBridgeBackup = false)
            }.exceptionOrNull() is SharedTextTooLargeException,
        )
    }
}
