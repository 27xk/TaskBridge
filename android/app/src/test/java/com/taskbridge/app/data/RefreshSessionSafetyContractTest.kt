package com.taskbridge.app.data

import com.taskbridge.app.testing.androidSource
import org.junit.Assert.assertTrue
import org.junit.Test

class RefreshSessionSafetyContractTest {
    @Test
    fun refreshRequestAndResultStayBoundToTheCapturedWorkspace() {
        val api = androidSource("src/main/java/com/taskbridge/app/data/remote/ApiService.kt")
        val retrofit = androidSource("src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt")

        assertTrue(api.contains("@Header(INTERNAL_WORKSPACE_HEADER) expectedWorkspaceId: String"))
        assertTrue(retrofit.contains("RefreshTokenRequestDto(refreshToken, deviceIdProvider.getDeviceId())"))
        assertTrue(retrofit.contains("workspace.id"))
        assertTrue(retrofit.contains("canApplyTokenRefresh("))
        assertTrue(retrofit.contains("currentRefreshToken"))
    }

    @Test
    fun internalWorkspaceHeaderIsNeverSentToTheServer() {
        val retrofit = androidSource("src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt")

        assertTrue(retrofit.contains("StripInternalWorkspaceHeaderInterceptor"))
        assertTrue(retrofit.contains("removeHeader(INTERNAL_WORKSPACE_HEADER)"))
    }

    @Test
    fun terminalRefreshRejectionClearsOnlyTheStillCurrentSession() {
        val tokenStore = androidSource("src/main/java/com/taskbridge/app/data/datastore/TokenDataStore.kt")
        val retrofit = androidSource("src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt")

        assertTrue(retrofit.contains("refreshResponse.code() == 401 || refreshResponse.code() == 403"))
        assertTrue(retrofit.contains("canApplyTokenRefresh("))
        assertTrue(retrofit.contains("tokenDataStore.expireSession()"))
        val expireSession = tokenStore.substringAfter("suspend fun expireSession()")
            .substringBefore("suspend fun clear()")
        assertTrue(expireSession.contains("ACCESS_TOKEN"))
        assertTrue(expireSession.contains("REFRESH_TOKEN"))
        assertTrue(!expireSession.contains("CURRENT_USER_ID"))
    }

    @Test
    fun endpointWorkspaceAndTokenComeFromOnePreferenceSnapshot() {
        val tokenStore = androidSource("src/main/java/com/taskbridge/app/data/datastore/TokenDataStore.kt")
        val retrofit = androidSource("src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt")

        assertTrue(tokenStore.contains("suspend fun requestAuthContext(): RequestAuthContext"))
        assertTrue(retrofit.windowed("tokenDataStore.requestAuthContext()".length).count {
            it == "tokenDataStore.requestAuthContext()"
        } >= 2)
    }

    @Test
    fun cachedWorkspaceCanOpenWithoutStartingAuthenticatedNetworkServices() {
        val activity = androidSource("src/main/java/com/taskbridge/app/MainActivity.kt")
        val login = androidSource("src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt")
        val tasks = androidSource("src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt")
        val sync = androidSource("src/main/java/com/taskbridge/app/sync/SyncManager.kt")
        val worker = androidSource("src/main/java/com/taskbridge/app/sync/SyncWorker.kt")

        assertTrue(activity.contains("data class Ready(val token: String?, val workspace: WorkspaceIdentity?)"))
        assertTrue(activity.contains("continueWithCachedWorkspace"))
        assertTrue(login.contains("onContinueOffline"))
        assertTrue(tasks.contains("localWorkspaceMode"))
        assertTrue(tasks.contains("onSignInToSync"))
        assertTrue(sync.contains("tokenDataStore.requestAuthContext()"))
        assertTrue(sync.contains("authContext.accessToken.isNullOrBlank()"))
        assertTrue(sync.contains("SyncRunState.Offline"))
        assertTrue(worker.contains("tokenDataStore.requestAuthContext()"))
        assertTrue(worker.contains("authContext.accessToken.isNullOrBlank()"))
    }
}
