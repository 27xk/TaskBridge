package com.taskbridge.app.data.remote

import android.content.Context
import com.google.gson.GsonBuilder
import com.taskbridge.app.BuildConfig
import com.taskbridge.app.data.datastore.TokenDataStore
import com.taskbridge.app.data.datastore.canApplyTokenRefresh
import com.taskbridge.app.data.datastore.requireMatchingWorkspace
import com.taskbridge.app.data.remote.dto.RefreshTokenRequestDto
import com.taskbridge.app.sync.DeviceIdProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.URI
import java.util.concurrent.TimeUnit

const val INTERNAL_WORKSPACE_HEADER = "X-TaskBridge-Expected-Workspace"

object RetrofitClient {
    fun create(
        context: Context,
        tokenDataStore: TokenDataStore,
        baseUrl: String = BuildConfig.TASKBRIDGE_BASE_URL,
    ): ApiService {
        val retrofitBaseUrl = normalizeHttpBaseUrl(baseUrl)
        val gson = GsonBuilder().create()
        val endpointInterceptor = EndpointInterceptor(tokenDataStore, retrofitBaseUrl)
        val refreshClient = baseHttpClient()
            .newBuilder()
            .addInterceptor(endpointInterceptor)
            .addInterceptor(StripInternalWorkspaceHeaderInterceptor())
            .build()
        val refreshApi = Retrofit.Builder()
            .baseUrl(retrofitBaseUrl)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .client(refreshClient)
            .build()
            .create(TokenRefreshApi::class.java)

        val client = baseHttpClient()
            .newBuilder()
            .addInterceptor(endpointInterceptor)
            .addInterceptor(AuthInterceptor(tokenDataStore))
            .authenticator(
                RefreshTokenAuthenticator(
                    tokenDataStore,
                    refreshApi,
                    DeviceIdProvider(context.applicationContext),
                ),
            )
            .build()

        return Retrofit.Builder()
            .baseUrl(retrofitBaseUrl)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .client(client)
            .build()
            .create(ApiService::class.java)
    }

    private fun baseHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}

private class EndpointInterceptor(
    private val tokenDataStore: TokenDataStore,
    defaultBaseUrl: String,
) : Interceptor {
    private val defaultBase = endpointUri(defaultBaseUrl)
        ?: endpointUri(BuildConfig.TASKBRIDGE_BASE_URL)
        ?: error("Invalid TASKBRIDGE_BASE_URL")

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val requestContext = runBlocking { tokenDataStore.requestAuthContext() }
        original.header(INTERNAL_WORKSPACE_HEADER)?.let { expectedWorkspaceId ->
            requireMatchingWorkspace(
                expectedWorkspaceId,
                requestContext.workspace,
            )
        }
        val targetBase = endpointUri(requestContext.apiBaseUrl) ?: defaultBase
        val rewrittenUrl = rewriteUrl(original.url().toString(), targetBase)
        return chain.proceed(original.newBuilder().url(rewrittenUrl).build())
    }

    private fun rewriteUrl(originalUrl: String, targetBase: URI): String {
        val original = URI(originalUrl)
        val defaultPath = defaultBase.rawPath.trimEnd('/')
        val relativePath = original.rawPath
            .removePrefix(defaultPath)
            .trimStart('/')
        val targetPath = targetBase.rawPath.trimEnd('/')
        val nextPath = listOf(targetPath, relativePath)
            .map { it.trim('/') }
            .filter { it.isNotBlank() }
            .joinToString("/", prefix = "/")
        return URI(
            targetBase.scheme,
            targetBase.userInfo,
            targetBase.host,
            targetBase.port,
            nextPath,
            original.rawQuery,
            null,
        ).toASCIIString()
    }
}

private fun normalizeHttpBaseUrl(value: String): String {
    return value.trim().trimEnd('/') + "/"
}

private fun endpointUri(value: String): URI? {
    return runCatching {
        val uri = URI(normalizeHttpBaseUrl(value))
        if ((uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank()) uri else null
    }.getOrNull()
}

private class AuthInterceptor(
    private val tokenDataStore: TokenDataStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val requestContext = runBlocking { tokenDataStore.requestAuthContext() }
        original.header(INTERNAL_WORKSPACE_HEADER)?.let { expectedWorkspaceId ->
            requireMatchingWorkspace(
                expectedWorkspaceId,
                requestContext.workspace,
            )
        }
        val token = requestContext.accessToken
        val request = if (token.isNullOrBlank()) {
            original.newBuilder()
                .removeHeader(INTERNAL_WORKSPACE_HEADER)
                .build()
        } else {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .removeHeader(INTERNAL_WORKSPACE_HEADER)
                .build()
        }
        return chain.proceed(request)
    }
}

private class StripInternalWorkspaceHeaderInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        return chain.proceed(
            chain.request().newBuilder()
                .removeHeader(INTERNAL_WORKSPACE_HEADER)
                .build(),
        )
    }
}

private class RefreshTokenAuthenticator(
    private val tokenDataStore: TokenDataStore,
    private val refreshApi: TokenRefreshApi,
    private val deviceIdProvider: DeviceIdProvider,
) : Authenticator {
    private val refreshLock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null

        return synchronized(refreshLock) {
            val requestAccessToken = response.request().header("Authorization")
                ?.removePrefix("Bearer ")
                ?.takeIf { it.isNotBlank() }
            val currentAccessToken = runBlocking { tokenDataStore.accessToken.first() }
            if (!currentAccessToken.isNullOrBlank() && currentAccessToken != requestAccessToken) {
                return@synchronized response.request().newBuilder()
                    .header("Authorization", "Bearer $currentAccessToken")
                    .build()
            }

            val workspace = runBlocking { tokenDataStore.currentWorkspace.first() }
                ?: return@synchronized null
            val refreshToken = runBlocking { tokenDataStore.refreshToken.first() }
                ?: return@synchronized null

            val refreshResponse = try {
                refreshApi
                    .refresh(
                        RefreshTokenRequestDto(refreshToken, deviceIdProvider.getDeviceId()),
                        workspace.id,
                    )
                    .execute()
            } catch (_: Exception) {
                null
            } ?: return@synchronized null

            if (!refreshResponse.isSuccessful) {
                if (refreshResponse.code() == 401 || refreshResponse.code() == 403) {
                    val rejectedWorkspace = runBlocking { tokenDataStore.currentWorkspace.first() }
                    val rejectedRefreshToken = runBlocking { tokenDataStore.refreshToken.first() }
                    if (
                        canApplyTokenRefresh(
                            workspace.id,
                            refreshToken,
                            rejectedWorkspace,
                            rejectedRefreshToken,
                        )
                    ) {
                        runBlocking { tokenDataStore.expireSession() }
                    }
                }
                return@synchronized null
            }
            val tokenPair = refreshResponse.body()?.data ?: return@synchronized null

            val currentWorkspace = runBlocking { tokenDataStore.currentWorkspace.first() }
            val currentRefreshToken = runBlocking { tokenDataStore.refreshToken.first() }
            if (!canApplyTokenRefresh(workspace.id, refreshToken, currentWorkspace, currentRefreshToken)) {
                val replacementAccessToken = runBlocking { tokenDataStore.accessToken.first() }
                return@synchronized replacementAccessToken
                    ?.takeIf { currentWorkspace?.id == workspace.id && it.isNotBlank() }
                    ?.let { token ->
                        response.request().newBuilder()
                            .header("Authorization", "Bearer $token")
                            .build()
                    }
            }

            runBlocking {
                tokenDataStore.saveTokens(
                    tokenPair.accessToken,
                    tokenPair.refreshToken,
                    workspace.userId.toIntOrNull(),
                )
            }

            response.request().newBuilder()
                .header("Authorization", "Bearer ${tokenPair.accessToken}")
                .build()
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var priorResponse = response.priorResponse()
        while (priorResponse != null) {
            count++
            priorResponse = priorResponse.priorResponse()
        }
        return count
    }
}
