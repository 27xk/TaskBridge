package com.taskbridge.app.data.datastore

import androidx.datastore.preferences.core.mutablePreferencesOf
import androidx.datastore.preferences.core.stringPreferencesKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ManagedConnectionTest {
    private val bundledApi = "https://configured.test/api/v1/"
    private fun preferences(api: String, server: String = api.removeSuffix("/api/v1/")) = mutablePreferencesOf(
        stringPreferencesKey("current_user_id") to "7",
        stringPreferencesKey("api_base_url") to api,
        stringPreferencesKey("server_base_url") to server,
    )

    @Test
    fun releaseRejectsAnotherServersSessionButRetainsItsMigrationOwner() {
        val stored = preferences("https://previous.test/api/v1/")
        assertNull(workspaceFromPreferences(stored, connectionLocked = true, bundledApiBaseUrl = bundledApi))
        assertEquals("https://previous.test|7", storedWorkspaceFromPreferences(stored)?.id)
    }

    @Test
    fun releaseRestoresTheConfiguredWorkspaceAndRejectsMalformedSavedEndpoints() {
        val matching = preferences(bundledApi)
        assertEquals("https://configured.test|7", workspaceFromPreferences(matching, true, bundledApi)?.id)
        assertEquals("https://configured.test|7", storedWorkspaceFromPreferences(matching)?.id)
        assertNull(workspaceFromPreferences(preferences("not a url"), true, bundledApi))
        assertNull(workspaceFromPreferences(preferences(bundledApi, "https://other.test"), true, bundledApi))
    }

    @Test
    fun malformedExplicitServerCannotAssignLegacyDataToTheBundledServer() {
        for (server in listOf("not a url", "", "   ")) {
            val stored = preferences("https://previous.test/api/v1/", server)

            assertNull(workspaceFromPreferences(stored, true, bundledApi))
            assertNull(storedWorkspaceFromPreferences(stored))
        }
    }

    @Test
    fun validLegacyApiWithoutExplicitServerRetainsItsOriginalOwner() {
        val stored = mutablePreferencesOf(
            stringPreferencesKey("current_user_id") to "7",
            stringPreferencesKey("api_base_url") to "https://previous.test/api/v1/",
        )

        assertNull(workspaceFromPreferences(stored, true, bundledApi))
        assertEquals("https://previous.test|7", storedWorkspaceFromPreferences(stored)?.id)
    }

    @Test
    fun malformedLegacyApiCannotAssignLegacyDataToTheBundledServer() {
        for (api in listOf("not a url", "", "   ", "previous.test/api/v1/")) {
            val stored = mutablePreferencesOf(
                stringPreferencesKey("current_user_id") to "7",
                stringPreferencesKey("api_base_url") to api,
            )

            assertNull(workspaceFromPreferences(stored, true, bundledApi))
            assertNull(storedWorkspaceFromPreferences(stored))
        }
    }

    @Test
    fun missingStoredEndpointsCannotAssignLegacyDataToTheBundledServer() {
        val stored = mutablePreferencesOf(stringPreferencesKey("current_user_id") to "7")

        assertNull(workspaceFromPreferences(stored, true, bundledApi))
        assertNull(storedWorkspaceFromPreferences(stored))
    }

    @Test
    fun unknownLegacyUndoOwnerCannotBeClaimedAfterSavingANewSession() {
        val undoKey = stringPreferencesKey("last_backup_import_undo_items")
        val stored = preferences(bundledApi).apply { this[undoKey] = "legacy undo" }
        val workspace = workspaceFromPreferences(stored, true, bundledApi)!!

        assertNull(legacyBackupImportUndoItemsFromPreferences(stored, workspace))
        assertEquals("legacy undo", stored[undoKey])
    }

    @Test
    fun legacyUndoIsOnlyAvailableToItsRecordedServerAndAccount() {
        val stored = preferences(bundledApi).apply {
            this[stringPreferencesKey("last_backup_import_undo_items")] = "legacy undo"
            this[stringPreferencesKey("legacy_workspace_owner_7")] = "https://previous.test|7"
        }

        assertEquals(
            "legacy undo",
            legacyBackupImportUndoItemsFromPreferences(stored, WorkspaceIdentity.create("https://previous.test", "7")),
        )
        assertNull(legacyBackupImportUndoItemsFromPreferences(stored, WorkspaceIdentity.create("https://configured.test", "7")))
        assertNull(legacyBackupImportUndoItemsFromPreferences(stored, WorkspaceIdentity.create("https://previous.test", "8")))
    }

    @Test
    fun developmentCanKeepItsSelectedTestServer() {
        val stored = preferences("http://127.0.0.1:8080/api/v1/")
        assertEquals("http://127.0.0.1:8080|7", workspaceFromPreferences(stored, false, bundledApi)?.id)
    }
}
