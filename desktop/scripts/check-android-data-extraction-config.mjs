import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { workspacePaths } from "./script-helpers.mjs";

const { repoRoot } = workspacePaths(import.meta.url);

const [
  manifestSource,
  dataExtractionSource,
  fullBackupSource,
  androidBuildSource,
  securityDocsSource,
  localCheckSource,
  ciSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "android/app/src/main/AndroidManifest.xml"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/res/xml/data_extraction_rules.xml"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/res/xml/full_backup_content.xml"), "utf8"),
  readFile(resolve(repoRoot, "android/app/build.gradle.kts"), "utf8"),
  readFile(resolve(repoRoot, "docs/security.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
]);

assert.match(
  manifestSource,
  /android:dataExtractionRules="@xml\/data_extraction_rules"/,
  "Android manifest must declare data extraction rules",
);
assert.match(
  manifestSource,
  /android:fullBackupContent="@xml\/full_backup_content"/,
  "Android manifest must declare legacy full backup content rules",
);
assert.match(
  androidBuildSource,
  /manifestPlaceholders\["allowBackup"\]\s*=\s*false/,
  "release builds must keep allowBackup disabled by default",
);

for (const [name, source] of [
  ["data_extraction_rules.xml", dataExtractionSource],
  ["full_backup_content.xml", fullBackupSource],
]) {
  assert.doesNotMatch(source, /domain="cache"/, `${name} must not use invalid Android backup domain "cache"`);
  for (const sensitivePath of [
    "taskbridge_secure_tokens.xml",
    "taskbridge_device.xml",
    "taskbridge_sync.preferences_pb",
    "taskbridge.db",
    "taskbridge.db-shm",
    "taskbridge.db-wal",
    "exports",
  ]) {
    assert.match(source, new RegExp(`path="${sensitivePath}"`), `${name} must exclude ${sensitivePath}`);
  }
}

for (const token of [
  "dataExtractionRules",
  "fullBackupContent",
  "taskbridge_secure_tokens",
  "taskbridge_device",
  "taskbridge.db",
]) {
  assert.ok(securityDocsSource.includes(token), `security docs must mention Android backup rule ${token}`);
}

assert.match(
  localCheckSource,
  /check:android-data-extraction/,
  "local check runner must include the Android data extraction guard",
);
assert.match(
  ciSource,
  /check:android-data-extraction/,
  "CI must include the Android data extraction guard",
);

console.log("Android data extraction config passed");
