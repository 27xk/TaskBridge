import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const files = [
  "desktop/scripts/check-release-artifacts-config.mjs",
  "desktop/scripts/script-helpers.mjs",
  "desktop/package.json",
  ".github/workflows/release.yml",
  "docs/github-release.md",
  "scripts/README.md",
  "scripts/check-local.ps1",
  "deploy/start-local.cmd",
  "deploy/start-local.sh",
];
const windowsSteps = [
  "Build Windows installer",
  "Prepare desktop artifacts",
  "Validate desktop update artifacts",
  "Upload Windows artifacts",
];
const androidSteps = [
  "Build release APK",
  "Verify Android APK signature",
  "Prepare Android artifact",
  "Upload Android artifact",
];

function updateStep(source, name, update) {
  const start = source.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `Fixture step must exist: ${name}`);
  const next = source.indexOf("\n      - name:", start + 1);
  const jobOffset = source.slice(start + 1).search(/^  [\w-]+:\s*$/m);
  const nextJob = jobOffset < 0 ? source.length : start + 1 + jobOffset;
  const end = next < 0 ? nextJob : Math.min(next, nextJob);
  return source.slice(0, start) + update(source.slice(start, end)) + source.slice(end);
}

function completeDeliveryWorkflow(source) {
  let workflow = source.replace(/\r\n?/g, "\n");
  for (const name of windowsSteps) {
    workflow = updateStep(workflow, name, (step) => step.replace(/^        if:.*\n/gm, ""));
  }
  workflow = workflow.replace(
    /Skipping public Windows installer because signing secrets are not configured\./,
    "Building an unsigned Windows installer because signing secrets are not configured.",
  );
  workflow = updateStep(workflow, "Prepare Android signing key", (step) => step.replace(
    /        run: \|\n[\s\S]*?(?=        env:)/,
    `        run: |
          missing=()
          for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
            if [ -z "\${!name}" ]; then
              missing+=("$name")
            fi
          done
          if [ "\${#missing[@]}" -gt 0 ]; then
            echo "::error::Missing required Android signing secrets: \${missing[*]}."
            exit 1
          fi
          echo "$ANDROID_KEYSTORE_BASE64" | base64 --decode > release.keystore
          if [ ! -s release.keystore ]; then
            echo "::error::Decoded Android signing keystore is empty or missing."
            exit 1
          fi
          echo "TASKBRIDGE_ANDROID_SIGNED_RELEASE=true" >> "$GITHUB_ENV"
`,
  ));
  for (const name of androidSteps) {
    workflow = updateStep(workflow, name, (step) => step.replace(/^        if:.*\n/gm, ""));
  }
  workflow = workflow.replace(
    /          body: \|\n[\s\S]*?(?=\n        env:)/,
    "          body: |\n            Windows installers are unsigned when signing secrets are absent.\n            Android downloads require a verified signature.\n",
  );
  workflow = workflow.replace(
    /required_assets=\([\s\S]*?\)/,
    'required_assets=(\n            "TaskBridge-${RELEASE_VERSION}-deployment.zip"\n            "SHA256SUMS.txt"\n            "TaskBridge-${RELEASE_VERSION#v}-Setup.exe"\n            "TaskBridge-${RELEASE_VERSION#v}-Setup.exe.blockmap"\n            "latest.yml"\n            "TaskBridge-${RELEASE_VERSION}-android.apk"\n          )',
  );
  return workflow;
}

function runGuard(t, change = (source) => source, lineEnding = "\n") {
  const directory = mkdtempSync(join(tmpdir(), "taskbridge-release-artifacts-"));
  t.after(() => {
    const cleanupDirectory = resolve(directory);
    assert.ok(isAbsolute(directory));
    assert.equal(dirname(cleanupDirectory), resolve(tmpdir()));
    assert.ok(basename(cleanupDirectory).startsWith("taskbridge-release-artifacts-"));
    rmSync(cleanupDirectory, { recursive: true, force: true });
  });
  for (const path of files) {
    let source = readFileSync(join(repoRoot, path), "utf8");
    if (path === ".github/workflows/release.yml") source = change(completeDeliveryWorkflow(source));
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source.replace(/\r\n?|\n/g, lineEnding));
  }
  const result = spawnSync(process.execPath, [join(directory, files[0])], {
    cwd: directory, encoding: "utf8", windowsHide: true, timeout: 10000,
  });
  return { ...result, stderr: result.stderr?.match(/AssertionError[^\n]*/)?.[0] ?? result.stderr?.slice(0, 1000) };
}

for (const [name, lineEnding] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`release guard accepts signed Android and optional Windows signing delivery (${name})`, (t) => {
    const result = runGuard(t, undefined, lineEnding);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.match(result.stdout, /release artifacts config check passed/);
  });
}

for (const name of windowsSteps) {
  test(`release guard rejects signing-gated ${name}`, (t) => {
    const result = runGuard(t, (source) => updateStep(source, name, (step) =>
      step.replace(`      - name: ${name}\n`, `      - name: ${name}\n        if: env.TASKBRIDGE_WINDOWS_SIGNED_RELEASE == 'true'\n`)));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must run without Windows signing secrets/);
  });
}

test("release guard still rejects Windows signature verification without its signed condition", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Verify Windows installer signatures", (step) =>
    step.replace(/^        if:.*\n/gm, "")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must verify Windows signatures when signing is configured/);
});

test("release guard still requires the Authenticode Valid check", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Verify Windows installer signatures", (step) =>
    step.replace(/Get-AuthenticodeSignature/g, "Write-Output")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must validate Authenticode signatures/);
});

test("release guard rejects missing Android signing secrets being silently skipped", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Prepare Android signing key", (step) =>
    step.replace(/::error::Missing required Android signing secrets:/, "::notice::Skipping public Android APK:")
      .replace(/exit 1/, "exit 0")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must fail when Android signing secrets are missing/);
});

test("release guard does not borrow a signing error from a later unnamed step", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Prepare Android signing key", (step) =>
    step.replace(/          if \[ "\$\{#missing\[@\]\}" -gt 0 \]; then[\s\S]*?\n          fi\n/, "") +
    `      - run: |
          if [ "\${#missing[@]}" -gt 0 ]; then
            echo "::error::Unrelated later step failure."
            exit 1
          fi

`));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must fail when Android signing secrets are missing/);
});

for (const name of androidSteps) {
  test(`release guard rejects optional Android stage ${name}`, (t) => {
    const result = runGuard(t, (source) => updateStep(source, name, (step) =>
      step.replace(`      - name: ${name}\n`, `      - name: ${name}\n        if: env.TASKBRIDGE_ANDROID_SIGNED_RELEASE == 'true'\n`)));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must always deliver signed Android artifacts/);
  });
}

test("release guard rejects Android signature verification being removed", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Verify Android APK signature", (step) =>
    step.replace(/verify --verbose --print-certs/, "version")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Android release APKs must pass signature verification/);
});

test("release guard rejects decoding an Android keystore without checking it is nonempty", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Prepare Android signing key", (step) =>
    step.replace(/if \[ ! -s release\.keystore \]; then[\s\S]*?\n          fi\n/, "")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must validate the decoded Android signing keystore/);
});

test("release guard rejects an Android debug-key fallback", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Prepare Android signing key", (step) =>
    step.replace(/        run: \|\n/, "        run: |\n          cp ~/.android/debug.keystore release.keystore\n")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not use Android debug signing keys/);
});

test("release guard requires the Android APK in published assets", (t) => {
  const result = runGuard(t, (source) => source.replace(' "TaskBridge-${RELEASE_VERSION}-android.apk"', ""));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must require the signed Android APK/);
});

for (const asset of ["TaskBridge-${RELEASE_VERSION#v}-Setup.exe", "TaskBridge-${RELEASE_VERSION#v}-Setup.exe.blockmap", "latest.yml"]) {
  test(`release guard rejects release verification that omits ${asset}`, (t) => {
    const result = runGuard(t, (source) => source.replace(` "${asset}"`, ""));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must require Windows installer and update artifacts/);
  });
}

test("release guard rejects silently publishing unsigned Windows installers", (t) => {
  const result = runGuard(t, (source) => updateStep(source, "Publish GitHub Release", (step) =>
    step.replace(/Windows installers are unsigned when signing secrets are absent\./,
      "Windows installers are available.")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must disclose unsigned Windows installers/);
});
