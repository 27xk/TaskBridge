import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  packageSource,
  ciSource,
  releaseSource,
  backendDockerfileSource,
  deployReadmeSource,
  backupScriptSource,
  restoreScriptSource,
  releaseDocsSource,
  gitignoreSource,
  syncLogMigrationSource,
  androidBuildSource,
  androidReadmeSource,
  troubleshootingSource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "backend/Dockerfile"), "utf8"),
  readFile(resolve(repoRoot, "deploy/README.md"), "utf8"),
  readFile(resolve(repoRoot, "deploy/backup-mysql.sh"), "utf8"),
  readFile(resolve(repoRoot, "deploy/restore-mysql.sh"), "utf8"),
  readFile(resolve(repoRoot, "docs/github-release.md"), "utf8"),
  readFile(resolve(repoRoot, ".gitignore"), "utf8"),
  readFile(resolve(repoRoot, "backend/alembic/versions/20260528_0008_sync_log_idempotency_unique.py"), "utf8"),
  readFile(resolve(repoRoot, "android/app/build.gradle.kts"), "utf8"),
  readFile(resolve(repoRoot, "android/README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/troubleshooting.md"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
assert.equal(
  typeof packageJson.scripts?.["check:production-hardening"],
  "string",
  "desktop/package.json must expose check:production-hardening",
);

for (const [workflowName, source] of [
  ["CI", ciSource],
  ["release", releaseSource],
]) {
  assert.match(source, /npm run check:production-hardening/, `${workflowName} workflow must run production hardening checks`);
}

assert.match(backendDockerfileSource, /\/ready/, "backend container healthcheck must use the readiness endpoint");
assert.match(releaseSource, /Validate Windows signing secrets/, "release workflow must validate Windows signing secrets");
assert.match(releaseSource, /WINDOWS_CERTIFICATE_BASE64/, "release workflow must require a Windows signing certificate");
assert.match(releaseSource, /CSC_LINK/, "release workflow must pass a signing certificate to electron-builder");
assert.match(releaseSource, /CSC_KEY_PASSWORD/, "release workflow must pass the Windows signing password to electron-builder");
assert.match(
  releaseSource,
  /Verify Windows installer signatures[\s\S]*Get-AuthenticodeSignature[\s\S]*Status -ne 'Valid'/,
  "release workflow must verify Windows Authenticode signatures before uploading artifacts",
);
assert.match(releaseSource, /Validate Android signing secrets/, "release workflow must validate Android signing secrets");
for (const token of [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
  "ANDROID_KEYSTORE_PATH",
]) {
  assert.match(releaseSource, new RegExp(escapeRegExp(token)), `release workflow must require ${token}`);
}
assert.match(
  releaseSource,
  /Verify Android APK signature[\s\S]*apksigner[\s\S]*verify --verbose --print-certs/,
  "release workflow must verify the Android APK signature before uploading artifacts",
);
assert.doesNotMatch(
  releaseSource,
  /TASKBRIDGE_ALLOW_UNSIGNED_RELEASE/,
  "public release workflow must not allow unsigned Android release artifacts",
);
assert.doesNotMatch(
  androidBuildSource,
  /TASKBRIDGE_ALLOW_UNSIGNED_RELEASE|allowUnsignedRelease/,
  "Android release builds must not expose an unsigned release escape hatch",
);
assert.doesNotMatch(
  androidReadmeSource,
  /TASKBRIDGE_ALLOW_UNSIGNED_RELEASE|unsigned release/i,
  "Android docs must not teach unsigned release builds",
);
assert.doesNotMatch(
  troubleshootingSource,
  /unsigned release APK/i,
  "troubleshooting docs must direct local experiments to debug builds, not unsigned release APKs",
);
assert.doesNotMatch(
  releaseSource,
  /app-release-unsigned\.apk/,
  "public release workflow must not publish unsigned Android release artifacts",
);
assert.doesNotMatch(
  releaseSource,
  /CSC_IDENTITY_AUTO_DISCOVERY:\s*["']false["']/,
  "public release workflow must not disable Windows signing",
);

for (const token of [
  "docker compose",
  "mysqldump",
  "--single-transaction",
  "gzip",
  "mktemp",
  "TEMP_SQL",
  "TEMP_GZIP",
  "BACKUP_RETENTION_DAYS",
]) {
  assert.match(backupScriptSource, new RegExp(escapeRegExp(token)), `backup script must include ${token}`);
}
assert.match(backupScriptSource, /TEMP_GZIP="\$\(mktemp/, "backup script must use a unique temporary gzip file");
assert.doesNotMatch(backupScriptSource, /BACKUP_FILE.*\.tmp/, "backup script must not use a fixed backup temp filename");

for (const token of [
  "TASKBRIDGE_RESTORE_CONFIRM",
  "gzip -dc",
  "mysql",
  "docker compose",
  "mktemp",
  "TEMP_SQL",
]) {
  assert.match(restoreScriptSource, new RegExp(escapeRegExp(token)), `restore script must include ${token}`);
}
assert.match(restoreScriptSource, /gzip -dc "\$BACKUP_FILE" > "\$TEMP_SQL"/, "restore script must validate gzip output before importing");

for (const token of [
  "backup-mysql.sh",
  "restore-mysql.sh",
  "BACKUP_RETENTION_DAYS",
]) {
  assert.match(deployReadmeSource, new RegExp(escapeRegExp(token)), `deploy docs must document ${token}`);
}

for (const token of [
  "WINDOWS_CERTIFICATE_BASE64",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "unsigned Android",
]) {
  assert.match(releaseDocsSource, new RegExp(escapeRegExp(token)), `release docs must document ${token}`);
}

assert.match(gitignoreSource, /(?:^|\r?\n)deploy\/backups\/(?:\r?\n|$)/, "MySQL backup output directory must be ignored");
assert.match(
  syncLogMigrationSource,
  /DELETE sync_logs[\s\S]*create_unique_constraint\(\s*"uq_sync_logs_idempotency"/,
  "sync log migration must deduplicate existing rows before adding the idempotency constraint",
);
assert.match(
  syncLogMigrationSource,
  /conflicting_sync_logs[\s\S]*raise RuntimeError/,
  "sync log migration must fail instead of deleting conflicting idempotency duplicates",
);
for (const token of [
  "ROW_NUMBER() OVER",
  "PARTITION BY user_id, device_id, local_id, operation, client_version",
  "COUNT(DISTINCT COALESCE(task_id",
  "COUNT(DISTINCT COALESCE(server_id",
  "COUNT(DISTINCT COALESCE(result",
  "uq_sync_logs_idempotency",
]) {
  assert.match(syncLogMigrationSource, new RegExp(escapeRegExp(token)), `sync log migration must include ${token}`);
}

console.log("production hardening config check passed");

