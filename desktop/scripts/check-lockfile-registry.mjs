import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const packages = lock.packages ?? {};

for (const [path, entry] of Object.entries(packages)) {
  if (!entry?.resolved || !entry.version) continue;
  const match = entry.resolved.match(/\/([^/]+)-(\d+\.\d+\.\d+(?:[-\w.]+)?)\.tgz$/);
  assert.ok(!match || match[2] === entry.version, `${path} resolved tarball version does not match package version`);
}

for (const marker of [
  "imurmurhash-0.1.6.tgz",
  "@swc/counter/-/counter-0.1.4.tgz",
]) {
  for (const [path, entry] of Object.entries(packages)) {
    assert.ok(!entry?.resolved?.includes(marker), `${path} points at known missing npm tarball ${marker}`);
  }
}

const imurmurhash = packages["node_modules/imurmurhash"];
if (imurmurhash) {
  assert.equal(imurmurhash.version, "0.1.4", "imurmurhash must stay on the published 0.1.4 release");
  assert.ok(
    imurmurhash.resolved?.endsWith("/imurmurhash-0.1.4.tgz"),
    "imurmurhash must resolve to the published 0.1.4 tarball",
  );
}

const uniqueSlugDeps = packages["node_modules/unique-slug"]?.dependencies;
if (uniqueSlugDeps?.imurmurhash) {
  assert.equal(uniqueSlugDeps.imurmurhash, "^0.1.4", "unique-slug must depend on the published imurmurhash range");
}

assert.ok(!packages["node_modules/@swc/counter"], "package-lock must not include the unpublished @swc/counter package");

console.log("lockfile registry check passed");
