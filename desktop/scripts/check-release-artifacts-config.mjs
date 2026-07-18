import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  packageSource,
  releaseSource,
  releaseDocsSource,
  scriptsReadmeSource,
  localCheckSource,
  windowsLauncherSource,
  shellLauncherSource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "docs/github-release.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/README.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
  readFile(resolve(repoRoot, "deploy/start-local.cmd"), "utf8"),
  readFile(resolve(repoRoot, "deploy/start-local.sh"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
assert.equal(
  typeof packageJson.scripts?.["check:release-artifacts"],
  "string",
  "desktop/package.json must expose check:release-artifacts",
);

for (const token of [
  "Generate release artifact checksums",
  "sha256sum",
  "SHA256SUMS.txt",
  "Publish GitHub Release",
  "files: release-artifacts/*",
  ".yml",
  ".blockmap",
  "latest.yml",
  "Build deployment bundle",
  "TaskBridge-${RELEASE_VERSION}-deployment.zip",
  "taskbridge-deployment",
  "release-staging",
  "TASKBRIDGE_BACKEND_IMAGE",
  "${RELEASE_VERSION}",
  "Delete assets from an existing release",
  "gh release delete-asset",
  "Verify published release assets",
  "Skipping public Android APK because signing secrets are not configured",
  "Skipping public Windows installer because signing secrets are not configured",
  "Build desktop application",
]) {
  assert.match(releaseSource, new RegExp(escapeRegExp(token)), `release workflow must include ${token}`);
}

assert.doesNotMatch(
  releaseSource,
  /android-unsigned\.apk|building an unsigned release APK/i,
  "release workflow must never attach an unsigned Android APK to a public release",
);
assert.match(
  releaseSource,
  /release_image=.*RELEASE_VERSION[\s\S]{0,1000}\.env\.example[\s\S]{0,300}\.env\.local\.example/,
  "deployment bundle must pin both environment templates to the release image version",
);
assert.match(
  releaseSource,
  /required_assets=.*deployment\.zip[\s\S]{0,300}SHA256SUMS\.txt/,
  "published release verification must require the deployment archive and checksums",
);
assert.match(
  releaseSource,
  /forbidden_assets=[\s\S]{0,240}unsigned[\s\S]{0,240}builder-debug\.yml/,
  "published release verification must reject unsigned and builder debug assets",
);
assert.doesNotMatch(
  releaseSource,
  /building an unsigned installer/i,
  "release workflow must never attach an unsigned Windows installer to a public release",
);
assert.doesNotMatch(
  releaseSource,
  /\.Extension -in @\('\.exe', '\.yml'/,
  "desktop artifact collection must not copy builder-debug.yml or unrelated YAML files",
);
assert.match(
  releaseSource,
  /\$_\.Name -eq 'latest\.yml'/,
  "desktop artifact collection must explicitly allow only latest.yml update metadata",
);
assert.match(
  releaseDocsSource,
  /未配置签名[^\n]*不会上传[^\n]*(?:APK|安装包)/,
  "release docs must explain that unsigned client artifacts are omitted",
);
for (const requiredPath of ["deploy/start-local.cmd", "deploy/start-local.sh"]) {
  assert.match(
    releaseSource,
    new RegExp(escapeRegExp(requiredPath)),
    `deployment bundle validation must require ${requiredPath}`,
  );
}
for (const [name, source] of [
  ["Windows local launcher", windowsLauncherSource],
  ["shell local launcher", shellLauncherSource],
]) {
  assert.match(source, /\.env\.local\.example/, `${name} must use the safe local-trial env template`);
  assert.match(source, /docker compose -f docker-compose\.release\.yml up -d/, `${name} must start the release compose stack`);
  assert.match(source, /\/ready/, `${name} must wait for the public readiness endpoint`);
  assert.match(source, /60/, `${name} must use a bounded readiness timeout`);
}
assert.match(
  releaseDocsSource,
  /TaskBridge-<version>-deployment\.zip/,
  "release docs must document the deployment bundle",
);

assert.match(releaseDocsSource, /SHA256SUMS\.txt/, "release docs must document checksum artifacts");
assert.match(scriptsReadmeSource, /check:release-artifacts/, "scripts README must list the release artifacts guard");
assert.match(localCheckSource, /check:release-artifacts/, "local check runner must include the release artifacts guard");

console.log("release artifacts config check passed");
