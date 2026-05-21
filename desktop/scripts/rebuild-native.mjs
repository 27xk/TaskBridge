import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const electronGypDir = join(process.cwd(), ".electron-gyp");
mkdirSync(electronGypDir, { recursive: true });

const lockfile = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8"));
const electronVersion = lockfile.packages?.["node_modules/electron"]?.version;
if (!electronVersion) {
  console.error("Cannot resolve Electron version from package-lock.json");
  process.exit(1);
}

const electronRebuild = join(process.cwd(), "node_modules", "@electron", "rebuild", "lib", "cli.js");
const result = spawnSync(process.execPath, [
  electronRebuild,
  "--version",
  electronVersion,
  "--module-dir",
  process.cwd(),
  "--force",
  "--only",
  "better-sqlite3",
], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    HOME: process.cwd(),
    USERPROFILE: process.cwd(),
  },
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
