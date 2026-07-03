import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  configSource,
  authApiSource,
  authTestSource,
  backendEnvSource,
  deployEnvSource,
  backendReadmeSource,
  securityDocSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "backend/app/core/config.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/auth.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/tests/test_auth.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/.env.example"), "utf8"),
  readFile(resolve(repoRoot, "deploy/.env.example"), "utf8"),
  readFile(resolve(repoRoot, "backend/README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/security.md"), "utf8"),
]);

assert.match(configSource, /registration_enabled: bool = True/, "backend settings must expose REGISTRATION_ENABLED");
assert.match(authApiSource, /from app\.core\.config import settings/, "auth API must read runtime settings");
assert.match(authApiSource, /if not settings\.registration_enabled:/, "register endpoint must enforce REGISTRATION_ENABLED");
assert.match(authApiSource, /message="registration disabled"/, "disabled registration must return a stable error");
assert.match(authTestSource, /test_registration_can_be_disabled/, "backend tests must cover disabled registration");

for (const [name, source] of [
  ["backend .env example", backendEnvSource],
  ["deploy .env example", deployEnvSource],
  ["backend README", backendReadmeSource],
  ["security docs", securityDocSource],
]) {
  assert.ok(source.includes("REGISTRATION_ENABLED"), `${name} must document REGISTRATION_ENABLED`);
}

console.log("Registration governance config passed");
