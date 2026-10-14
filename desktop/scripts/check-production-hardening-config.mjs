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
assert.match(releaseSource, /Prepare Android signing key/, "release workflow must prepare mandatory Android signing");
for (const token of [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
  "ANDROID_KEYSTORE_PATH",
]) {
  assert.match(releaseSource, new RegExp(escapeRegExp(token)), `release workflow must require ${token}`);
}
assert.doesNotMatch(
  releaseSource,
  /app-release-unsigned\.apk|android-unsigned\.apk/,
  "release workflow must not publish unsigned Android APKs",
);
assert.doesNotMatch(
  releaseSource,
  /Skipping public Android APK|TASKBRIDGE_ANDROID_SIGNED_RELEASE=false/,
  "release workflow must not silently omit Android downloads when signing is unavailable",
);
const normalizedReleaseSource = releaseSource.replace(/\r\n?/g, "\n");
function releaseStep(name) {
  const marker = `      - name: ${name}\n`;
  const index = normalizedReleaseSource.indexOf(marker);
  assert.ok(index >= 0, `release workflow must include step ${name}`);
  const body = normalizedReleaseSource.slice(index + marker.length);
  const boundary = body.search(/^(?:      -(?:\s|$)|  [\w-]+:)/m);
  return boundary < 0 ? body : body.slice(0, boundary);
}
const androidSigningStep = releaseStep("Prepare Android signing key");
assert.doesNotMatch(androidSigningStep, /^        if:|\bexit 0\b/m, "Android signing preparation must not be optional");
const missingSigningBranch = androidSigningStep.match(/if \[ "\$\{#missing\[@\]\}" -gt 0 \]; then([\s\S]*?)\n          fi/)?.[1] ?? "";
assert.ok(
  missingSigningBranch.includes("::error::") && /\bexit 1\b/.test(missingSigningBranch),
  "release workflow must fail when Android signing secrets are missing",
);
const signingSecretLoop = androidSigningStep.match(/for name in ([^\n]*); do([\s\S]*?)\n          done/) ?? [];
for (const name of ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]) {
  assert.ok(signingSecretLoop[1]?.split(/\s+/).includes(name), `Android signing preparation must require ${name}`);
  assert.ok(androidSigningStep.includes(`secrets.${name}`), `Android signing preparation must load ${name} from secrets`);
}
assert.match(signingSecretLoop[2] ?? "", /if \[ -z "\$\{!name\}" \]; then[\s\S]*missing\+=/, "Android signing preparation must detect empty secrets");
assert.match(
  androidSigningStep,
  /base64 --decode > release\.keystore[\s\S]*if \[ ! -s release\.keystore \]; then[\s\S]*exit 1/,
  "release workflow must validate the decoded Android signing keystore",
);
for (const name of ["Build release APK", "Verify Android APK signature", "Prepare Android artifact", "Upload Android artifact"]) {
  assert.doesNotMatch(releaseStep(name), /^        if:/m, `${name} must always deliver signed Android artifacts`);
}
assert.match(
  releaseStep("Verify Android APK signature"),
  /apksigner[\s\S]*verify --verbose --print-certs/,
  "release workflow must verify the Android APK signature before upload",
);
assert.doesNotMatch(
  androidSigningStep + releaseStep("Build release APK"),
  /debug\.keystore|androiddebugkey|signingConfigs(?:\.|\[|\.getByName\()["']?debug/i,
  "release workflow must not use Android debug signing keys",
);
const requiredAssets = releaseStep("Verify published release assets").match(/required_assets=\([\s\S]*?\)/)?.[0] ?? "";
assert.ok(
  [...requiredAssets.matchAll(/["']([^"']+)["']/g)].some((match) => match[1] === "TaskBridge-${RELEASE_VERSION}-android.apk"),
  "published release verification must require the signed Android APK",
);
assert.match(
  releaseSource,
  /::notice::[^\r\n]*(?:Windows|installer)[^\r\n]*unsigned|::notice::[^\r\n]*unsigned[^\r\n]*(?:Windows|installer)/i,
  "release workflow must explicitly disclose unsigned Windows installer delivery when signing is unavailable",
);
assert.doesNotMatch(androidBuildSource, /Release signing is required/, "Android release builds must not fail solely because signing is not configured");
assert.match(androidReadmeSource, /unsigned release/i, "Android docs must explain local unsigned release builds");
assert.match(
  troubleshootingSource,
  /unsigned[\s\S]*不(?:应|会)[\s\S]*公开 Release/i,
  "troubleshooting docs must explain that unsigned clients are not public downloads",
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

for (const token of ["WINDOWS_CERTIFICATE_BASE64", "WINDOWS_CERTIFICATE_PASSWORD", "unsigned APK", "unsigned `.exe`"]) {
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
