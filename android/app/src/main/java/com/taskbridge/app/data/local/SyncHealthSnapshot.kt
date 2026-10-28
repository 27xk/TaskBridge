package com.taskbridge.app.data.local

/** One aggregate row; no task bodies or queue payloads are loaded for health. */
data class SyncHealthSnapshot(
    val pendingCount: Int,
    val oldestCreatedAt: String?,
    val conflictCount: Int,
)
