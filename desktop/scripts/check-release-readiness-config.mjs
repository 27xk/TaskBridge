import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [packageSource, ciSource, releaseSource, releaseDocsSource, scriptsReadmeSource] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "docs/github-release.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/README.md"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
const envBlockStart = releaseSource.indexOf("\nenv:");
const envBlockEnd = releaseSource.indexOf("\njobs:", envBlockStart);
assert.ok(envBlockStart >= 0 && envBlockEnd > envBlockStart, "release workflow must include a top-level env block");
const releaseEnvBlock = releaseSource.slice(envBlockStart, envBlockEnd);

assert.equal(
  typeof packageJson.scripts?.["check:release-readiness"],
  "string",
  "desktop/package.json must expose check:release-readiness",
);

for (const [name, source] of [
  ["CI", ciSource],
  ["release", releaseSource],
]) {
  assert.match(source, /npm run check:release-readiness/, `${name} workflow must run release readiness checks`);
}

assert.match(
  releaseSource,
  /TASKBRIDGE_BASE_URL:\s*\$\{\{\s*vars\.TASKBRIDGE_BASE_URL\s*\}\}/,
  "release workflow must require TASKBRIDGE_BASE_URL from repository variables without a fallback",
);
assert.match(
  releaseSource,
  /TASKBRIDGE_WS_URL:\s*\$\{\{\s*vars\.TASKBRIDGE_WS_URL\s*\}\}/,
  "release workflow must require TASKBRIDGE_WS_URL from repository variables without a fallback",
);
assert.doesNotMatch(
  releaseSource,
  /TASKBRIDGE_BASE_URL:\s*\$\{\{[^}]*\|\|/,
  "release workflow must not silently fall back to a baked API URL",
);
assert.doesNotMatch(
  releaseSource,
  /TASKBRIDGE_WS_URL:\s*\$\{\{[^}]*\|\|/,
  "release workflow must not silently fall back to a baked WebSocket URL",
);
assert.doesNotMatch(
  releaseEnvBlock,
  /(?:127\.0\.0\.1|localhost|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/,
  "release workflow must not bake localhost or private network endpoints into public artifacts",
);
assert.match(
  releaseSource,
  /Validate release endpoint configuration/,
  "release workflow must validate endpoint configuration before building artifacts",
);
for (const token of [
  "validate_endpoint \"TASKBRIDGE_BASE_URL\"",
  "validate_endpoint \"TASKBRIDGE_WS_URL\"",
  "must be configured in repository variables",
  "http://",
  "https://",
  "ws://",
  "wss://",
  "private or local network address",
]) {
  assert.match(releaseSource, new RegExp(escapeRegExp(token)), `release workflow must enforce ${token}`);
}
assert.match(
  releaseSource,
  /validate_endpoint "TASKBRIDGE_BASE_URL" "\$TASKBRIDGE_BASE_URL" "\/api\/v1\/" "http:\/\/" "https:\/\/"/,
  "release workflow must allow configured HTTP or HTTPS API endpoints",
);
assert.match(
  releaseSource,
  /validate_endpoint "TASKBRIDGE_WS_URL" "\$TASKBRIDGE_WS_URL" "\/ws\/sync" "ws:\/\/" "wss:\/\/"/,
  "release workflow must allow configured WS or WSS sync endpoints",
);
assert.doesNotMatch(
  releaseSource,
  /must use https:\/\/ for public release artifacts|must use wss:\/\/ for public release artifacts/i,
  "release workflow must not require TLS-only endpoint schemes",
);

for (const token of [
  "TASKBRIDGE_BASE_URL=http://",
  "TASKBRIDGE_WS_URL=ws://",
  "http://` / `https://",
  "ws://` / `wss://",
  "Release workflow refuses",
]) {
  assert.match(releaseDocsSource, new RegExp(escapeRegExp(token)), `release docs must document ${token}`);
}
assert.match(
  scriptsReadmeSource,
  /check:release-readiness/,
  "scripts README must list the release readiness guard",
);

console.log("release readiness config check passed");
