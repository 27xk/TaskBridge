package com.taskbridge.app.data.datastore

import java.net.URI
import java.io.IOException
import java.security.MessageDigest

class WorkspaceChangedException : IOException("active workspace changed")

class WorkspaceIdentity private constructor(
    val serverOrigin: String,
    val userId: String,
) {
    val id: String = "$serverOrigin|$userId"
    val preferenceSuffix: String = id.sha256()

    companion object {
        fun create(serverUrl: String, userId: String): WorkspaceIdentity {
            val normalizedUserId = userId.trim().takeIf { it.isNotBlank() }
                ?: throw IllegalArgumentException("user id required")
            return WorkspaceIdentity(
                serverOrigin = normalizeServerOrigin(serverUrl),
                userId = normalizedUserId,
            )
        }
    }

    override fun equals(other: Any?): Boolean {
        return other is WorkspaceIdentity && other.serverOrigin == serverOrigin && other.userId == userId
    }

    override fun hashCode(): Int = 31 * serverOrigin.hashCode() + userId.hashCode()

    override fun toString(): String = "WorkspaceIdentity(serverOrigin=$serverOrigin, userId=$userId)"
}

fun normalizeServerOrigin(serverUrl: String): String {
    val raw = serverUrl.trim().takeIf { it.isNotBlank() }
        ?: throw IllegalArgumentException("server url required")
    val candidate = if (raw.contains("://")) raw else "http://$raw"
    val uri = runCatching { URI(candidate) }
        .getOrElse { throw IllegalArgumentException("invalid server url", it) }
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") {
        throw IllegalArgumentException("invalid server url")
    }
    val host = uri.host?.lowercase() ?: throw IllegalArgumentException("invalid server url")
    val normalizedPort = when {
        scheme == "http" && uri.port == 80 -> -1
        scheme == "https" && uri.port == 443 -> -1
        else -> uri.port
    }
    return URI(scheme, null, host, normalizedPort, null, null, null).toASCIIString()
}

fun legacyWorkspaceId(ownerUserId: String): String {
    val normalizedOwner = ownerUserId.trim().ifBlank { "legacy" }
    return "legacy:$normalizedOwner"
}

fun canClaimLegacyWorkspace(
    claimedWorkspaceId: String?,
    workspace: WorkspaceIdentity,
): Boolean = claimedWorkspaceId?.trim()?.takeIf { it.isNotBlank() } == workspace.id

fun shouldResetSessionForServerChange(currentServerUrl: String, nextServerUrl: String): Boolean {
    return normalizeServerOrigin(currentServerUrl) != normalizeServerOrigin(nextServerUrl)
}

fun requireMatchingWorkspace(expectedWorkspaceId: String, currentWorkspace: WorkspaceIdentity?) {
    if (currentWorkspace?.id != expectedWorkspaceId) throw WorkspaceChangedException()
}

fun canApplyTokenRefresh(
    expectedWorkspaceId: String,
    refreshTokenUsed: String,
    currentWorkspace: WorkspaceIdentity?,
    currentRefreshToken: String?,
): Boolean = currentWorkspace?.id == expectedWorkspaceId && currentRefreshToken == refreshTokenUsed

private fun String.sha256(): String {
    return MessageDigest.getInstance("SHA-256")
        .digest(toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
}
