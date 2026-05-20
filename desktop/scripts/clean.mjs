import { rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["out", "release", ".tmp-electron-user-data", ".vite", ".cache", ".electron-vite"];
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
