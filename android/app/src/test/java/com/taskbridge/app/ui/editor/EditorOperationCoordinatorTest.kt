package com.taskbridge.app.ui.editor

import org.junit.Test

class EditorOperationCoordinatorTest {
    @Test
    fun asyncLoadCannotApplyAfterTheUserChangesTheDraft() {
        val coordinator = EditorOperationCoordinator()
        val revisionAtLoadStart = coordinator.captureRevision()

        coordinator.markDraftChanged()

        check(!coordinator.canApplyLoadedTask(revisionAtLoadStart))
    }

    @Test
    fun asyncLoadCanApplyWhenTheDraftHasNotChanged() {
        val coordinator = EditorOperationCoordinator()

        check(coordinator.canApplyLoadedTask(coordinator.captureRevision()))
    }

    @Test
    fun saveGateAllowsOnlyOneSubmissionUntilReleased() {
        val coordinator = EditorOperationCoordinator()

        check(coordinator.tryBeginSave())
        check(!coordinator.tryBeginSave())

        coordinator.finishSave()
        check(coordinator.tryBeginSave())
    }
}
