package com.taskbridge.app.data.datastore

data class WorkspaceSyncCursorResolution(
    val cursor: String?,
    val shouldClaimLegacyCursor: Boolean,
)

fun resolveWorkspaceSyncCursor(
    scopedCursor: String?,
    legacyCursor: String?,
    legacyClaimedWorkspaceId: String?,
    activeWorkspaceId: String,
): WorkspaceSyncCursorResolution {
    val canClaimLegacy = legacyCursor != null && legacyClaimedWorkspaceId == activeWorkspaceId
    val cursor = scopedCursor ?: legacyCursor?.takeIf {
        legacyClaimedWorkspaceId == activeWorkspaceId
    }
    return WorkspaceSyncCursorResolution(
        cursor = cursor,
        shouldClaimLegacyCursor = canClaimLegacy,
    )
}
