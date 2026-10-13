import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { getNodeModuleFileMatcher } = require("app-builder-lib/out/fileMatcher.js");
const desktopRoot = fileURLToPath(new URL("../", import.meta.url));

export function assertPackagedRuntimeFiles(config, root = desktopRoot) {
  const runtimeRequire = createRequire(resolve(root, "package.json"));
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const matcher = getNodeModuleFileMatcher(root, root, (value) => value, config.win ?? {}, {
    config,
    debugLogger: { isEnabled: false },
  });
  const accepts = matcher.createFilter();
  const visited = new Set();
  const files = new Set();

  function visit(module) {
    if (!module || visited.has(module.filename)) return;
    visited.add(module.filename);
    const name = relative(root, module.filename);
    if (name.startsWith(`node_modules${sep}`)) files.add(module.filename);
    for (const child of module.children) visit(child);
  }

  for (const name of Object.keys(manifest.dependencies ?? {})) {
    const entry = runtimeRequire.resolve(name);
    // Import the installed production modules and follow the actual startup dependency graph.
    // Do not construct a database or updater, so this check has no native ABI or network side effects.
    runtimeRequire(entry);
    visit(runtimeRequire.cache[entry]);
    files.add(runtimeRequire.resolve(`${name}/package.json`));
  }
  // better-sqlite3 loads its binding helper and native addon lazily in the constructor.
  const sqliteEntry = runtimeRequire.resolve("better-sqlite3");
  const bindingEntry = runtimeRequire.resolve("bindings", { paths: [dirname(sqliteEntry)] });
  runtimeRequire(bindingEntry);
  visit(runtimeRequire.cache[bindingEntry]);
  files.add(runtimeRequire.resolve("better-sqlite3/build/Release/better_sqlite3.node"));

  assert.ok(files.size > 0, "the production startup graph must contain runtime files");
  for (const file of files) {
    const name = relative(root, file).split(sep).join("/");
    assert.ok(accepts(file, statSync(file)), `packaging filter excludes startup dependency: ${name}`);
  }
  return [...files].map((file) => relative(root, file).split(sep).join("/")).sort();
}
