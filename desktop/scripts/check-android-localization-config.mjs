import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);
const [statusBarSource, i18nSource, editorSource, taskListSource, taskUiPolicySource] = await Promise.all([
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/components/SyncStatusBar.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/i18n/TaskBridgeI18n.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/editor/EditorScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskListScreen.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/ui/task/TaskUiPolicy.kt"), "utf8"),
]);

const mojibakeTokens = ["閺", "鐎", "瀹", "濮", "", "�"];
for (const token of mojibakeTokens) {
  assert.ok(!statusBarSource.includes(token), `SyncStatusBar.kt must not contain mojibake token ${token}`);
}

const expectedChineseMessages = [
  "本地缓存已就绪",
  "已完成，等待同步",
  "已恢复，等待同步",
  "已删除，等待同步",
  "已批量完成",
  "已批量删除",
  "已保留同步来的版本",
  "已排队保留这台设备版本",
  "已顺延到明天",
  "已稍后提醒",
  "已加入今日计划",
  "已移回收件箱",
  "正在同步",
];

for (const message of expectedChineseMessages) {
  assert.ok(statusBarSource.includes(message), `SyncStatusBar.kt must localize ${message}`);
}

assert.doesNotMatch(i18nSource, /优先级 0-5|Priority 0-5/, "Android priority field label must not expose numeric implementation hints");
assert.doesNotMatch(
  editorSource,
  /\(0\.\.5\)\.map\s*\{\s*AppUiOption\(it\.toString\(\),\s*it\.toString\(\)\)\s*\}/,
  "Android editor priority options must use localized labels instead of raw numbers",
);
for (const token of ["getTaskPriorityOptions", "getTaskPriorityLabel", "getSyncStatusLabel"]) {
  assert.ok(taskUiPolicySource.includes(token), `TaskUiPolicy.kt must expose ${token}`);
}
assert.ok(taskListSource.includes("getSyncStatusLabel("), "Android task subtitles must localize sync status labels");
assert.ok(!taskListSource.includes("syncStatus.wireName.takeIf"), "Android task subtitles must not expose raw sync wire names");
assert.ok(taskListSource.includes("Button(onClick = onAction)"), "Android empty task state must include a direct add action");

console.log("Android localization config passed");
