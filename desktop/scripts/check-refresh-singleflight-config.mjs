import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [desktopHttpSource, androidRetrofitSource] = await Promise.all([
  readFile(resolve(desktopRoot, "electron/http.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt"), "utf8"),
]);

assert.match(desktopHttpSource, /const refreshFlights = new Map<string, Promise<TokenRefreshResponse>>\(\)/, "desktop HTTP client must isolate shared refresh requests by captured session");
assert.match(desktopHttpSource, /function refreshTokenOnce/, "desktop HTTP client must centralize refresh singleflight");
assert.match(desktopHttpSource, /const existing = refreshFlights\.get\(session\.key\)/, "desktop singleflight must reuse only a matching session refresh");
assert.match(desktopHttpSource, /const request = refreshToken\(session\)\.finally/, "desktop singleflight must refresh the captured session");
assert.match(desktopHttpSource, /if \(refreshFlights\.get\(session\.key\) === request\)[\s\S]{0,120}refreshFlights\.delete\(session\.key\)/, "desktop singleflight must clear only its own completed session request");
assert.match(desktopHttpSource, /await refreshTokenOnce\(refreshSession\)/, "desktop 401 retry must use session-scoped refresh singleflight");

assert.match(androidRetrofitSource, /private val refreshLock = Any\(\)/, "Android authenticator must serialize refresh attempts");
assert.match(androidRetrofitSource, /synchronized\(refreshLock\)/, "Android authenticator must guard refresh with refreshLock");
assert.match(androidRetrofitSource, /requestAccessToken/, "Android authenticator must compare the failed request token");
assert.match(androidRetrofitSource, /currentAccessToken != requestAccessToken/, "Android authenticator must reuse a newer token from another request");

console.log("Refresh token singleflight config passed");
