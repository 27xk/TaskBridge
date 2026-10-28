import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { extractBalancedBlock, normalizeLineEndings } from "../scripts/script-helpers.mjs";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "..");

async function source(path) {
  return normalizeLineEndings(await readFile(resolve(repoRoot, path), "utf8"));
}

function sourceBetween(value, startMarker, endMarker) {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source section start: ${startMarker}`);
  assert.ok(end > start, `missing source section end: ${endMarker}`);
  return value.slice(start, end);
}

test("desktop authentication saves the normalized server and authenticates without a sync-status gate", async () => {
  const login = await source("desktop/renderer/views/LoginView.vue");
  const submit = sourceBetween(
    login,
    "async function submit(): Promise<void> {",
    "function updateLanguage",
  );

  assert.match(submit, /await saveConnection\(\)/);
  assert.doesNotMatch(submit, /testConnection|\/sync\/status|connectionReady/);
  assert.ok(submit.indexOf("await saveConnection()") < submit.indexOf("await auth.login"));
  assert.ok(submit.indexOf("await saveConnection()") < submit.indexOf("await auth.register"));
});

test("desktop connection testing lives inside advanced troubleshooting instead of the primary login actions", async () => {
  const [login, i18n] = await Promise.all([
    source("desktop/renderer/views/LoginView.vue"),
    source("desktop/renderer/i18n.ts"),
  ]);
  const ordinaryActions = sourceBetween(
    login,
    '<button class="primary-button" type="submit"',
    '<details v-if="showAdvancedConnectionEntry"',
  );
  const troubleshooting = sourceBetween(
    login,
    '<details v-if="showAdvancedConnectionEntry"',
    "</details>",
  );

  assert.doesNotMatch(ordinaryActions, /checkAndSaveConnection|settings\.checkAndSaveConnection/);
  assert.match(troubleshooting, /@click="checkAndSaveConnection"/);
  assert.match(troubleshooting, /settingsStore\.t\("settings\.checkAndSaveConnection"\)/);
  assert.doesNotMatch(i18n, /登录会自动检查连接|Signing in checks the connection automatically/);
});

test("WorkspaceQuickAdd accepts the same 255-character title contract as the full editor", async () => {
  const quickAdd = await source("desktop/renderer/components/WorkspaceQuickAdd.vue");

  assert.match(quickAdd, /maxlength="255"/);
  assert.doesNotMatch(quickAdd, /maxlength="120"/);
});

test("task titles expose a named native edit button while preserving double-click and More", async () => {
  const taskItem = await source("desktop/renderer/components/TaskItem.vue");
  const triggerIndex = taskItem.indexOf('class="task-edit-trigger"');
  assert.ok(triggerIndex >= 0, "task title must expose a dedicated edit trigger");
  const openingTagStart = taskItem.lastIndexOf("<button", triggerIndex);
  const openingTagEnd = taskItem.indexOf(">", triggerIndex);
  const openingTag = taskItem.slice(openingTagStart, openingTagEnd + 1);

  assert.match(openingTag, /<button\b/);
  assert.match(openingTag, /type="button"/);
  assert.match(
    openingTag,
    /:aria-label="taskMenuLabel\(settingsStore\.t\('task\.editAction'\), task\.title\)"/,
  );
  assert.match(openingTag, /@click="\$emit\('edit', task\)"/);
  assert.match(openingTag, /@dblclick\.stop/);
  assert.doesNotMatch(openingTag, /tabindex="-1"|aria-hidden="true"/);
  assert.match(taskItem, /@dblclick="\$emit\('edit', task\)"/);
  // Secondary actions now use an on-demand menu, exercised by task-list-remediation.test.mjs.
});

test("pending sync has neutral automatic-sync copy and never uses the attention label", async () => {
  const [sidebar, i18n] = await Promise.all([
    source("desktop/renderer/components/AppSidebar.vue"),
    source("desktop/renderer/i18n.ts"),
  ]);

  assert.match(sidebar, /pending:\s*"sync\.pendingAuto"/);
  assert.match(
    i18n,
    /"sync\.pendingAuto":\s*\{\s*"zh-CN":\s*"联网后自动同步",\s*"en-US":\s*"Syncs automatically when online"\s*\}/,
  );
});

test("desktop keeps navigation labels at 1024px and collapses only at compact widths", async () => {
  const [sidebar, css, visual] = await Promise.all([
    source("desktop/renderer/components/AppSidebar.vue"),
    source("desktop/renderer/assets/workspace.css"),
    source("desktop/scripts/check-desktop-focus-visual.mjs"),
  ]);
  const compactCss = extractBalancedBlock(css, "@media (max-width: 899px)");

  assert.match(compactCss, /\.focus-workspace \.nav-label\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(css, /@media \(max-width: 10\d\dpx\)[\s\S]{0,520}\.focus-workspace \.nav-label[\s\S]{0,80}display:\s*none/);
  assert.equal((sidebar.match(/:aria-label="settingsStore\.t\('nav\.(?:today|all|settings)'\)"/g) ?? []).length, 3);
  assert.match(visual, /async function verifyAllTasksResponsiveLayout\(/);
  for (const width of [1440, 1024, 800]) {
    assert.match(visual, new RegExp(`width: ${width}`));
  }
  assert.match(visual, /navLabelsVisible/);
  assert.match(visual, /taskEditEntriesNamed/);
  assert.match(visual, /horizontalOverflow/);
});
