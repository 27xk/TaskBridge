import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { workspaceRoot } from "./script-helpers.mjs";

const root = workspaceRoot(import.meta.url);
const targets = [
  "out",
  "release",
  ".tmp-electron-user-data",
  ".vite",
  ".vite-cache",
  ".cache",
  ".electron-vite",
  ".electron-gyp",
  ".npm-cache",
];
const dryRun = process.argv.includes("--dry-run");

if (process.argv.includes("--all")) {
  targets.push("node_modules");
}

function safeTarget(name) {
  const target = resolve(root, name);
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to remove outside desktop: ${target}`);
  }
  return target;
}

for (const name of targets) {
  const target = safeTarget(name);
  if (dryRun) {
    console.log(`[clean] would remove ${target}`);
    continue;
  }
  await rm(target, { recursive: true, force: true });
  console.log(`[clean] removed ${name}`);
}
