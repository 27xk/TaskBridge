import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [desktopHttpSource, androidRetrofitSource] = await Promise.all([
  readFile(resolve(desktopRoot, "electron/http.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/remote/RetrofitClient.kt"), "utf8"),
]);

assert.match(desktopHttpSource, /let refreshInFlight: Promise</, "desktop HTTP client must share one refresh request");
assert.match(desktopHttpSource, /function refreshTokenOnce/, "desktop HTTP client must centralize refresh singleflight");
assert.match(desktopHttpSource, /refreshInFlight = refreshToken\(refreshTokenValue\)/, "desktop singleflight must wrap refreshToken()");
assert.match(desktopHttpSource, /\.finally\(\(\) => \{\s*refreshInFlight = null;/s, "desktop singleflight must clear after completion");
assert.match(desktopHttpSource, /await refreshTokenOnce\(tokens\.refreshToken\)/, "desktop 401 retry must use refresh singleflight");

assert.match(androidRetrofitSource, /private val refreshLock = Any\(\)/, "Android authenticator must serialize refresh attempts");
assert.match(androidRetrofitSource, /synchronized\(refreshLock\)/, "Android authenticator must guard refresh with refreshLock");
assert.match(androidRetrofitSource, /requestAccessToken/, "Android authenticator must compare the failed request token");
assert.match(androidRetrofitSource, /currentAccessToken != requestAccessToken/, "Android authenticator must reuse a newer token from another request");

console.log("Refresh token singleflight config passed");
