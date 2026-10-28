import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";
import { loadVueComponent } from "./helpers/load-vue-component.mjs";
import { loadTsFunctions } from "./helpers/load-ts-functions.mjs";

const { formatTaskDate, getTaskSchedulePresentation } = loadElectronModule("renderer/utils/task-presentation.ts");
const now = "2026-10-14T12:00:00Z";
const options = { language: "zh-CN", timeZone: "Asia/Shanghai", now };
const require = createRequire(import.meta.url);
const { createSSRApp } = require("vue");
const { renderToString } = require("@vue/server-renderer");
const { translate } = loadElectronModule("renderer/i18n.ts");

test("task dates compare calendar days in the selected display time zone", () => {
  const value = "2026-10-14T23:00:00Z";
  const shanghai = formatTaskDate(value, { ...options, includeTime: true });
  const losAngeles = formatTaskDate(value, { ...options, timeZone: "America/Los_Angeles", includeTime: true });
  assert.equal(shanghai.label, "明天 07:00");
  assert.equal(shanghai.dateKey, "2026-10-15");
  assert.equal(losAngeles.label, "今天 16:00");
  assert.equal(losAngeles.dateKey, "2026-10-14");
  assert.match(shanghai.fullLabel, /2026.*10.*15.*07:00.*Asia\/Shanghai/);
});

test("planned calendar dates keep their date in zones west of UTC", () => {
  const date = formatTaskDate("2026-10-14", { ...options, timeZone: "America/Los_Angeles", includeTime: true });
  assert.equal(date.label, "今天");
  assert.equal(date.dateKey, "2026-10-14");
  assert.ok(!date.fullLabel.includes("00:00"));
});

test("relative dates remain correct across daylight saving transitions and year boundaries", () => {
  assert.equal(formatTaskDate("2026-03-08", {
    ...options, timeZone: "America/New_York", now: "2026-03-09T04:30:00Z",
  }).label, "昨天");
  assert.equal(formatTaskDate("2026-12-31", {
    ...options, now: "2027-01-01T02:00:00Z",
  }).label, "昨天");
  assert.equal(formatTaskDate("2027-01-01", {
    ...options, now: "2026-12-31T02:00:00Z",
  }).label, "明天");
});

test("far dates include the year when it differs and English uses the same 24-hour clock", () => {
  assert.equal(formatTaskDate("2026-10-20", options).label, "10月20日");
  assert.equal(formatTaskDate("2027-01-04", options).label, "2027年1月4日");
  assert.equal(formatTaskDate("2027-01-04T10:00:00Z", {
    ...options, language: "en-US", includeTime: true,
  }).label, "Jan 4, 2027 18:00");
  assert.equal(formatTaskDate("2026-10-14T16:00:00Z", {
    ...options, includeTime: true,
  }).label, "明天 00:00");
});

test("task due dates preserve the existing UTC interpretation of timestamps without an offset", () => {
  assert.equal(formatTaskDate("2026-10-14T10:00:00", { ...options, includeTime: true }).label, "今天 18:00");
});

test("schedule prioritizes a deadline and suppresses a same-day plan in the display time zone", () => {
  const { primary, extraPlanned } = getTaskSchedulePresentation({
    dueTime: "2026-10-14T23:00:00Z", plannedDate: "2026-10-15",
  }, options);
  assert.equal(primary.kind, "due");
  assert.equal(primary.label, "明天 07:00 截止");
  assert.match(primary.fullLabel, /^截止: .*2026.*07:00/);
  assert.equal(extraPlanned, null);
  const differentZone = getTaskSchedulePresentation({
    dueTime: "2026-10-14T23:00:00Z", plannedDate: "2026-10-15",
  }, { ...options, timeZone: "America/Los_Angeles" });
  assert.equal(differentZone.primary.label, "今天 16:00 截止");
  assert.equal(differentZone.extraPlanned.label, "计划 明天");
});

test("schedule retains a different planned day and handles planned-only or unscheduled tasks", () => {
  assert.equal(getTaskSchedulePresentation({
    dueTime: "2026-10-16T10:00:00Z", plannedDate: "2026-10-14",
  }, options).extraPlanned.label, "计划 今天");
  assert.equal(getTaskSchedulePresentation({ plannedDate: "2026-10-15" }, {
    ...options, language: "en-US",
  }).primary.label, "Planned Tomorrow");
  assert.deepEqual(getTaskSchedulePresentation({}, options), { primary: null, extraPlanned: null });
});

test("invalid dates are visible, retain the source in the tooltip, and cannot hide a valid plan", () => {
  for (const value of ["invalid", "2026-02-30", new Date(NaN)]) {
    const formatted = formatTaskDate(value, options);
    assert.equal(formatted.valid, false);
    assert.equal(formatted.label, "日期无效");
    assert.equal(formatted.dateKey, null);
    assert.match(formatted.fullLabel, /^日期无效: /);
  }
  const schedule = getTaskSchedulePresentation({ dueTime: "invalid", plannedDate: "2026-10-14" }, options);
  assert.equal(schedule.primary.label, "日期无效 截止");
  assert.equal(schedule.extraPlanned.label, "计划 今天");
  assert.equal(formatTaskDate(null, options).label, "");
  assert.equal(formatTaskDate("2026-10-14", { ...options, timeZone: "invalid-zone" }).label, "今天");
});

test("task rows keep the main metadata concise while preserving priority, checklist, repeat, and template information", async () => {
  const html = await renderTask({
    dueTime: "2026-10-14T23:00:00Z", plannedDate: "2026-10-14", project: "工作", tag: "设计",
    priority: 3, repeatRule: "weekly", checklistJson: '[{"done":true},{"done":false}]', isTemplate: true,
  });
  const metadata = html.match(/class="task-meta">([\s\S]*?)<\/div>/)[1];
  assert.ok(metadata.includes("明天 07:00 截止") && metadata.includes("工作") && metadata.includes("设计"));
  assert.ok(!metadata.includes("每周") && !metadata.includes("清单") && !metadata.includes("优先级"));
  assert.ok(html.includes("每周") && html.includes("清单 1/2") && html.includes("优先级 高") && html.includes("模板"));
  assert.ok(html.includes("<summary>计划</summary>") && html.includes("计划 今天"));
});

test("conflict comparison may collapse while the warning and recovery actions stay visible", async () => {
  const html = await renderTask({
    syncStatus: "conflict",
    conflictLocalJson: '{"title":"本地方案","content":"local"}',
    conflictServerJson: '{"title":"云端方案","content":"cloud"}',
  });
  assert.ok(html.includes("查看版本差异"));
  assert.ok(!html.includes("本地方案") && !html.includes("云端方案"), "closed comparisons do not retain full snapshots");
  assert.match(html, /<\/details><div class="conflict-actions-inline">/);
  assert.ok(html.includes("sync-pill is-warning"));
  assert.ok(!html.includes('class="task-menu-panel"'));
});

test("conflict snapshots load only on expansion and are released or ignored after collapse", async () => {
  let finish;
  const globals = { conflictGeneration: 0, conflictDetail: { value: null }, conflictError: { value: false }, conflictLoading: { value: false },
    props: { task: { localId: "conflict" } }, getTask: () => new Promise(resolve => { finish = resolve; }) };
  const { loadConflictDetail } = await loadTsFunctions("renderer/components/TaskItem.vue", ["loadConflictDetail"], globals);
  const opening = loadConflictDetail({ target: { open: true } });
  assert.equal(globals.conflictLoading.value, true);
  await loadConflictDetail({ target: { open: false } });
  finish({ localId: "conflict", content: "Large body", conflictServerJson: '{"title":"cloud"}' });
  await opening;
  assert.equal(globals.conflictDetail.value, null);
  assert.equal(globals.conflictLoading.value, false);
  const current = loadConflictDetail({ target: { open: true } });
  finish({ localId: "conflict", conflictServerJson: '{"title":"cloud"}' });
  await current;
  assert.equal(globals.conflictDetail.value.conflictServerJson, '{"title":"cloud"}');
  await loadConflictDetail({ target: { open: false } });
  assert.equal(globals.conflictDetail.value, null);
});

async function renderTask(fields) {
  const settings = { language: "zh-CN", displayTimeZone: "Asia/Shanghai", t: key => translate(key, "zh-CN") };
  const component = loadVueComponent("renderer/components/TaskItem.vue", {
    "../stores/settings": { useSettingsStore: () => settings },
    "../stores/task": { useTaskStore: () => ({ timelineNow: new Date(now) }) },
  }, { window: {} });
  return renderToString(createSSRApp(component, {
    task: { localId: "preview", title: "完成方案", status: "todo", syncStatus: "synced", priority: 0, checklistJson: "[]", ...fields },
  }));
}
