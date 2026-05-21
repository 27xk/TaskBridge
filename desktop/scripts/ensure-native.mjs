import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const sqliteBinding = join(
  process.cwd(),
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);

if (existsSync(sqliteBinding)) {
  process.exit(0);
}

console.error("[TaskBridge] better-sqlite3 native binding is missing.");
console.error("[TaskBridge] Rebuilding native dependencies for Electron...");

const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "rebuild-native.mjs")], {
  stdio: "inherit",
  shell: false,
});

if (result.status === 0 && existsSync(sqliteBinding)) {
  process.exit(0);
}

console.error("");
console.error("[TaskBridge] Failed to prepare better-sqlite3.");
console.error("[TaskBridge] Please run `npm run rebuild:native` in the desktop directory after network access is available.");
console.error("[TaskBridge] If npm was run with `--ignore-scripts`, run `npm run rebuild:native` manually.");
process.exit(result.status ?? 1);
