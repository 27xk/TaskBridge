package com.taskbridge.app.data.datastore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegacySyncCursorPolicyTest {
    @Test
    fun unownedLegacyCursorIsNotClaimedByTheFirstWorkspace() {
        val resolution = resolveWorkspaceSyncCursor(
            scopedCursor = null,
            legacyCursor = "2026-07-15T00:00:00Z",
            legacyClaimedWorkspaceId = null,
            activeWorkspaceId = "https://one.example|7",
        )

        assertNull(resolution.cursor)
        check(!resolution.shouldClaimLegacyCursor)
    }

    @Test
    fun persistedOwnerCanRestoreTheLegacyCursor() {
        val workspaceId = "https://one.example|7"
        val resolution = resolveWorkspaceSyncCursor(
            scopedCursor = null,
            legacyCursor = "2026-07-15T00:00:00Z",
            legacyClaimedWorkspaceId = workspaceId,
            activeWorkspaceId = workspaceId,
        )

        assertEquals("2026-07-15T00:00:00Z", resolution.cursor)
        check(resolution.shouldClaimLegacyCursor)
    }

    @Test
    fun anotherUserOnTheSameOriginNeverInheritsTheClaimedCursor() {
        val resolution = resolveWorkspaceSyncCursor(
            scopedCursor = null,
            legacyCursor = "2026-07-15T00:00:00Z",
            legacyClaimedWorkspaceId = "https://one.example|7",
            activeWorkspaceId = "https://one.example|8",
        )

        assertNull(resolution.cursor)
        check(!resolution.shouldClaimLegacyCursor)
    }

    @Test
    fun workspaceCursorWinsWithoutClaimingAnUnownedLegacyCursor() {
        val resolution = resolveWorkspaceSyncCursor(
            scopedCursor = "2026-07-16T00:00:00Z",
            legacyCursor = "2026-07-15T00:00:00Z",
            legacyClaimedWorkspaceId = null,
            activeWorkspaceId = "https://one.example|8",
        )

        assertEquals("2026-07-16T00:00:00Z", resolution.cursor)
        check(!resolution.shouldClaimLegacyCursor)
    }
}
