package com.taskbridge.app.data

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkspaceMigrationSafetyContractTest {
    @Test
    fun startupPersistsLegacyOwnershipBeforeAuthenticationStateIsRead() {
        val tokenStore = androidSource("src/main/java/com/taskbridge/app/data/datastore/TokenDataStore.kt")
        val mainActivity = androidSource("src/main/java/com/taskbridge/app/MainActivity.kt")
        val syncWorker = androidSource("src/main/java/com/taskbridge/app/sync/SyncWorker.kt")
        val widgetRepository = androidSource("src/main/java/com/taskbridge/app/widget/TodayTaskWidgetRepository.kt")

        assertTrue(tokenStore.contains("suspend fun initializeLegacyWorkspaceOwnership()"))
        assertTrue(tokenStore.contains("LEGACY_WORKSPACE_OWNERSHIP_INITIALIZED"))
        assertTrue(mainActivity.contains("tokenDataStore.initializeLegacyWorkspaceOwnership()"))
        assertTrue(syncWorker.contains("tokenDataStore.initializeLegacyWorkspaceOwnership()"))
        assertTrue(widgetRepository.contains("tokenDataStore.initializeLegacyWorkspaceOwnership()"))
    }

    @Test
    fun roomMigrationChecksPersistedOwnershipBeforeClaimingLegacyRows() {
        val coordinator = androidSource("src/main/java/com/taskbridge/app/data/local/WorkspaceMigrationCoordinator.kt")

        assertTrue(coordinator.contains("tokenDataStore.canClaimLegacyWorkspace("))
        assertTrue(coordinator.contains("if (!claimAllowed) return"))
    }
}
