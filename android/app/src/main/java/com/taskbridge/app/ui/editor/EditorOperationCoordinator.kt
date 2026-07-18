package com.taskbridge.app.ui.editor

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class EditorOperationCoordinator {
    private val revision = AtomicLong(0)
    private val saving = AtomicBoolean(false)

    fun captureRevision(): Long = revision.get()

    fun markDraftChanged() {
        revision.incrementAndGet()
    }

    fun canApplyLoadedTask(revisionAtLoadStart: Long): Boolean {
        return revision.get() == revisionAtLoadStart
    }

    fun tryBeginSave(): Boolean = saving.compareAndSet(false, true)

    fun finishSave() {
        saving.set(false)
    }
}
