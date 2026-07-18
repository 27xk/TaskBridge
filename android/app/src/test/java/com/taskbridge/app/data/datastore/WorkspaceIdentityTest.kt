package com.taskbridge.app.data.datastore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class WorkspaceIdentityTest {
    @Test
    fun serverOriginNormalizesCaseDefaultPortsAndPaths() {
        assertEquals(
            "https://example.com",
            normalizeServerOrigin(" HTTPS://Example.COM:443/api/v1/ "),
        )
        assertEquals(
            "http://example.com",
            normalizeServerOrigin("example.com:80/custom/path"),
        )
        assertEquals(
            "https://example.com:8443",
            normalizeServerOrigin("https://EXAMPLE.com:8443/taskbridge"),
        )
    }

    @Test
    fun workspaceIdentitySeparatesServersAndUsers() {
        val firstServer = WorkspaceIdentity.create("https://one.example/api/v1/", "7")
        val secondServer = WorkspaceIdentity.create("https://two.example/api/v1/", "7")
        val secondUser = WorkspaceIdentity.create("https://one.example/api/v1/", "8")

        assertNotEquals(firstServer.id, secondServer.id)
        assertNotEquals(firstServer.id, secondUser.id)
        assertEquals(firstServer, WorkspaceIdentity.create("HTTPS://ONE.EXAMPLE:443/elsewhere", " 7 "))
    }

    @Test
    fun legacyRowsAreScopedByTheirPreviousOwner() {
        assertEquals("legacy:7", legacyWorkspaceId(" 7 "))
        assertNotEquals(legacyWorkspaceId("7"), legacyWorkspaceId("8"))
    }

    @Test
    fun legacyRowsRequireAPersistedMatchingWorkspaceOwner() {
        val workspace = WorkspaceIdentity.create("https://one.example", "7")
        val otherServer = WorkspaceIdentity.create("https://two.example", "7")

        check(!canClaimLegacyWorkspace(null, workspace))
        check(canClaimLegacyWorkspace(workspace.id, workspace))
        check(!canClaimLegacyWorkspace(workspace.id, otherServer))
    }

    @Test
    fun workspacePreferenceSuffixIsStableAndSafeForPreferenceKeys() {
        val workspace = WorkspaceIdentity.create("https://example.com", "42")

        assertEquals(workspace.preferenceSuffix, workspace.preferenceSuffix)
        assertEquals(64, workspace.preferenceSuffix.length)
        check(workspace.preferenceSuffix.all { it.isDigit() || it in 'a'..'f' })
    }

    @Test
    fun changingOriginEndsTheActiveSessionButChangingPathDoesNot() {
        check(
            shouldResetSessionForServerChange(
                currentServerUrl = "https://one.example/taskbridge",
                nextServerUrl = "https://two.example/taskbridge",
            ),
        )
        check(
            !shouldResetSessionForServerChange(
                currentServerUrl = "https://one.example/old-path",
                nextServerUrl = "HTTPS://ONE.EXAMPLE:443/new-path",
            ),
        )
    }

    @Test
    fun requestWorkspaceGuardRejectsARequestAfterAccountSwitch() {
        val expected = WorkspaceIdentity.create("https://one.example", "7")
        val current = WorkspaceIdentity.create("https://one.example", "8")

        val error = runCatching { requireMatchingWorkspace(expected.id, current) }.exceptionOrNull()

        check(error is WorkspaceChangedException)
        requireMatchingWorkspace(expected.id, expected)
    }

    @Test
    fun refreshResultRequiresTheSameWorkspaceAndRefreshToken() {
        val expected = WorkspaceIdentity.create("https://one.example", "7")

        check(canApplyTokenRefresh(expected.id, "refresh-old", expected, "refresh-old"))
        check(
            !canApplyTokenRefresh(
                expected.id,
                "refresh-old",
                WorkspaceIdentity.create("https://two.example", "7"),
                "refresh-old",
            ),
        )
        check(!canApplyTokenRefresh(expected.id, "refresh-old", expected, "refresh-new"))
    }
}
