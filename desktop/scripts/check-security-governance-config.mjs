import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

function requiredPath(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  assert.ok(existsSync(absolutePath), `${relativePath} must exist`);
  return absolutePath;
}

const [
  packageSource,
  securityPolicySource,
  dependabotSource,
  codeqlSource,
  ciSource,
  releaseSource,
  pullRequestTemplateSource,
  scriptsReadmeSource,
  localCheckSource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(requiredPath("SECURITY.md"), "utf8"),
  readFile(requiredPath(".github/dependabot.yml"), "utf8"),
  readFile(requiredPath(".github/workflows/codeql.yml"), "utf8"),
  readFile(requiredPath(".github/workflows/ci.yml"), "utf8"),
  readFile(requiredPath(".github/workflows/release.yml"), "utf8"),
  readFile(requiredPath(".github/PULL_REQUEST_TEMPLATE.md"), "utf8"),
  readFile(requiredPath("scripts/README.md"), "utf8"),
  readFile(requiredPath("scripts/check-local.ps1"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
assert.equal(
  typeof packageJson.scripts?.["check:security-governance"],
  "string",
  "desktop/package.json must expose check:security-governance",
);

for (const token of [
  "Supported Versions",
  "Reporting a Vulnerability",
  "Security Baseline",
  "Artifact Verification",
  "Do not disclose",
]) {
  assert.ok(securityPolicySource.includes(token), `SECURITY.md must include ${token}`);
}

for (const ecosystem of [
  "pip",
  "npm",
  "gradle",
  "github-actions",
]) {
  assert.match(dependabotSource, new RegExp(`package-ecosystem:\\s*"${ecosystem}"`), `Dependabot must cover ${ecosystem}`);
}
for (const directory of [
  "/backend",
  "/desktop",
  "/android",
  "/",
]) {
  assert.match(dependabotSource, new RegExp(`directory:\\s*"${directory}"`), `Dependabot must cover ${directory}`);
}
assert.match(dependabotSource, /open-pull-requests-limit:\s*0/, "Dependabot must disable routine version update PRs");

for (const token of [
  "github/codeql-action/init@v4",
  "github/codeql-action/analyze@v4",
  "security-events: write",
  "javascript-typescript",
  "python",
  "java-kotlin",
  "./gradlew :app:assembleDebug",
]) {
  assert.ok(codeqlSource.includes(token), `CodeQL workflow must include ${token}`);
}

for (const token of [
  "actions/dependency-review-action@v4",
  "ossf/scorecard-action@v2.4.2",
  "github/codeql-action/upload-sarif",
]) {
  assert.ok(ciSource.includes(token), `CI workflow must include ${token}`);
}
assert.match(ciSource, /fail-on-severity:\s+high/, "dependency review must fail on high severity dependency changes");
assert.match(ciSource, /scorecard-results\.sarif/, "Scorecard results must be uploaded as SARIF");

for (const token of [
  "aquasecurity/trivy-action@",
  "image-ref: taskbridge:ci",
  "trivy-results.sarif",
  "github/codeql-action/upload-sarif",
]) {
  assert.ok(ciSource.includes(token), `CI Docker job must include ${token}`);
}
assert.match(releaseSource, /aquasecurity\/trivy-action@/, "release workflow must scan the backend Docker image before publishing");
assert.match(releaseSource, /severity:\s*'CRITICAL,HIGH'/, "release Docker scan must fail on high and critical findings");

for (const token of [
  "SECURITY.md",
  "dependency-review",
  "CodeQL",
  "Scorecard",
  "Trivy",
]) {
  assert.ok(pullRequestTemplateSource.includes(token), `PR template must mention ${token}`);
}

assert.match(scriptsReadmeSource, /check:security-governance/, "scripts README must document the security governance guard");
assert.match(localCheckSource, /check:security-governance/, "local verification must run the security governance guard");

console.log("security governance config passed");
