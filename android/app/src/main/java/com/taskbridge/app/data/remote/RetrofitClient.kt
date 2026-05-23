package com.taskbridge.app.data.remote

import android.content.Context
import com.google.gson.GsonBuilder
import com.taskbridge.app.BuildConfig
import com.taskbridge.app.data.datastore.TokenDataStore
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
import java.util.concurrent.TimeUnit

object RetrofitClient {
    fun create(
        context: Context,
        tokenDataStore: TokenDataStore,
        baseUrl: String = BuildConfig.TASKBRIDGE_BASE_URL,
    ): ApiService {
        val gson = GsonBuilder().create()
        val refreshApi = Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .client(baseHttpClient())
            .build()
            .create(TokenRefreshApi::class.java)

        val client = baseHttpClient()
            .newBuilder()
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
            .baseUrl(baseUrl)
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

private class AuthInterceptor(
    private val tokenDataStore: TokenDataStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenDataStore.accessToken.first() }
        val request = if (token.isNullOrBlank()) {
            chain.request()
        } else {
            chain.request().newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }
        return chain.proceed(request)
    }
}

private class RefreshTokenAuthenticator(
    private val tokenDataStore: TokenDataStore,
    private val refreshApi: TokenRefreshApi,
    private val deviceIdProvider: DeviceIdProvider,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        val refreshToken = runBlocking { tokenDataStore.refreshToken.first() } ?: return null

        val tokenPair = try {
            refreshApi
                .refresh(RefreshTokenRequestDto(refreshToken, deviceIdProvider.getDeviceId()))
                .execute()
                .body()
                ?.data
        } catch (_: Exception) {
            null
        } ?: return null

        runBlocking {
            tokenDataStore.saveTokens(tokenPair.accessToken, tokenPair.refreshToken)
        }

        return response.request().newBuilder()
            .header("Authorization", "Bearer ${tokenPair.accessToken}")
            .build()
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
