import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [bootstrapSource, localCheckSource, scriptsReadmeSource, rootReadmeSource, packageSource] =
  await Promise.all([
    readFile(resolve(repoRoot, "scripts/bootstrap-local.ps1"), "utf8"),
    readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
    readFile(resolve(repoRoot, "scripts/README.md"), "utf8"),
    readFile(resolve(repoRoot, "README.md"), "utf8"),
    readFile(resolve(desktopRoot, "package.json"), "utf8"),
  ]);

for (const token of [
  "python -m pip install -r backend\\requirements-dev.txt",
  "npm ci",
  "gradlew.bat --version",
  ":app:dependencies --configuration debugUnitTestRuntimeClasspath",
  ":app:dependencies --configuration debugRuntimeClasspath",
  "gradlew.bat testDebugUnitTest :app:assembleDebug",
]) {
  assert.match(bootstrapSource, new RegExp(escapeRegExp(token)), `bootstrap script must include ${token}`);
}

assert.match(
  localCheckSource,
  /bootstrap-local\.ps1/,
  "local verification must point blocked developers to the bootstrap script",
);
assert.match(
  localCheckSource,
  /\[switch\]\$ReportOnly/,
  "local verification must expose -ReportOnly for non-failing dependency audits",
);
assert.match(
  localCheckSource,
  /\[switch\]\$BootstrapMissing/,
  "local verification must expose -BootstrapMissing for one-command dependency bootstrap and verification",
);
assert.match(
  localCheckSource,
  /bootstrap-local\.ps1[\s\S]*bootstrapArgs/,
  "local verification must be able to call bootstrap-local.ps1 when -BootstrapMissing is requested",
);
assert.match(
  localCheckSource,
  /\$failed\.Count -gt 0 -or \(\$blocked\.Count -gt 0 -and -not \$ReportOnly\)/,
  "local verification must fail blocked checks by default",
);
assert.match(
  scriptsReadmeSource,
  /bootstrap-local\.ps1/,
  "scripts README must document the bootstrap workflow",
);
assert.match(
  scriptsReadmeSource,
  /-ReportOnly/,
  "scripts README must document report-only local verification",
);
assert.match(
  scriptsReadmeSource,
  /-BootstrapMissing/,
  "scripts README must document bootstrap-and-verify local verification",
);
assert.match(rootReadmeSource, /bootstrap-local\.ps1/, "root README must mention local bootstrap");
assert.match(rootReadmeSource, /-ReportOnly/, "root README must document report-only local verification");
assert.match(rootReadmeSource, /-BootstrapMissing/, "root README must document bootstrap-and-verify local verification");
assert.match(packageSource, /check:local-bootstrap/, "package scripts must expose the local bootstrap check");

console.log("local bootstrap config check passed");
