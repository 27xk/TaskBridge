import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFile(resolve(repoRoot, relativePath), "utf8");
}

const [
  versionSource,
  rootPackageSource,
  desktopPackageSource,
  backendPyprojectSource,
  backendConfigSource,
  androidBuildSource,
  webIndexSource,
  readmeSource,
  developmentDocSource,
  backendEnvExampleSource,
  backendDockerEnvExampleSource,
  deployEnvExampleSource,
  deployLocalEnvExampleSource,
  ciSource,
  releaseSource,
] = await Promise.all([
  read("VERSION"),
  read("package.json"),
  read("desktop/package.json"),
  read("backend/pyproject.toml"),
  read("backend/app/core/config.py"),
  read("android/app/build.gradle.kts"),
  read("web/index.html"),
  read("README.md"),
  read("docs/development.md"),
  read("backend/.env.example"),
  read("backend/.env.docker.example"),
  read("deploy/.env.example"),
  read("deploy/.env.local.example"),
  read(".github/workflows/ci.yml"),
  read(".github/workflows/release.yml"),
]);

const version = versionSource.trim();
assert.match(version, /^\d+\.\d+\.\d+$/, "VERSION must contain a plain semver value such as 0.1.6");

const rootPackage = JSON.parse(rootPackageSource);
const desktopPackage = JSON.parse(desktopPackageSource);
assert.equal(rootPackage.version, version, "root package.json version must match VERSION");
assert.equal(desktopPackage.version, version, "desktop/package.json version must match VERSION");

assert.match(
  backendPyprojectSource,
  new RegExp(`^version = "${version}"$`, "m"),
  "backend/pyproject.toml version must match VERSION",
);
assert.match(
  backendConfigSource,
  new RegExp(`app_version: str = "${version}"`),
  "backend runtime app_version must match VERSION",
);
assert.match(
  androidBuildSource,
  new RegExp(`versionName = "${version}"`),
  "Android versionName must match VERSION",
);
assert.match(
  webIndexSource,
  new RegExp(`name="taskbridge-version" content="${version}"`),
  "Web meta taskbridge-version must match VERSION",
);

assert.match(
  readmeSource,
  /docs\/development\.md/,
  "README.md must link to the developer verification guide",
);

for (const [name, source] of [
  ["docs/development.md", developmentDocSource],
  [".github/workflows/ci.yml", ciSource],
  [".github/workflows/release.yml", releaseSource],
]) {
  assert.match(source, /check-version-source\.mjs/, `${name} must run or document the version source guard`);
}

for (const [name, source] of [
  ["backend/.env.example", backendEnvExampleSource],
  ["backend/.env.docker.example", backendDockerEnvExampleSource],
  ["deploy/.env.example", deployEnvExampleSource],
  ["deploy/.env.local.example", deployLocalEnvExampleSource],
]) {
  assert.match(source, new RegExp(`^APP_VERSION=${version}$`, "m"), `${name} APP_VERSION must match VERSION`);
}

assert.match(
  releaseSource,
  /Release version must match VERSION/,
  "release workflow must reject tags that do not match VERSION",
);

console.log(`version source check passed: ${version}`);
