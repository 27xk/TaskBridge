package com.taskbridge.app.data.repository

import com.taskbridge.app.data.local.TaskEntity
import com.taskbridge.app.domain.model.SyncStatus

/** A pull must never replace a local mutation that still needs resolution. */
fun shouldPreserveLocalTaskOnPull(task: TaskEntity): Boolean {
    return when (SyncStatus.fromWire(task.syncStatus)) {
        SyncStatus.PendingCreate,
        SyncStatus.PendingUpdate,
        SyncStatus.PendingDelete,
        SyncStatus.Failed,
        SyncStatus.Conflict,
        -> true
        SyncStatus.Synced -> false
    }
}

fun mergeCreatedOccurrence(remote: TaskEntity, existing: TaskEntity?): TaskEntity {
    if (existing != null && (shouldPreserveLocalTaskOnPull(existing) || existing.version > remote.version)) return existing
    return remote.copy(localId = existing?.localId ?: remote.localId)
}
