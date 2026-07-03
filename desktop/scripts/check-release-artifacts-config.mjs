import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [packageSource, releaseSource, releaseDocsSource, scriptsReadmeSource, localCheckSource] = await Promise.all([
  readFile(resolve(desktopRoot, "package.json"), "utf8"),
  readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(resolve(repoRoot, "docs/github-release.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/README.md"), "utf8"),
  readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
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
]) {
  assert.match(releaseSource, new RegExp(escapeRegExp(token)), `release workflow must include ${token}`);
}

assert.match(releaseDocsSource, /SHA256SUMS\.txt/, "release docs must document checksum artifacts");
assert.match(scriptsReadmeSource, /check:release-artifacts/, "scripts README must list the release artifacts guard");
assert.match(localCheckSource, /check:release-artifacts/, "local check runner must include the release artifacts guard");

console.log("release artifacts config check passed");
