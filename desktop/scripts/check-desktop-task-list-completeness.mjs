import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { workspaceRoot } from "./script-helpers.mjs";

const desktopRoot = workspaceRoot(import.meta.url);
const [
  taskDaoSource,
  taskStoreSource,
  taskViewSource,
  todayViewSource,
  taskEditorSource,
  taskItemSource,
  floatingTaskItemSource,
  taskUiPolicySource,
] = await Promise.all([
  readFile(resolve(desktopRoot, "renderer/db/task.dao.ts"), "utf8"),
  readFile(resolve(desktopRoot, "renderer/stores/task.ts"), "utf8"),
  readFile(resolve(desktopRoot, "renderer/views/TaskView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "renderer/views/TodayView.vue"), "utf8"),
  readFile(resolve(desktopRoot, "renderer/components/TaskEditor.vue"), "utf8"),
  readFile(resolve(desktopRoot, "renderer/components/TaskItem.vue"), "utf8"),
  readFile(resolve(desktopRoot, "renderer/components/FloatingTaskItem.vue"), "utf8"),
  readFile(resolve(desktopRoot, "common/task-ui-policy.ts"), "utf8"),
]);

// Exercise SQLite pagination and the rendered list contract; a larger hard limit is not completeness.
execFileSync(process.execPath, ["--test", "tests/task-data-remediation.test.mjs", "tests/task-list-remediation.test.mjs"], {
  cwd: desktopRoot, stdio: "inherit", windowsHide: true,
});
for (const [viewName, source] of [
  ["TaskView", taskViewSource],
  ["TodayView", todayViewSource],
]) {
  assert.match(
    source,
    /getTaskActionConfirmationMessage/,
    `${viewName} must use the shared delete confirmation policy`,
  );
  assert.match(source, /async function deleteTask\(task: TaskListItem\): Promise<void>/, `${viewName} must wrap task deletion`);
  assert.match(source, /@delete="deleteTask"/, `${viewName} task rows must call the delete wrapper`);
  assert.doesNotMatch(
    source,
    /@delete="taskStore\.deleteTask"/,
    `${viewName} task rows must not delete directly without confirmation`,
  );
  assert.match(
    source,
    /class="empty-state empty-state-action"/,
    `${viewName} empty state must include a direct action layout`,
  );
  assert.match(source, /@click="openCreate"/, `${viewName} empty state action must open the task editor`);
  assert.doesNotMatch(
    source,
    /<p v-if="[^"]*(?:filteredTasks|openTodayTasks)[^"]*" class="empty-state"/,
    `${viewName} empty state must not be a passive paragraph`,
  );
}

assert.match(taskUiPolicySource, /getTaskPriorityLabel/, "desktop task UI policy must expose user-facing priority labels");
assert.match(taskUiPolicySource, /getTaskPriorityOptions/, "desktop task UI policy must expose user-facing priority options");
assert.doesNotMatch(
  taskEditorSource,
  /const priorityOptions = \[0, 1, 2, 3, 4, 5\];/,
  "desktop task editor must not expose raw priority numbers as choices",
);
assert.match(
  taskEditorSource,
  /getTaskPriorityOptions\(settingsStore\.language\)/,
  "desktop task editor must render localized priority options",
);
assert.match(
  taskItemSource,
  /getTaskPriorityLabel\(task\.priority, settingsStore\.language\)/,
  "desktop task item must render localized priority labels",
);
assert.doesNotMatch(
  taskItemSource,
  /\{\{\s*settingsStore\.t\("task\.priority"\)\s*\}\}\s*\{\{\s*task\.priority\s*\}\}/,
  "desktop task item must not render raw priority numbers",
);
assert.match(
  floatingTaskItemSource,
  /getTaskPriorityLabel\(props\.task\.priority, settingsStore\.language\)/,
  "desktop floating task item must render localized priority labels",
);
assert.doesNotMatch(
  floatingTaskItemSource,
  /\bP[0-5]\b|`P\$\{value\}`/,
  "desktop floating task item must not expose raw priority codes",
);

console.log("Desktop task list completeness config passed");
