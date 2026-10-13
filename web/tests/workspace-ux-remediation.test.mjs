import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as core from "../offline-core.js";

const [appSource, html, styles] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
]);

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function requireCoreFunction(name) {
  assert.equal(typeof core[name], "function", `${name} must be exported`);
  return core[name];
}

test("ordinary authentication uses the deployed service without connection configuration", () => {
  const authForm = sourceBetween(html, '<form id="authForm"', "</form>");
  const primaryActions = sourceBetween(authForm, '<div class="form-actions">', "</div>");

  assert.match(primaryActions, /id="authSubmitButton"/);
  assert.doesNotMatch(primaryActions, /id="testConnectionButton"/);
  assert.doesNotMatch(authForm, /data-i18n="auth\.loginAutoChecksConnection"/);
  assert.doesNotMatch(html, /id="(?:serverBaseUrl|apiBaseUrl|serverSetupHelp|advancedConnectionSettings)"/);

  const authSubmit = sourceBetween(
    appSource,
    'nodes.authForm.addEventListener("submit"',
    'nodes.resumeOfflineButton?.addEventListener("click"',
  );
  assert.doesNotMatch(authSubmit, /ensureConnectionReadyForAuth|testConnection|\/sync\/status/);
  assert.match(authSubmit, /state\.authMode === "login" \? await login\(payload\) : await register\(payload\)/);
  assert.match(
    authSubmit,
    /setStatus\(nodes\.authMessage, normalizeAuthError\(error\)\)/,
  );
  assert.match(appSource, /const INITIAL_API_BASE_URL = DEFAULT_API_BASE_URL/);
});

test("low-frequency account and support tools live in a dedicated accessible panel", () => {
  const sidebar = sourceBetween(html, '<aside id="sidebar"', "</aside>");
  const panelStart = html.indexOf('id="settingsSupportPanel"');
  assert.ok(panelStart >= 0, "settings and support panel must exist");

  assert.match(sidebar, /id="settingsSupportButton"/);
  assert.match(sidebar, /aria-controls="settingsSupportPanel"/);
  assert.match(
    html,
    /id="settingsSupportPanel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="settingsSupportHeading"[^>]*hidden/,
  );
  assert.match(html, /id="settingsSupportCloseButton"[^>]*aria-label=/);

  for (const id of [
    "accountSecurityTools",
    "notificationTools",
    "statisticsTools",
    "supportDataTools",
    "localDataTools",
  ]) {
    assert.doesNotMatch(sidebar, new RegExp(`id=["']${id}["']`), `${id} must leave the task sidebar`);
    assert.ok(html.indexOf(`id="${id}"`) > panelStart, `${id} must be inside the support panel`);
  }

  assert.match(styles, /\.settings-support-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(styles, /\.settings-support-panel\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(appSource, /function openSettingsSupportPanel\(/);
  assert.match(appSource, /function closeSettingsSupportPanel\(/);
  assert.match(appSource, /settingsSupportReturnFocus/);
  assert.match(appSource, /event\.key === "Escape"[\s\S]{0,180}closeSettingsSupportPanel\(\)/);

  const syncSupport = sourceBetween(
    appSource,
    "function openSyncSupportPanel()",
    "function openTaskCreatePanel(",
  );
  assert.match(syncSupport, /openSettingsSupportPanel\(/);
});

test("open task selection helpers select only visible actionable tasks", () => {
  const getSelectableTaskIds = requireCoreFunction("getSelectableTaskIds");
  const reconcileSelectedTaskIds = requireCoreFunction("reconcileSelectedTaskIds");
  const tasks = [
    { id: 1, title: "Open", status: "open", is_deleted: false },
    { id: 2, title: "Done", status: "completed", is_deleted: false },
    { id: 3, title: "Deleted", status: "open", is_deleted: true },
    { id: 4, title: "Pending", status: "in_progress", is_deleted: false },
  ];

  assert.deepEqual(getSelectableTaskIds(tasks), ["1", "4"]);
  assert.deepEqual(
    [...reconcileSelectedTaskIds(new Set(["1", "2", "3", "missing"]), tasks)],
    ["1"],
  );
});

test("open task selection exposes stable accessible bulk controls", () => {
  for (const id of [
    "taskSelectionToolbar",
    "enterTaskSelectionButton",
    "taskSelectionActions",
    "selectAllVisibleTasksButton",
    "completeSelectedTasksButton",
    "deleteSelectedTasksButton",
    "cancelTaskSelectionButton",
    "taskSelectionStatus",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must exist`);
  }
  assert.match(
    html,
    /id="taskSelectionStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  );
  assert.match(html, /id="taskSelectionToolbar"[^>]*aria-label=/);
  assert.match(styles, /\.task-selection-toolbar\s*\{[^}]*min-height:/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.task-selection-toolbar/s);
  assert.match(appSource, /data\.taskSelectionId\s*=\s*String\(task\.id\)/);
  assert.match(
    appSource,
    /setAttribute\("aria-label",\s*formatMessage\("task\.selectTaskFor",\s*\{\s*title:/,
  );
});

test("bulk complete and delete reuse task mutations then clear selection", () => {
  const completeSelected = sourceBetween(
    appSource,
    "async function completeSelectedTasks()",
    "async function deleteSelectedTasks()",
  );
  const deleteSelected = sourceBetween(
    appSource,
    "async function deleteSelectedTasks()",
    "function isLocalOnlyTask(",
  );

  assert.match(completeSelected, /applyTaskAction\(task,\s*"complete"/);
  assert.match(completeSelected, /exitTaskSelectionMode\(\)/);
  assert.match(deleteSelected, /confirmUserAction\(/);
  assert.match(deleteSelected, /danger:\s*true/);
  assert.match(deleteSelected, /applyTaskAction\(task,\s*"delete"/);
  assert.match(deleteSelected, /exitTaskSelectionMode\(\)/);
  assert.match(appSource, /function selectAllVisibleTasks\(/);
  assert.match(appSource, /function cancelTaskSelection\([\s\S]{0,160}exitTaskSelectionMode\(\)/);
});
