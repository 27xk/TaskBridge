import assert from "node:assert/strict";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const {
  getTaskActionConfirmationMessage,
  getTaskListTypeLabel,
  getTaskPriorityLabel,
  getTaskPriorityOptions,
  getTaskRepeatRuleLabel,
  shouldConfirmTaskAction,
} = await loadTsModule(
  "shared/task-ui-policy.ts",
);

test("task delete actions require explicit user confirmation", () => {
  assert.equal(shouldConfirmTaskAction("delete"), true);
  assert.equal(shouldConfirmTaskAction("complete"), false);
  assert.equal(shouldConfirmTaskAction("restore"), false);
});

test("delete confirmation explains that the task goes to the recycle bin", () => {
  assert.equal(
    getTaskActionConfirmationMessage("delete", "Write launch notes", "zh-CN"),
    "确认删除「Write launch notes」？删除后可以在回收站恢复。",
  );
  assert.equal(
    getTaskActionConfirmationMessage("delete", "Write launch notes", "en-US"),
    'Delete "Write launch notes"? You can restore it from the recycle bin.',
  );
  assert.equal(getTaskActionConfirmationMessage("restore", "Write launch notes", "zh-CN"), null);
});

test("task priority labels are user-facing", () => {
  assert.equal(getTaskPriorityLabel(0, "zh-CN"), "无优先级");
  assert.equal(getTaskPriorityLabel(3, "zh-CN"), "高");
  assert.equal(getTaskPriorityLabel(5, "zh-CN"), "最高");
  assert.equal(getTaskPriorityLabel(0, "en-US"), "None");
  assert.equal(getTaskPriorityLabel(3, "en-US"), "High");
  assert.equal(getTaskPriorityLabel(5, "en-US"), "Highest");
});

test("task priority options hide raw implementation numbers", () => {
  assert.deepEqual(getTaskPriorityOptions("zh-CN"), [
    { value: 0, label: "无优先级" },
    { value: 1, label: "低" },
    { value: 2, label: "中" },
    { value: 3, label: "高" },
    { value: 4, label: "紧急" },
    { value: 5, label: "最高" },
  ]);
});

test("task repeat rule labels hide raw implementation values", () => {
  assert.equal(getTaskRepeatRuleLabel("daily", "zh-CN"), "每天");
  assert.equal(getTaskRepeatRuleLabel("weekly", "zh-CN"), "每周");
  assert.equal(getTaskRepeatRuleLabel("monthly", "zh-CN"), "每月");
  assert.equal(getTaskRepeatRuleLabel("daily", "en-US"), "Daily");
  assert.equal(getTaskRepeatRuleLabel("unknown-rule", "zh-CN"), "unknown-rule");
});

test("task list type labels hide raw implementation values", () => {
  assert.equal(getTaskListTypeLabel("inbox", "zh-CN"), "收件箱");
  assert.equal(getTaskListTypeLabel("today", "zh-CN"), "今日");
  assert.equal(getTaskListTypeLabel("inbox", "en-US"), "Inbox");
  assert.equal(getTaskListTypeLabel("today", "en-US"), "Today");
  assert.equal(getTaskListTypeLabel("custom-list", "zh-CN"), "custom-list");
});
