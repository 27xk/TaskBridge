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
assert.match(releaseSource, /Prepare Windows signing certificate/, "release workflow must prepare optional Windows signing");
assert.match(releaseSource, /TASKBRIDGE_WINDOWS_SIGNED_RELEASE/, "release workflow must track whether Windows artifacts are signed");
assert.match(releaseSource, /CSC_IDENTITY_AUTO_DISCOVERY=false/, "release workflow must explicitly disable Windows signing when no certificate is configured");
assert.match(releaseSource, /CSC_LINK/, "release workflow must pass a signing certificate to electron-builder when configured");
assert.match(releaseSource, /CSC_KEY_PASSWORD/, "release workflow must pass the Windows signing password to electron-builder when configured");
assert.match(
  releaseSource,
  /Verify Windows installer signatures[\s\S]*TASKBRIDGE_WINDOWS_SIGNED_RELEASE[\s\S]*Get-AuthenticodeSignature[\s\S]*Status -ne 'Valid'/,
  "release workflow must verify Windows Authenticode signatures when Windows signing is configured",
);
assert.match(releaseSource, /Prepare Android signing key/, "release workflow must prepare optional Android signing");
assert.match(releaseSource, /TASKBRIDGE_ANDROID_SIGNED_RELEASE/, "release workflow must track whether Android artifacts are signed");
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
  /Verify Android APK signature[\s\S]*TASKBRIDGE_ANDROID_SIGNED_RELEASE[\s\S]*apksigner[\s\S]*verify --verbose --print-certs/,
  "release workflow must verify the Android APK signature when Android signing is configured",
);
assert.match(
  releaseSource,
  /app-release-unsigned\.apk[\s\S]*android-unsigned\.apk/,
  "release workflow must publish a clearly named unsigned Android APK when signing is not configured",
);
assert.doesNotMatch(androidBuildSource, /Release signing is required/, "Android release builds must not fail solely because signing is not configured");
assert.match(androidReadmeSource, /unsigned release/i, "Android docs must explain unsigned release artifacts");
assert.match(troubleshootingSource, /unsigned release APK/i, "troubleshooting docs must explain unsigned release APKs");

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
  "unsigned Windows",
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
