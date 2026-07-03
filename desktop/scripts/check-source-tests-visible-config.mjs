import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const gitignoreSource = await readFile(resolve(repoRoot, ".gitignore"), "utf8");
const ignoredSourceTestPatterns = [/^tests\/$/m, /^\*\*\/tests\/$/m, /^backend\/tests\/$/m];
for (const pattern of ignoredSourceTestPatterns) {
  assert.doesNotMatch(
    gitignoreSource,
    pattern,
    `.gitignore must not hide source test directories with ${pattern}`,
  );
}

const requiredSourceTests = [
  "backend/tests/conftest.py",
  "backend/tests/test_sync.py",
  "backend/tests/test_maintenance.py",
  "backend/tests/test_cross_client_sync_smoke.py",
  "desktop/tests/quick-add-parser.test.mjs",
  "desktop/tests/task-ui-policy.test.mjs",
  "android/app/src/test/java/com/taskbridge/app/ui/task/TaskUiPolicyTest.kt",
  "web/tests/offline-core.test.mjs",
];

for (const relativePath of requiredSourceTests) {
  assert.ok(existsSync(resolve(repoRoot, relativePath)), `${relativePath} must exist`);
  const checkIgnore = spawnSync("git", ["check-ignore", "-q", relativePath], {
    cwd: repoRoot,
    stdio: "ignore",
    windowsHide: true,
  });
  assert.ifError(checkIgnore.error);
  assert.notEqual(
    checkIgnore.status,
    0,
    `${relativePath} is ignored by git; source tests must be visible to version control`,
  );
  assert.ok(
    checkIgnore.status === 1,
    `git check-ignore failed for ${relativePath} with status ${checkIgnore.status}`,
  );
}

console.log("source test visibility config passed");
