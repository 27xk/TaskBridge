import assert from "node:assert/strict";
import test from "node:test";
import { loadElectronModule } from "./helpers/mock-electron-windows.mjs";

const { formatTaskDate, getTaskSchedulePresentation } = loadElectronModule("src/utils/task-presentation.ts");
const now = "2026-10-14T12:00:00Z";
const options = { language: "zh-CN", timeZone: "Asia/Shanghai", now };

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
