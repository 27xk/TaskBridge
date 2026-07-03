import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  packageSource,
  requirementsDevSource,
  ciSource,
  releaseSource,
  localCheckSource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, "backend/requirements-dev.txt"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
]);

const packageJson = JSON.parse(packageSource);

assert.equal(
  typeof packageJson.scripts?.["check:supply-chain"],
  "string",
  "desktop/package.json must expose check:supply-chain",
);
assert.match(requirementsDevSource, /^pip-audit[<>=~!.,0-9a-zA-Z-]+/m, "backend dev dependencies must include pip-audit");
assert.match(ciSource, /python -m pip_audit -r requirements-dev\.txt/, "CI must audit Python dependencies");
assert.match(ciSource, /npm audit --audit-level=high/, "CI must audit npm dependencies");
assert.match(releaseSource, /npm audit --audit-level=high/, "release workflow must audit npm dependencies before packaging");
assert.match(releaseSource, /python -m pip_audit -r requirements-dev\.txt/, "release workflow must audit backend dependencies");
assert.match(releaseSource, /attest-build-provenance@v2/, "release workflow must attest build provenance for artifacts");
assert.match(releaseSource, /attestations:\s*write/, "release workflow must request attestation write permission");
assert.match(releaseSource, /id-token:\s*write/, "release workflow must request OIDC permission for attestations");
assert.match(releaseSource, /sbom:\s*true/, "Docker release build must emit an SBOM");
assert.match(releaseSource, /provenance:\s*mode=max/, "Docker release build must emit max provenance");
assert.match(localCheckSource, /check:supply-chain/, "local verification must run the supply-chain config check");

console.log("supply chain config check passed");
