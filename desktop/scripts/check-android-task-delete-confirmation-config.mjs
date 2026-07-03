import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const policyPath = resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskUiPolicy.kt");
const policyTestPath = resolve(repoRoot, "android/app/src/test/java/com/taskbridge/app/ui/task/TaskUiPolicyTest.kt");

assert.ok(existsSync(policyPath), "Android task UI policy must exist");
assert.ok(existsSync(policyTestPath), "Android task UI policy test must exist");

const [taskListSource, policySource, policyTestSource, packageSource, localCheckSource, ciSource, releaseSource] =
  await Promise.all([
    readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"), "utf8"),
    readFile(policyPath, "utf8"),
    readFile(policyTestPath, "utf8"),
    readFile(resolve(desktopRoot, "package.json"), "utf8"),
    readFile(resolve(repoRoot, "scripts/check-local.ps1"), "utf8"),
    readFile(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8"),
    readFile(resolve(repoRoot, ".github/workflows/release.yml"), "utf8"),
  ]);

assert.match(
  policySource,
  /enum class TaskUiAction[\s\S]*Delete/,
  "Android task UI policy must model destructive task actions explicitly",
);
assert.match(
  policySource,
  /fun shouldConfirmTaskAction\(action: TaskUiAction\): Boolean[\s\S]*TaskUiAction\.Delete/,
  "Android task UI policy must require confirmation for delete actions",
);
assert.match(
  policySource,
  /fun getDeleteConfirmationMessage\([\s\S]*recycle bin/,
  "Android task UI policy must explain that deleted tasks can be restored",
);
assert.match(
  policyTestSource,
  /deleteActionsRequireExplicitConfirmation[\s\S]*deleteConfirmationExplainsRecycleBin/,
  "Android task UI policy tests must cover confirmation and restore wording",
);
assert.match(
  taskListSource,
  /var pendingDeleteTask by remember \{ mutableStateOf<Task\?>\(null\) \}/,
  "TaskListScreen must keep the pending delete task instead of deleting immediately",
);
assert.match(taskListSource, /AlertDialog\(/, "TaskListScreen must render a delete confirmation dialog");
assert.match(
  taskListSource,
  /onDelete = \{ pendingDeleteTask = task \}/,
  "Task rows must open the delete confirmation dialog",
);
assert.doesNotMatch(
  taskListSource,
  /onDelete = \{ viewModel\.delete\(task\.localId\) \}/,
  "Task rows must not call viewModel.delete directly from the delete button",
);
assert.match(
  taskListSource,
  /viewModel\.delete\(task\.localId\)[\s\S]*pendingDeleteTask = null/,
  "Confirmed delete must call viewModel.delete and clear pending delete state",
);
assert.match(
  taskListSource,
  /DropdownMenuItem\([\s\S]*text = \{ Text\(strings\.snoozeOneHour\) \}[\s\S]*onSnooze\(\)/,
  "Task rows must label snooze as one hour instead of an ambiguous later action",
);
assert.match(packageSource, /check:android-task-delete-confirmation/, "desktop package scripts must expose Android delete confirmation check");
assert.match(localCheckSource, /check:android-task-delete-confirmation/, "local check runner must include Android delete confirmation check");
assert.match(ciSource, /npm run check:android-task-delete-confirmation/, "CI workflow must run Android delete confirmation check");
assert.match(releaseSource, /npm run check:android-task-delete-confirmation/, "release workflow must run Android delete confirmation check");

console.log("Android task delete confirmation config passed");
