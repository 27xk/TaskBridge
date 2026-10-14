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
  /forbidden_assets=[\s\S]{0,240}unsigned[\s\S]{0,240}builder-debug\.yml/,
  "published release verification must reject unsigned Android and builder debug assets",
);

const normalizedReleaseSource = releaseSource.replace(/\r\n?/g, "\n");
function releaseStep(name) {
  const marker = `      - name: ${name}\n`;
  const index = normalizedReleaseSource.indexOf(marker);
  assert.ok(index >= 0, `release workflow must include step ${name}`);
  const body = normalizedReleaseSource.slice(index + marker.length);
  const boundary = body.search(/^(?:      - name:|  [\w-]+:)/m);
  return boundary < 0 ? body : body.slice(0, boundary);
}

for (const name of [
  "Build Windows installer",
  "Prepare desktop artifacts",
  "Validate desktop update artifacts",
  "Upload Windows artifacts",
]) {
  assert.doesNotMatch(releaseStep(name), /^        if:/m, `${name} must run without Windows signing secrets`);
}
assert.match(releaseStep("Build Windows installer"), /^        run:\s*npm run dist\s*$/m, "Windows installer delivery must build the distributable");
const windowsSigningStep = releaseStep("Prepare Windows signing certificate");
assert.match(windowsSigningStep, /TASKBRIDGE_WINDOWS_SIGNED_RELEASE=false/, "missing Windows signing must select unsigned delivery");
assert.match(windowsSigningStep, /CSC_IDENTITY_AUTO_DISCOVERY=false/, "unsigned Windows delivery must disable certificate discovery");
assert.match(
  windowsSigningStep,
  /::notice::[^\n]*unsigned[^\n]*(?:Windows|installer)|::notice::[^\n]*(?:Windows|installer)[^\n]*unsigned/i,
  "missing Windows signing must explicitly announce unsigned installer delivery",
);
const windowsVerifyStep = releaseStep("Verify Windows installer signatures");
assert.match(
  windowsVerifyStep,
  /^        if:\s*(?:\$\{\{\s*)?env\.TASKBRIDGE_WINDOWS_SIGNED_RELEASE == 'true'(?:\s*\}\})?\s*$/m,
  "release workflow must verify Windows signatures when signing is configured",
);
assert.match(windowsVerifyStep, /Get-AuthenticodeSignature/, "signed Windows releases must validate Authenticode signatures");
assert.match(windowsVerifyStep, /\$signature\.Status -ne 'Valid'[\s\S]*throw/, "invalid Windows signatures must fail the release");
for (const name of [
  "Build release APK",
  "Verify Android APK signature",
  "Prepare Android artifact",
  "Upload Android artifact",
]) {
  assert.match(
    releaseStep(name),
    /^        if:\s*(?:\$\{\{\s*)?env\.TASKBRIDGE_ANDROID_SIGNED_RELEASE == 'true'(?:\s*\}\})?\s*$/m,
    `${name} must require Android signing`,
  );
}
assert.match(releaseStep("Verify Android APK signature"), /apksigner[\s\S]*verify/, "Android release APKs must pass signature verification");
const releaseVerificationStep = releaseStep("Verify published release assets");
const requiredAssets = releaseVerificationStep.match(/required_assets=\([\s\S]*?\)/)?.[0] ?? "";
const requiredAssetNames = [...requiredAssets.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
assert.ok(
  requiredAssetNames.some((name) => name.endsWith("-deployment.zip")) && requiredAssetNames.includes("SHA256SUMS.txt"),
  "published release verification must require the deployment archive and checksums",
);
for (const token of [".exe", ".blockmap", "latest.yml"]) {
  assert.ok(
    requiredAssetNames.some((name) => token === "latest.yml" ? name === token : name.endsWith(token)),
    `published release verification must require Windows installer and update artifacts: ${token}`,
  );
}
assert.match(
  releaseStep("Publish GitHub Release"),
  /Windows[^\n]*unsigned|unsigned[^\n]*Windows/i,
  "release notes must disclose unsigned Windows installers",
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
  /未配置签名[^\n]*不会上传[^\n]*APK/,
  "release docs must explain that unsigned Android APKs are omitted",
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
