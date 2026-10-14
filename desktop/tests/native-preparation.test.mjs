import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rebuildScript = fileURLToPath(new URL("../scripts/rebuild-native.mjs", import.meta.url));

function fixture(t, installExit = 0) {
  const directory = mkdtempSync(join(tmpdir(), "taskbridge-native-preparation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "node_modules/electron"), { recursive: true });
  mkdirSync(join(directory, "node_modules/@electron/rebuild/lib"), { recursive: true });
  writeFileSync(join(directory, "package-lock.json"), JSON.stringify({
    packages: { "node_modules/electron": { version: "42.11.13" } },
  }));
  writeFileSync(join(directory, "node_modules/electron/install.js"), `
    const fs = require("node:fs");
    fs.appendFileSync("events.txt", "install\\n");
    if (${installExit}) process.exit(${installExit});
    fs.writeFileSync("runtime-ready", "42.11.13");
  `);
  writeFileSync(join(directory, "node_modules/@electron/rebuild/lib/cli.js"), `
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    assert.equal(fs.readFileSync("runtime-ready", "utf8"), "42.11.13");
    assert.equal(process.argv[process.argv.indexOf("--version") + 1], "42.11.13");
    fs.appendFileSync("events.txt", "rebuild\\n");
  `);
  return {
    run(skip = false) {
      return spawnSync(process.execPath, [rebuildScript], {
        cwd: directory,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
        env: { ...process.env, TASKBRIDGE_SKIP_NATIVE_REBUILD: skip ? "1" : "0" },
      });
    },
    events() { return readFileSync(join(directory, "events.txt"), "utf8"); },
  };
}

test("native preparation installs the Electron runtime before rebuilding SQLite", (t) => {
  const h = fixture(t);
  const result = h.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(h.events(), "install\nrebuild\n");
});

test("a failed Electron runtime installation stops native preparation", (t) => {
  const h = fixture(t, 23);
  const result = h.run();
  assert.equal(result.status, 23, result.stderr);
  assert.equal(h.events(), "install\n");
});

test("the npm ci skip flag postpones both runtime installation and native rebuilding", (t) => {
  const h = fixture(t);
  const result = h.run(true);
  assert.equal(result.status, 0, result.stderr);
  assert.throws(() => h.events(), { code: "ENOENT" });
});
