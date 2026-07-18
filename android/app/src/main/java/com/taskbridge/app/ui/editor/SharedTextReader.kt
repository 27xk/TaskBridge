package com.taskbridge.app.ui.editor

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

const val MAX_SHARED_TEXT_BYTES = 1_048_576
const val MAX_SHARED_BACKUP_BYTES = 20_000_000

class SharedTextTooLargeException : IOException("shared payload is too large")

fun sharedPayloadReadLimit(mimeType: String): Int {
    return if (mimeType.equals("application/json", ignoreCase = true)) {
        MAX_SHARED_BACKUP_BYTES
    } else {
        MAX_SHARED_TEXT_BYTES
    }
}

fun requireSharedPayloadWithinLimit(value: String, isTaskBridgeBackup: Boolean): String {
    val maxBytes = if (isTaskBridgeBackup) MAX_SHARED_BACKUP_BYTES else MAX_SHARED_TEXT_BYTES
    if (value.toByteArray(Charsets.UTF_8).size > maxBytes) throw SharedTextTooLargeException()
    return value
}

fun readUtf8TextWithLimit(input: InputStream, maxBytes: Int): String {
    require(maxBytes > 0) { "maxBytes must be positive" }
    val output = ByteArrayOutputStream(minOf(maxBytes, DEFAULT_BUFFER_SIZE))
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var totalBytes = 0
    while (true) {
        val read = input.read(buffer, 0, minOf(buffer.size, maxBytes - totalBytes + 1))
        if (read == -1) break
        totalBytes += read
        if (totalBytes > maxBytes) throw SharedTextTooLargeException()
        output.write(buffer, 0, read)
    }
    return output.toString(Charsets.UTF_8.name())
}
