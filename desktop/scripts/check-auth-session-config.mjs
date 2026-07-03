import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  authApiSource,
  authDepsSource,
  authServiceSource,
  authSchemaSource,
  securitySource,
  websocketSource,
  websocketTicketSource,
  authTestsSource,
  websocketTestsSource,
  apiDocsSource,
  backendReadmeSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "backend/app/api/v1/auth.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/deps.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/services/auth_service.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/schemas/auth.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/core/security.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/websocket.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/services/websocket_ticket_service.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/tests/test_auth.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/tests/test_websocket_sync.py"), "utf8"),
  readFile(resolve(repoRoot, "docs/api-design.md"), "utf8"),
  readFile(resolve(repoRoot, "backend/README.md"), "utf8"),
]);

assert.match(authApiSource, /@router\.get\("\/sessions"/, "auth API must expose session listing");
assert.match(
  authApiSource,
  /@router\.post\("\/sessions\/revoke-other-devices"/,
  "auth API must expose other-device revocation",
);
assert.match(
  authApiSource,
  /@router\.delete\("\/sessions\/\{session_id\}"/,
  "auth API must expose single-session revocation",
);
assert.match(
  authServiceSource,
  /RefreshToken\.revoked_at\.is_\(None\)/,
  "session queries must only expose or revoke active refresh tokens",
);
assert.match(
  authServiceSource,
  /RefreshToken\.expires_at > now/,
  "session governance must ignore expired refresh tokens",
);
assert.match(
  securitySource,
  /payload\["device_id"\]\s*=\s*device_id/,
  "access tokens must carry the issuing device id",
);
assert.match(
  securitySource,
  /payload\["session_id"\]\s*=\s*session_id/,
  "access tokens must carry the issuing refresh session id",
);
assert.match(
  authDepsSource,
  /def get_current_user_session/,
  "session governance endpoints must authenticate the current refresh session",
);
assert.match(
  authDepsSource,
  /RefreshToken\.id == session_id/,
  "current session auth must bind the access token to a refresh session",
);
assert.match(
  authDepsSource,
  /def get_current_user\([\s\S]*?return get_current_user_session_from_payload\(db,\s*decode_access_token\(token\)\)\.user/,
  "business API bearer auth must reject access tokens whose refresh session was revoked",
);
assert.match(
  authDepsSource,
  /def get_current_user_session\([\s\S]*?return get_current_user_session_from_payload\(db,\s*decode_access_token\(token\)\)/,
  "session-bound auth should share the same payload-based validator",
);
assert.match(
  websocketSource,
  /get_current_user_session_from_payload/,
  "websocket bearer fallback must validate the access token's active refresh session",
);
assert.match(
  websocketSource,
  /current_session\.refresh_token\.device_id != device_id/,
  "websocket bearer fallback must bind the token session to the requested device id",
);
assert.match(
  authApiSource,
  /current_session: CurrentUserSession = Depends\(get_current_user_session\)/,
  "websocket ticket issuance must be bound to the current refresh session",
);
assert.match(
  authServiceSource,
  /issue_websocket_ticket\(current_user\.id,\s*device_id,\s*session_id\)/,
  "websocket ticket issuance must include the issuing refresh session id",
);
assert.match(
  websocketTicketSource,
  /json\.dumps\([\s\S]*"session_id": session_id/,
  "websocket tickets must persist the issuing refresh session id",
);
assert.match(
  websocketSource,
  /"session_id": session_id/,
  "websocket ticket consumption must revalidate the issuing refresh session",
);
assert.match(
  authSchemaSource,
  /class RefreshSessionRead\(BaseModel\):/,
  "auth schema must define a safe session response",
);
assert.ok(
  !/class RefreshSessionRead[\s\S]*token_hash/.test(authSchemaSource),
  "session responses must not expose refresh token hashes",
);
assert.match(
  authTestsSource,
  /test_current_user_can_list_active_refresh_sessions/,
  "auth tests must cover session listing",
);
assert.match(
  authTestsSource,
  /test_current_user_can_revoke_other_device_refresh_sessions/,
  "auth tests must cover other-device session revocation",
);
assert.match(
  authTestsSource,
  /test_revoke_other_device_sessions_rejects_access_token_device_spoofing/,
  "auth tests must cover access-token device spoofing",
);
assert.match(
  authTestsSource,
  /test_revoked_current_session_cannot_keep_using_access_token_for_session_governance/,
  "auth tests must cover revoked current-session access tokens",
);
assert.match(
  authTestsSource,
  /test_deleted_device_access_token_cannot_reach_business_endpoints/,
  "auth tests must cover deleted-device access-token revocation for business APIs",
);
assert.match(
  authTestsSource,
  /test_revoked_current_session_cannot_keep_using_access_token_for_business_apis/,
  "auth tests must cover revoked current-session access tokens for business APIs",
);
assert.match(
  websocketTestsSource,
  /test_sync_websocket_ticket_requires_active_issuing_session/,
  "websocket tests must cover ticket rejection after issuing-session revocation",
);

for (const source of [apiDocsSource, backendReadmeSource]) {
  assert.ok(
    source.includes("GET  /api/v1/auth/sessions"),
    "docs must include session listing endpoint",
  );
  assert.ok(
    source.includes("POST /api/v1/auth/sessions/revoke-other-devices"),
    "docs must include other-device revocation endpoint",
  );
  assert.ok(
    source.includes("DELETE /api/v1/auth/sessions/{session_id}"),
    "docs must include single-session revocation endpoint",
  );
}

console.log("auth session governance check passed");
