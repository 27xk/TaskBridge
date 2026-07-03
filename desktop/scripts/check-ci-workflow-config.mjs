import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [packageSource, ciSource, releaseSource, nodeVersionSource, rootPackageSource] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, ".node-version"), "utf8"),
  readFile(resolve(repoRoot, "package.json"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);
const rootPackageJson = JSON.parse(rootPackageSource);
const requiredDesktopChecks = [
  "check:lockfile-registry",
  "check:desktop-endpoint-config",
  "check:security-config",
  "check:auth-session-config",
  "check:backend-observability",
  "check:package-size-config",
  "test:unit",
  "check:quick-add-parser",
  "check:task-order",
  "check:sync-push",
  "check:sync-diagnostics",
  "check:sync-recovery-center",
  "check:desktop-backup",
  "check:desktop-theme",
  "check:desktop-docs",
  "check:local-bootstrap",
  "check:release-readiness",
  "check:release-artifacts",
  "check:production-hardening",
  "check:desktop-task-list-completeness",
  "check:android-localization",
  "check:android-task-delete-confirmation",
  "check:refresh-singleflight",
  "check:registration-governance",
  "check:sync-retry-preservation",
  "check:android-list-realtime",
  "check:release-endpoint-defaults",
  "check:android-sync-status-message",
  "check:android-sync-recovery",
  "check:ci-workflows",
  "check:contract-drift",
  "check:source-tests-visible",
  "check:supply-chain",
  "check:desktop-auto-update",
  "check:android-data-extraction",
  "check:security-governance",
];

for (const script of requiredDesktopChecks) {
  assert.equal(
    typeof packageJson.scripts?.[script],
    "string",
    `desktop/package.json must define ${script}`,
  );
}

for (const [workflowName, source] of [
  ["CI", ciSource],
  ["release", releaseSource],
]) {
  assert.match(source, /working-directory:\s+desktop/, `${workflowName} workflow must have a desktop job`);
  for (const script of requiredDesktopChecks) {
    assert.ok(
      source.includes(`npm run ${script}`),
      `${workflowName} workflow desktop job must run ${script}`,
    );
  }
}

assert.match(ciSource, /npm run build/, "CI desktop job must still build the app after checks");
assert.match(releaseSource, /npm run dist/, "release desktop job must still produce the installer after checks");
assert.match(nodeVersionSource.trim(), /^22\./, ".node-version must pin the repository to Node.js 22");
assert.match(packageJson.engines?.node ?? "", />=22\.12\.0 <24/, "desktop package must declare the supported Node.js range");
assert.match(rootPackageJson.engines?.node ?? "", />=22\.12\.0 <24/, "root package must declare the supported Node.js range");
assert.match(rootPackageJson.packageManager ?? "", /^npm@/, "root package must pin the npm package manager");
assert.equal(
  rootPackageJson.scripts?.["test:web"],
  'node --test "web/tests/**/*.test.mjs"',
  "root package must expose Web/PWA unit tests",
);
assert.match(ciSource, /check-version-source\.mjs/, "CI workflow must run the repository version source guard");
assert.match(releaseSource, /check-version-source\.mjs/, "release workflow must run the repository version source guard");
assert.match(ciSource, /npm --prefix \.\. run test:web/, "CI workflow must run Web/PWA unit tests");
assert.match(releaseSource, /npm --prefix \.\. run test:web/, "release workflow must run Web/PWA unit tests");
assert.match(
  ciSource,
  /TASKBRIDGE_SKIP_NATIVE_REBUILD:\s*"1"/,
  "CI desktop npm ci must skip Electron native rebuild",
);
assert.match(
  releaseSource,
  /TASKBRIDGE_SKIP_NATIVE_REBUILD:\s*"1"/,
  "release desktop npm ci must skip Electron native rebuild",
);
assert.match(releaseSource, /Release version must match VERSION/, "release workflow must reject tags that do not match VERSION");
assert.match(ciSource, /^\s+android:\s*$/m, "CI workflow must include an Android job");
assert.match(ciSource, /runs-on:\s+ubuntu-latest[\s\S]*working-directory:\s+android/, "CI Android job must run from android/");
assert.match(ciSource, /gradle\/actions\/setup-gradle@v4/, "CI Android job must use Gradle cache setup");
assert.match(ciSource, /\.\/gradlew testDebugUnitTest/, "CI Android job must run Android unit tests online");
assert.match(ciSource, /\.\/gradlew :app:assembleDebug/, "CI Android job must assemble a debug APK");
assert.match(releaseSource, /^\s+android:\s*$/m, "release workflow must include an Android release job");
assert.match(releaseSource, /\.\/gradlew testReleaseUnitTest/, "release workflow must run Android release unit tests");
assert.match(releaseSource, /apksigner[\s\S]*verify/, "release workflow must verify Android APK signatures");
assert.match(ciSource, /python -m pytest tests -q/, "CI backend job must always run backend tests");
assert.match(
  ciSource,
  /python -m pytest tests\/test_migrations\.py -q/,
  "CI backend job must run database migration smoke tests",
);
assert.match(ciSource, /python -m compileall -q app tests tools/, "CI backend job must compile app, tests, and tools together");
assert.match(ciSource, /python -m tools\.openapi_contract --check/, "CI backend job must verify the runtime OpenAPI contract snapshot");
assert.match(ciSource, /python -m ruff check app tests tools/, "CI backend job must run ruff on app, tests, and tools");
assert.match(releaseSource, /python -m pytest tests -q/, "release workflow must run backend tests before publishing artifacts");
assert.match(
  releaseSource,
  /python -m pytest tests\/test_migrations\.py -q/,
  "release workflow must run database migration smoke tests before publishing artifacts",
);
assert.match(
  releaseSource,
  /python -m tools\.openapi_contract --check/,
  "release workflow must verify the runtime OpenAPI contract before publishing artifacts",
);
assert.match(
  releaseSource,
  /python -m compileall -q app tests tools/,
  "release workflow must compile backend app, tests, and tools before publishing artifacts",
);
assert.match(
  releaseSource,
  /python -m ruff check app tests tools/,
  "release workflow must lint backend app, tests, and tools before publishing artifacts",
);
assert.doesNotMatch(
  ciSource,
  /No backend\/tests directory in this checkout; skipping backend tests\./,
  "CI backend job must fail when backend tests are missing instead of silently skipping them",
);
assertDesktopCheckOrder("CI", ciSource, "npm run build");
assertDesktopCheckOrder("release", releaseSource, "npm run dist");

console.log("CI workflow desktop check coverage passed");

function assertDesktopCheckOrder(workflowName, source, terminalCommand) {
  const installIndex = source.indexOf("npm ci");
  const terminalIndex = source.indexOf(terminalCommand);
  const webUnitTestIndex = source.indexOf("npm --prefix .. run test:web");
  assert.ok(installIndex >= 0, `${workflowName} workflow desktop job must install dependencies with npm ci`);
  assert.ok(terminalIndex > installIndex, `${workflowName} workflow must run ${terminalCommand} after npm ci`);
  assert.ok(
    webUnitTestIndex > installIndex && webUnitTestIndex < terminalIndex,
    `${workflowName} workflow must run Web/PWA unit tests after npm ci and before ${terminalCommand}`,
  );

  const lockfileIndex = source.indexOf("npm run check:lockfile-registry");
  assert.ok(
    lockfileIndex >= 0 && lockfileIndex < installIndex,
    `${workflowName} workflow must verify lockfile registry metadata before npm ci`,
  );

  for (const script of requiredDesktopChecks.filter((script) => script !== "check:lockfile-registry")) {
    const scriptIndex = source.indexOf(`npm run ${script}`);
    assert.ok(
      scriptIndex > installIndex && scriptIndex < terminalIndex,
      `${workflowName} workflow must run ${script} after npm ci and before ${terminalCommand}`,
    );
  }
}
