package com.taskbridge.app.data

import com.google.gson.annotations.SerializedName
import com.taskbridge.app.data.remote.ApiService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

class AndroidApiContractTest {
    @Test
    fun passwordChangeUsesTheSharedAuthContract() {
        val method = apiMethod("changePassword") ?: return

        assertEquals("auth/password", method.getAnnotation(PUT::class.java)?.value)
        assertDtoField("PasswordChangeRequestDto", "currentPassword", "current_password")
        assertDtoField("PasswordChangeRequestDto", "newPassword", "new_password")
        assertDtoField("RevokeSessionsResponseDto", "revoked", null)
    }

    @Test
    fun sessionListAndRevokeOthersUseTheSharedAuthContract() {
        val listMethod = apiMethod("getSessions") ?: return
        val revokeMethod = apiMethod("revokeOtherSessions") ?: return

        assertEquals("auth/sessions", listMethod.getAnnotation(GET::class.java)?.value)
        assertEquals(
            "auth/sessions/revoke-other-devices",
            revokeMethod.getAnnotation(POST::class.java)?.value,
        )
        assertDtoField("AuthSessionDto", "id", null)
        assertDtoField("AuthSessionDto", "deviceId", "device_id")
        assertDtoField("AuthSessionDto", "createdAt", "created_at")
        assertDtoField("AuthSessionDto", "expiresAt", "expires_at")
        assertDtoField("AuthSessionDto", "revokedAt", "revoked_at")
        assertDtoField("RevokeOtherSessionsRequestDto", "deviceId", "device_id")
    }

    @Test
    fun taskListAndMetadataRequireATimezoneQuery() {
        val tasks = apiMethod("getTasks") ?: return
        val metadata = apiMethod("getTaskMeta") ?: return

        assertTrue(queryNames(tasks).contains("timezone"))
        assertEquals("tasks/meta", metadata.getAnnotation(GET::class.java)?.value)
        assertTrue(queryNames(metadata).contains("timezone"))
    }

    @Test
    fun effectiveDisplayTimezoneKeepsIanaNamesAndRejectsInvalidValues() {
        val owner = Class.forName("com.taskbridge.app.data.datastore.TokenDataStoreKt")
        val method = owner.methods.firstOrNull { it.name == "effectiveDisplayTimeZone" }
        assertNotNull("effectiveDisplayTimeZone is missing", method)
        method ?: return

        assertEquals("America/New_York", method.invoke(null, "America/New_York"))
        assertEquals("Asia/Shanghai", method.invoke(null, "not-a-timezone"))
    }

    private fun apiMethod(name: String): java.lang.reflect.Method? {
        val method = ApiService::class.java.methods.firstOrNull { it.name == name }
        assertNotNull("ApiService.$name is missing", method)
        return method
    }

    private fun queryNames(method: java.lang.reflect.Method): Set<String> {
        return method.parameterAnnotations
            .flatMap { annotations -> annotations.filterIsInstance<Query>() }
            .map(Query::value)
            .toSet()
    }

    private fun assertDtoField(simpleName: String, fieldName: String, wireName: String?) {
        val type = runCatching {
            Class.forName("com.taskbridge.app.data.remote.dto.$simpleName")
        }.getOrNull()
        assertNotNull("$simpleName is missing", type)
        type ?: return
        val field = runCatching { type.getDeclaredField(fieldName) }.getOrNull()
        assertNotNull("$simpleName.$fieldName is missing", field)
        field ?: return
        if (wireName != null) {
            assertEquals(wireName, field.getAnnotation(SerializedName::class.java)?.value)
        }
    }
}
