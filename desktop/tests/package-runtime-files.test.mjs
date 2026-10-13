import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertPackagedRuntimeFiles } from "../scripts/package-runtime-files.mjs";

const config = JSON.parse(readFileSync(new URL("../electron-builder.json", import.meta.url), "utf8"));

test("package filters retain the installed production startup dependency graph and native addon", () => {
  const files = assertPackagedRuntimeFiles(config);
  assert.ok(files.includes("node_modules/debug/src/index.js"));
  assert.ok(files.includes("node_modules/debug/src/node.js"));
  assert.ok(files.includes("node_modules/better-sqlite3/build/Release/better_sqlite3.node"));
});

test("package validation rejects removal of a transitive executable module after its package entry", () => {
  assert.throws(() => assertPackagedRuntimeFiles({
    ...config,
    files: [...config.files.filter((pattern) => pattern !== "!**/node_modules/**/src/**"), "!**/node_modules/debug/src/node.js"],
  }), /packaging filter excludes startup dependency: node_modules\/debug\/src\/node\.js/);
});
