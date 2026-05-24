import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const config = JSON.parse(readFileSync(new URL("../electron-builder.json", import.meta.url), "utf8"));
const electronViteConfig = readFileSync(new URL("../electron.vite.config.ts", import.meta.url), "utf8");
const files = config.files ?? [];

assert.ok(Array.isArray(files), "electron-builder files must be an array");
assert.deepEqual(Object.keys(packageJson.dependencies ?? {}).sort(), ["better-sqlite3"], "desktop production dependencies should stay minimal");
assert.ok(!packageJson.dependencies?.vue, "vue should stay bundled at build time, not installed as a runtime dependency");
assert.ok(!packageJson.dependencies?.pinia, "pinia should stay bundled at build time, not installed as a runtime dependency");
assert.deepEqual(
  Object.keys(packageLock.packages?.[""]?.dependencies ?? {}).sort(),
  ["better-sqlite3"],
  "package-lock root production dependencies should stay minimal",
);
for (const name of ["electron-store", "conf", "dot-prop", "atomically", "ajv-formats"]) {
  assert.ok(!packageLock.packages?.[`node_modules/${name}`], `package-lock should not include removed runtime dependency ${name}`);
}
assert.deepEqual(config.electronLanguages, ["zh-CN", "en-US"], "desktop package should keep only zh-CN and en-US Electron locales");
assert.ok(config.asar === true, "desktop package should use asar");
assert.ok(config.asarUnpack?.includes("**/better_sqlite3.node"), "only the better-sqlite3 native binding should be unpacked");
assert.ok(!config.asarUnpack?.includes("**/*.node"), "do not unpack every native module by default");
assert.equal(config.nsis?.differentialPackage, false, "desktop release should not emit NSIS differential blockmaps");
assert.equal((electronViteConfig.match(/minify: "esbuild"/g) ?? []).length, 3, "desktop main, preload, and renderer builds should be minified");
assert.equal((electronViteConfig.match(/sourcemap: false/g) ?? []).length, 3, "desktop main, preload, and renderer builds should not emit sourcemaps");

const iconPath = new URL("../build/icon.ico", import.meta.url);
const iconSize = statSync(iconPath).size;
assert.ok(iconSize <= 130_000, `desktop icon should stay compact, got ${iconSize} bytes`);

const icon = readFileSync(iconPath);
const count = icon.readUInt16LE(4);
assert.equal(count, 4, "desktop icon should keep four icon sizes");
const sizes = [];
for (let i = 0; i < count; i += 1) {
  const offset = 6 + i * 16;
  const width = icon[offset] || 256;
  const height = icon[offset + 1] || 256;
  sizes.push(`${width}x${height}`);
}
assert.deepEqual(sizes, ["16x16", "32x32", "48x48", "256x256"], "desktop icon size set should stay compact");

for (const pattern of [
  "!**/node_modules/**/*.d.ts",
  "!**/node_modules/**/*.ts",
  "!**/node_modules/**/*.tsx",
  "!**/node_modules/**/*.c",
  "!**/node_modules/**/*.cc",
  "!**/node_modules/**/*.h",
  "!**/node_modules/.bin/**",
  "!**/node_modules/**/.editorconfig",
  "!**/node_modules/**/.npmignore",
  "!**/node_modules/**/*.md",
  "!**/node_modules/**/docs/**",
  "!**/node_modules/**/example/**",
  "!**/node_modules/**/coverage/**",
  "!**/node_modules/**/src/**",
  "!**/node_modules/**/test/**",
  "!**/node_modules/**/tests/**",
  "!**/node_modules/**/.github/**",
  "!**/node_modules/**/.vscode/**",
  "!**/node_modules/better-sqlite3/binding.gyp",
  "!**/node_modules/better-sqlite3/deps/**",
  "!**/node_modules/better-sqlite3/src/**",
  "!**/node_modules/better-sqlite3/build/Release/obj.target/**",
  "!**/node_modules/better-sqlite3/build/Release/test_extension.node",
  "!**/node_modules/better-sqlite3/build/Release/*.pdb",
  "!**/node_modules/prebuild-install/**",
  "!**/node_modules/base64-js/**",
  "!**/node_modules/bl/**",
  "!**/node_modules/buffer/**",
  "!**/node_modules/deep-extend/**",
  "!**/node_modules/end-of-stream/**",
  "!**/node_modules/expand-template/**",
  "!**/node_modules/fs-constants/**",
  "!**/node_modules/ieee754/**",
  "!**/node_modules/inherits/**",
  "!**/node_modules/ini/**",
  "!**/node_modules/minimist/**",
  "!**/node_modules/once/**",
  "!**/node_modules/pump/**",
  "!**/node_modules/rc/**",
  "!**/node_modules/readable-stream/**",
  "!**/node_modules/safe-buffer/**",
  "!**/node_modules/string_decoder/**",
  "!**/node_modules/strip-json-comments/**",
  "!**/node_modules/tunnel-agent/**",
  "!**/node_modules/util-deprecate/**",
  "!**/node_modules/wrappy/**",
  "!**/node_modules/node-abi/**",
  "!**/node_modules/tar-fs/**",
  "!**/node_modules/tar-stream/**",
]) {
  assert.ok(files.includes(pattern), `desktop package should exclude ${pattern}`);
}

console.log("desktop package size config ok");
