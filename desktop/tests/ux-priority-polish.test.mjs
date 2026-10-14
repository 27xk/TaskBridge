import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixtureFiles = [
  "desktop/scripts/check-ux-priority-polish.mjs",
  "desktop/scripts/script-helpers.mjs",
  "web/index.html",
  "web/app.js",
  "web/styles.css",
  "desktop/src/App.vue",
  "desktop/src/components/WorkspaceStatusBanner.vue",
  "desktop/src/views/TodayView.vue",
  "desktop/src/views/TaskView.vue",
  "desktop/src/views/LoginView.vue",
  "desktop/src/i18n.ts",
  "android/app/src/main/java/com/taskbridge/app/ui/login/LoginScreen.kt",
  "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt",
  "android/app/src/main/java/com/taskbridge/app/ui/editor/EditorScreen.kt",
  "android/app/src/main/java/com/taskbridge/app/ui/settings/SettingsScreen.kt",
  "README.md",
  "docs/user-quick-start.md",
  "desktop/README.md",
  "android/README.md",
];

for (const [name, lineEnding] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`priority UX checker accepts a clean ${name} checkout`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "taskbridge-ux-polish-"));
    t.after(() => {
      const cleanupDirectory = resolve(directory);
      assert.ok(isAbsolute(directory), "fixture cleanup must use an absolute path");
      assert.equal(dirname(cleanupDirectory), resolve(tmpdir()), "fixture cleanup must stay inside the temporary directory");
      assert.ok(basename(cleanupDirectory).startsWith("taskbridge-ux-polish-"), "fixture cleanup must retain its expected prefix");
      rmSync(cleanupDirectory, { recursive: true, force: true });
    });
    for (const relativePath of fixtureFiles) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      const target = join(directory, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source.replace(/\r\n?|\n/g, lineEnding));
    }

    const result = spawnSync(process.execPath, [join(directory, fixtureFiles[0])], {
      cwd: join(directory, "desktop"),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.match(result.stdout, /priority UX polish check passed/);
  });
}
