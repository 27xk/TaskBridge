import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  androidBuildSource,
  releaseWorkflowSource,
  releaseComposeSource,
  backendComposeSource,
  deployComposeSource,
  indexSource,
  mainSource,
  floatingSource,
  preloadSource,
  httpSource,
  ipcSource,
  stateSource,
  securityDocsSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "android/app/build.gradle.kts"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "deploy/docker-compose.release.yml"), "utf8"),
  readFile(resolve(repoRoot, "backend/docker-compose.yml"), "utf8"),
  readFile(resolve(repoRoot, "deploy/docker-compose.yml"), "utf8"),
  readFile(resolve(desktopRoot, "index.html"), "utf8"),
  readFile(resolve(desktopRoot, "electron/main.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/floating-window.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/preload.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/http.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/ipc.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/state.ts"), "utf8"),
  readFile(resolve(repoRoot, "docs/security.md"), "utf8"),
]);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

assert.doesNotMatch(
  androidBuildSource,
  /signingConfigs\.getByName\("debug"\)/,
  "Android release builds must not fall back to the debug signing key",
);
assert.match(
  androidBuildSource,
  /Release signing is required/,
  "Android release assemble/bundle tasks must fail clearly when signing secrets are missing",
);
assert.match(
  releaseWorkflowSource,
  /Validate Android signing secrets/,
  "GitHub release workflow must validate Android signing secrets before publishing an APK",
);

for (const [name, source] of [
  ["deploy/docker-compose.release.yml", releaseComposeSource],
  ["backend/docker-compose.yml", backendComposeSource],
  ["deploy/docker-compose.yml", deployComposeSource],
]) {
  assert.doesNotMatch(source, /["']?3306:3306["']?/, `${name} must not publish MySQL on all interfaces`);
  assert.doesNotMatch(source, /["']?6379:6379["']?/, `${name} must not publish Redis on all interfaces`);
}

assert.match(mainSource, /sandbox:\s*true/, "main Electron window must enable renderer sandbox");
assert.match(floatingSource, /sandbox:\s*true/, "floating Electron window must enable renderer sandbox");
assert.match(
  indexSource,
  /<meta\s+http-equiv="Content-Security-Policy"/,
  "desktop renderer must define a Content-Security-Policy",
);
for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
]) {
  assert.match(indexSource, new RegExp(escapeRegExp(directive)), `desktop CSP must include ${directive}`);
}
assert.doesNotMatch(
  indexSource,
  /connect-src[^;"]*\bhttp:\s+https:\s+ws:\s+wss:/,
  "desktop production CSP must not allow every HTTP/WebSocket destination",
);
assert.doesNotMatch(indexSource, /script-src[^;"]*'unsafe-inline'/, "desktop CSP must not allow inline scripts");
assert.doesNotMatch(indexSource, /script-src[^;"]*'unsafe-eval'/, "desktop CSP must not allow eval scripts");
assert.doesNotMatch(preloadSource, /setTokens:/, "renderer preload must not expose direct token write access");
assert.match(httpSource, /ALLOWED_API_PATH_PREFIXES/, "desktop API bridge must define an API path allowlist");
assert.match(httpSource, /assertAllowedApiPath\(path\)/, "desktop API bridge must enforce the path allowlist");
assert.match(
  httpSource,
  /path\.startsWith\(`\$\{prefix\}\/`\)/,
  "desktop API path allowlist must not accept arbitrary same-prefix paths",
);
for (const allowedPath of ["/auth/", "/devices", "/tasks", "/sync/"]) {
  assert.match(
    httpSource,
    new RegExp(escapeRegExp(allowedPath)),
    `desktop API bridge allowlist must include ${allowedPath}`,
  );
}
assert.doesNotMatch(
  httpSource,
  /function normalizeApiPath[\s\S]*return path;/,
  "desktop API path normalization must not accept every relative path",
);
assert.match(ipcSource, /assertTrustedSender/, "IPC handlers must validate the invoking renderer");
assert.doesNotMatch(ipcSource, /ipcMain\.handle\("[^"]+",\s*\(/, "IPC handlers must go through the trusted sender wrapper");
for (const token of [
  "function validateLocalId",
  "function validateNotificationText",
  "function validateServerIds",
  "showTaskNotification(validateNotificationText(title",
  "getTask(validateLocalId(localId))",
  "listTasksByServerIds(validateServerIds(serverIds))",
  "openTaskDetail(validateLocalId(localId))",
]) {
  assert.match(ipcSource, new RegExp(escapeRegExp(token)), `IPC must harden renderer input: ${token}`);
}

const setTokensSource = sliceBetween(
  stateSource,
  "export function setTokens(tokens: TokenState): void {",
  "export function clearTokens(): void {",
);
assert.match(
  setTokensSource,
  /safeStorage\.isEncryptionAvailable\(\)/,
  "desktop must fail closed before writing Token secrets",
);
assert.ok(
  setTokensSource.indexOf("safeStorage.isEncryptionAvailable()") > -1,
  "desktop must check safeStorage availability before writing Token secrets",
);
assert.ok(
  setTokensSource.indexOf("setSecret(\"accessToken\"") >
    setTokensSource.indexOf("safeStorage.isEncryptionAvailable()"),
  "desktop must not write Token secrets before checking safeStorage availability",
);

const getSecretSource = sliceBetween(
  stateSource,
  "function getSecret(key: \"accessToken\" | \"refreshToken\"): string | undefined {",
  "function migrateLegacyPlaintextSecret(",
);
assert.doesNotMatch(
  getSecretSource,
  /return\s+stored\s*;/,
  "desktop must not return legacy plaintext tokens directly",
);
assert.doesNotMatch(
  getSecretSource,
  /stored\.startsWith\("safe:"\)[\s\S]*?:\s*stored\s*;/,
  "desktop must not keep a plaintext token branch in getSecret",
);

const migrateSecretSource = sliceBetween(
  stateSource,
  "function migrateLegacyPlaintextSecret(",
  "function setSecret(key: \"accessToken\" | \"refreshToken\", value: string): void {",
);
assert.match(
  migrateSecretSource,
  /safeStorage\.isEncryptionAvailable\(\)/,
  "desktop must check safeStorage availability when migrating legacy plaintext tokens",
);
assert.match(
  migrateSecretSource,
  /try\s*\{[\s\S]*setSecret\(key, value\);[\s\S]*\}\s*catch\s*\{[\s\S]*settingsStore\.delete\(key\);[\s\S]*return undefined;/,
  "desktop must clear legacy plaintext tokens if migration fails",
);

const setSecretSource = sliceBetween(
  stateSource,
  "function setSecret(key: \"accessToken\" | \"refreshToken\", value: string): void {",
  undefined,
);
assert.match(
  setSecretSource,
  /safeStorage\.encryptString\(value\)/,
  "desktop must encrypt Token secrets before persistence",
);
assert.match(
  setSecretSource,
  /settingsStore\.set\(key,\s*`safe:\$\{encrypted\}`\)/,
  "desktop must persist Token secrets only with the safe: prefix",
);
assert.doesNotMatch(
  stateSource,
  /settingsStore\.set\(\s*["']accessToken["']\s*,/,
  "desktop must not write accessToken directly to settings storage",
);
assert.doesNotMatch(
  stateSource,
  /settingsStore\.set\(\s*["']refreshToken["']\s*,/,
  "desktop must not write refreshToken directly to settings storage",
);
assert.match(
  securityDocsSource,
  /不会回退到明文保存 Token/,
  "security docs must state that desktop token storage fails closed instead of falling back to plaintext",
);

console.log("security config check passed");
