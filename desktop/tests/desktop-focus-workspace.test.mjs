import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "..");

async function source(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("desktop app composes the focus workspace shell", async () => {
  const app = await source("desktop/src/App.vue");

  assert.match(app, /import \{ deriveWorkspaceStatus \} from "\.\.\/shared\/workspace-ui-policy"/);
  assert.match(app, /import AppSidebar from "\.\/components\/AppSidebar\.vue"/);
  assert.match(app, /import WorkspaceStatusBanner from "\.\/components\/WorkspaceStatusBanner\.vue"/);
  assert.match(app, /const workspaceStatus = computed\(\(\) =>[\s\S]{0,120}deriveWorkspaceStatus\(syncStore\.status, syncStore\.diagnostics\)/);
  assert.match(app, /<AppSidebar/);
  assert.match(app, /class="workspace-main"/);
  assert.match(app, /v-if="workspaceStatus\.banner !== 'none'"/);
  assert.doesNotMatch(app, /<SyncStatus|sidebar-sync-button/);
});

test("desktop sidebar exposes three accessible navigation entries and one account menu", async () => {
  const sidebar = await source("desktop/src/components/AppSidebar.vue");

  assert.match(sidebar, /from "lucide-vue-next"/);
  assert.match(sidebar, /CalendarDays/);
  assert.match(sidebar, /ListTodo/);
  assert.match(sidebar, /Settings/);
  assert.match(sidebar, /aria-current/);
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /role="menu"/);
  assert.match(sidebar, /role="menuitem"/);
  assert.match(sidebar, /emit\("navigate", "today"\)/);
  assert.match(sidebar, /emit\("navigate", "tasks"\)/);
  assert.match(sidebar, /emit\("navigate", "settings"\)/);
});

test("desktop account menu closes through its own interaction boundary", async () => {
  const sidebar = await source("desktop/src/components/AppSidebar.vue");

  assert.match(sidebar, /const accountMenuRoot = useTemplateRef<HTMLElement>\("accountMenuRoot"\)/);
  assert.match(sidebar, /<div ref="accountMenuRoot" class="sidebar-footer account-menu">/);
  assert.match(sidebar, /!accountMenuRoot\.value\?\.contains\(event\.target\)/);
  assert.doesNotMatch(sidebar, /sidebarRoot/);
  assert.match(sidebar, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(sidebar, /document\.removeEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(sidebar, /document\.addEventListener\("keydown", closeOnEscape\)/);
  assert.match(sidebar, /document\.removeEventListener\("keydown", closeOnEscape\)/);
  assert.match(sidebar, /function syncNow\(\): void \{\s*closeMenu\(\);\s*emit\("syncNow"\)/);
  assert.match(sidebar, /function openSyncDetails\(\): void \{\s*closeMenu\(\);\s*emit\("openSyncDetails"\)/);
  assert.match(sidebar, /function logout\(\): void \{\s*closeMenu\(\);\s*emit\("logout"\)/);
  assert.match(sidebar, /@click="syncNow"/);
  assert.match(sidebar, /@click="openSyncDetails"/);
  assert.match(sidebar, /@click="logout"/);
});

test("desktop account menu implements the ARIA menu button keyboard model", async () => {
  const sidebar = await source("desktop/src/components/AppSidebar.vue");

  assert.match(sidebar, /nextTick/);
  assert.match(sidebar, /id="account-menu-trigger"/);
  assert.match(sidebar, /@click="toggleMenu"/);
  assert.match(sidebar, /@keydown="handleTriggerKeydown"/);
  assert.match(sidebar, /aria-labelledby="account-menu-trigger"/);
  assert.match(sidebar, /role="menu"[\s\S]{0,160}@keydown="handleMenuKeydown"/);
  assert.match(sidebar, /querySelectorAll<HTMLElement>\('\[role="menuitem"\]'\)/);
  assert.match(sidebar, /async function openMenu[\s\S]{0,180}await nextTick\(\)/);
  assert.match(sidebar, /items\[0\]\?\.focus\(\)/);
  assert.match(sidebar, /items\[items\.length - 1\]\?\.focus\(\)/);
  assert.match(sidebar, /event\.key === "ArrowDown"[\s\S]{0,160}openMenu\("first"\)/);
  assert.match(sidebar, /event\.key === "ArrowUp"[\s\S]{0,160}openMenu\("last"\)/);
  assert.match(sidebar, /case "ArrowDown":/);
  assert.match(sidebar, /case "ArrowUp":/);
  assert.match(sidebar, /case "Home":/);
  assert.match(sidebar, /case "End":/);
  assert.match(sidebar, /event\.key === "Tab"\) return/);
  assert.match(sidebar, /event\.key === "Escape"[\s\S]{0,120}closeMenu\(\);\s*accountTrigger\.value\?\.focus\(\)/);
  assert.match(sidebar, /@focusout="closeOnMenuFocusOut"/);
});

test("desktop account trigger announces sync state once and shows attention count visually", async () => {
  const sidebar = await source("desktop/src/components/AppSidebar.vue");

  assert.match(sidebar, /const attentionBadge = computed/);
  assert.match(sidebar, /props\.status\.indicator !== "attention" \|\| props\.status\.issueCount <= 0/);
  assert.match(sidebar, /Math\.min\(props\.status\.issueCount, 99\)/);
  assert.match(sidebar, /"99\+"/);
  assert.match(sidebar, /sync\.attentionWorkspaceCount[\s\S]{0,120}replace\("\{count\}", String\(props\.status\.issueCount\)\)/);
  assert.match(sidebar, /const accountMenuAriaLabel = computed[\s\S]{0,180}nav\.accountMenu[\s\S]{0,180}props\.username/);
  assert.match(sidebar, /:aria-label="accountMenuAriaLabel"/);
  assert.match(sidebar, /v-if="attentionBadge"[\s\S]{0,120}aria-hidden="true"[\s\S]{0,120}\{\{ attentionBadge \}\}/);
  assert.match(sidebar, /class="account-status-indicator"[\s\S]{0,180}aria-hidden="true"/);
  assert.doesNotMatch(sidebar, /class="account-status-indicator"[\s\S]{0,180}role="img"/);
});

test("desktop workspace banner exposes polite retry and details actions", async () => {
  const banner = await source("desktop/src/components/WorkspaceStatusBanner.vue");

  assert.match(banner, /aria-live="polite"/);
  assert.match(banner, /aria-atomic="true"/);
  assert.match(banner, /retry: \[\]/);
  assert.match(banner, /openDetails: \[\]/);
  assert.match(banner, /status\.issueCount > 0/);
  assert.match(banner, /@click="emit\('retry'\)"/);
  assert.match(banner, /@click="emit\('openDetails'\)"/);
});

test("desktop toast teleports an accessible status message", async () => {
  const toast = await source("desktop/src/components/AppToast.vue");

  assert.match(toast, /<Teleport to="body">/);
  assert.match(toast, /<Transition/);
  assert.match(toast, /role="status"/);
  assert.match(toast, /aria-live="polite"/);
  assert.match(toast, /aria-atomic="true"/);
  assert.match(toast, /CircleCheck/);
});

test("desktop focus workspace copy is complete in Chinese and English", async () => {
  const i18n = await source("desktop/src/i18n.ts");
  const keys = [
    "nav.accountMenu",
    "sync.details",
    "sync.retry",
    "sync.offlineWorkspace",
    "sync.attentionWorkspace",
    "sync.attentionWorkspaceCount",
    "task.saveFailed",
    "task.quickAdd",
    "task.quickAddMore",
  ];

  for (const key of keys) {
    const entry = new RegExp(`"${key.replaceAll(".", "\\.")}"\\s*:\\s*\\{[^}]*"zh-CN"\\s*:\\s*"[^"]+"[^}]*"en-US"\\s*:\\s*"[^"]+"[^}]*\\}`);
    assert.match(i18n, entry, `${key} must provide zh-CN and en-US copy`);
  }
});

test("today view integrates reliable quick add and save error feedback", async () => {
  const today = await source("desktop/src/views/TodayView.vue");
  const quickAddMatch = today.match(/async function quickAddTask\(title: string\): Promise<void> \{([\s\S]*?)\n\}/);
  const saveMatch = today.match(/async function save\(draft: TaskDraft\): Promise<void> \{([\s\S]*?)\n\}/);

  assert.match(today, /import AppToast from "\.\.\/components\/AppToast\.vue"/);
  assert.match(today, /import WorkspaceQuickAdd from "\.\.\/components\/WorkspaceQuickAdd\.vue"/);
  assert.match(today, /import \{ todayLocalDate \} from "\.\.\/\.\.\/shared\/quick-add-parser"/);
  assert.match(today, /interface WorkspaceQuickAddHandle \{\s*clear\(submittedTitle: string\): boolean;\s*focus\(\): void;\s*\}/);
  assert.match(today, /const quickAddRef = useTemplateRef<WorkspaceQuickAddHandle>\("quickAdd"\)/);
  assert.ok(today.indexOf("<WorkspaceQuickAdd") < today.indexOf('class="task-list today-task-list"'));
  assert.doesNotMatch(today, /TaskSyncHealthBar|taskSyncHealth|showTaskSyncHealth|diagnosticSyncIssueCount|taskRecordSyncIssueCount|useSyncStore|action-feedback|eyebrow/);

  assert.ok(quickAddMatch, "quickAddTask must be declared");
  assert.match(quickAddMatch[1], /if \(isQuickAdding\.value\) return;\s*isQuickAdding\.value = true;\s*quickAddError\.value = "";/);
  assert.match(quickAddMatch[1], /await taskStore\.addTask\(\{[\s\S]*?title,[\s\S]*?listType: "today",[\s\S]*?plannedDate: todayLocalDate\(taskStore\.timelineNow, settingsStore\.displayTimeZone\),?[\s\S]*?\}\)/);
  assert.match(quickAddMatch[1], /await taskStore\.addTask\([\s\S]*?quickAddRef\.value\?\.clear\(title\);[\s\S]*?showNotice\(settingsStore\.t\("task\.feedbackSaved"\)\);/);
  assert.match(quickAddMatch[1], /catch \{\s*quickAddError\.value = settingsStore\.t\("task\.saveFailed"\);\s*\}/);
  const quickAddFinally = quickAddMatch[1].match(/finally \{([\s\S]*?)\n  \}/);
  assert.ok(quickAddFinally, "quick add must release busy state in finally");
  assert.match(quickAddFinally[1], /isQuickAdding\.value = false;\s*await nextTick\(\);\s*quickAddRef\.value\?\.focus\(\);/);
  assert.doesNotMatch(quickAddMatch[1], /shouldFocusQuickAdd/);
  assert.doesNotMatch(quickAddMatch[1].match(/catch \{([\s\S]*?)\n  \}/)?.[1] ?? "", /clear\(/);
  assert.doesNotMatch(quickAddFinally[1], /clear\(/);

  assert.match(today, /<WorkspaceQuickAdd[\s\S]{0,320}:disabled="isQuickAdding"[\s\S]{0,320}:invalid="Boolean\(quickAddError\)"[\s\S]{0,320}:error-id="'today-quick-add-error'"[\s\S]{0,320}@submit="quickAddTask"[\s\S]{0,320}@open-editor="openCreate"/);
  assert.match(today, /id="today-quick-add-error"[\s\S]{0,180}class="inline-error quick-add-error"[\s\S]{0,120}role="alert"[\s\S]{0,120}aria-live="assertive"/);
  assert.match(today, /<TaskEditor[\s\S]{0,320}:error-message="editorSaveError"[\s\S]{0,160}error-id="today-editor-save-error"/);
  assert.doesNotMatch(today, /<p v-if="editorSaveError"/);
  assert.match(today, /<AppToast :message="notice" \/>/);
  assert.match(today, /import \{ computed, nextTick, onBeforeUnmount, ref, useTemplateRef \} from "vue"/);
  assert.match(today, /onBeforeUnmount\(\(\) => \{\s*if \(noticeTimer !== undefined\) window\.clearTimeout\(noticeTimer\);\s*\}\)/);

  assert.ok(saveMatch, "save must be declared");
  assert.match(saveMatch[1], /editorSaveError\.value = "";/);
  assert.match(saveMatch[1], /try \{[\s\S]*?editorOpen\.value = false;[\s\S]*?editingTask\.value = null;[\s\S]*?setEditorDirty\(false\);/);
  assert.match(saveMatch[1], /catch \{\s*editorSaveError\.value = settingsStore\.t\("task\.saveFailed"\);\s*\}/);
  assert.doesNotMatch(saveMatch[1].match(/catch \{([\s\S]*?)\n\s*\}/)?.[1] ?? "", /editorOpen\.value = false|editingTask\.value = null|setEditorDirty\(false\)/);
  assert.match(today, /function openCreate\(\): void \{\s*editorSaveError\.value = "";/);
  assert.match(today, /function openEdit\(task: TaskRecord\): void \{\s*editorSaveError\.value = "";/);
});

test("all-tasks view centralizes save feedback and drops inline sync diagnostics", async () => {
  const [app, today, tasks] = await Promise.all([
    source("desktop/src/App.vue"),
    source("desktop/src/views/TodayView.vue"),
    source("desktop/src/views/TaskView.vue"),
  ]);
  const saveMatch = tasks.match(/async function save\(draft: TaskDraft\): Promise<void> \{([\s\S]*?)\n\}/);
  const taskViewMount = app.match(/<TaskView[\s\S]*?\/>/);
  const todayViewMount = app.match(/<TodayView[\s\S]*?\/>/);
  const workspaceBannerMount = app.match(/<WorkspaceStatusBanner[\s\S]*?\/>/);

  assert.match(tasks, /import \{ computed, onBeforeUnmount, ref, watch \} from "vue"/);
  assert.match(tasks, /import AppToast from "\.\.\/components\/AppToast\.vue"/);
  assert.doesNotMatch(tasks, /TaskSyncHealthBar|showTaskSyncHealth|useSyncStore|action-feedback/);
  assert.doesNotMatch(tasks, /diagnosticSyncIssueCount|taskRecordSyncIssueCount|taskSyncIssueCount|taskSyncHealthTone|taskSyncHealthText/);
  assert.match(tasks, /const editorSaveError = ref\(""\)/);
  assert.match(tasks, /<TaskEditor[\s\S]{0,320}:error-message="editorSaveError"[\s\S]{0,160}error-id="task-editor-save-error"/);
  assert.match(tasks, /<AppToast :message="notice" \/>/);
  assert.doesNotMatch(tasks, /openSettings:\s*\[\]/);
  assert.doesNotMatch(today, /openSettings:\s*\[\]/);
  assert.ok(taskViewMount, "TaskView must be mounted by the app shell");
  assert.ok(todayViewMount, "TodayView must be mounted by the app shell");
  assert.ok(workspaceBannerMount, "WorkspaceStatusBanner must be mounted by the app shell");
  assert.doesNotMatch(taskViewMount[0], /@open-settings/);
  assert.doesNotMatch(todayViewMount[0], /@open-settings/);
  assert.match(workspaceBannerMount[0], /@open-details="openSettingsSection\('sync-recovery'\)"/);

  assert.ok(saveMatch, "save must be declared");
  assert.match(saveMatch[1], /editorSaveError\.value = "";/);
  const saveSections = saveMatch[1].match(/try \{([\s\S]*?)\n  \} catch \{([\s\S]*?)\n  \} finally \{([\s\S]*?)\n  \}/);
  assert.ok(saveSections, "save must keep success, failure, and cleanup branches separate");
  const [, saveTry, saveCatch, saveFinally] = saveSections;
  assert.match(saveTry, /editorOpen\.value = false;\s*editingTask\.value = null;\s*setEditorDirty\(false\);\s*showNotice\(settingsStore\.t\("task\.feedbackSaved"\)\);/);
  assert.match(saveCatch, /^\s*editorSaveError\.value = settingsStore\.t\("task\.saveFailed"\);\s*$/);
  assert.match(saveFinally, /^\s*isSaving\.value = false;\s*$/);
  for (const section of [saveCatch, saveFinally]) {
    assert.doesNotMatch(section, /editorOpen\.value = false|editingTask\.value = null|setEditorDirty\(false\)|showNotice\(/);
  }
  const taskUnmount = tasks.match(/onBeforeUnmount\(\(\) => \{([\s\S]*?)\n\}\);/);
  assert.ok(taskUnmount, "TaskView must clean up its notice timer when unmounted");
  assert.match(taskUnmount[1], /^\s*if \(noticeTimer !== undefined\) \{\s*window\.clearTimeout\(noticeTimer\);\s*noticeTimer = undefined;\s*\}\s*$/);
  assert.match(tasks, /function openCreate\(\): void \{\s*editorSaveError\.value = "";/);
  assert.match(tasks, /function openEdit\(task: TaskRecord\): void \{\s*editorSaveError\.value = "";/);
});

test("task editor associates save errors with its form and submit action", async () => {
  const editor = await source("desktop/src/components/TaskEditor.vue");
  const formMatch = editor.match(/<form class="task-editor"[\s\S]*?<\/form>/);
  const headerMatch = editor.match(/<header class="panel-header">([\s\S]*?)<\/header>/);
  const fieldsetMatch = editor.match(/<fieldset class="task-editor-fields" :disabled="isSaving">([\s\S]*?)<\/fieldset>/);
  const formActions = editor.match(/<div class="form-actions">([\s\S]*?)<\/div>/);

  assert.match(editor, /errorMessage\?: string;\s*errorId\?: string;/);
  assert.match(editor, /<form class="task-editor" :aria-busy="isSaving \|\| undefined" :aria-describedby="errorMessage \? errorId : undefined" @submit\.prevent="submit">/);
  assert.ok(formMatch, "TaskEditor must render a form");
  assert.ok(headerMatch, "TaskEditor must render its header");
  assert.ok(fieldsetMatch, "TaskEditor must group editable controls in a disabled fieldset");
  assert.ok(headerMatch.index < fieldsetMatch.index, "TaskEditor header must stay outside the disabled fieldset");
  assert.ok(fieldsetMatch.index < formActions.index, "TaskEditor actions must stay outside the disabled fieldset");
  assert.doesNotMatch(headerMatch[1], /<fieldset/);
  assert.match(fieldsetMatch[1], /v-model="form\.title"/);
  assert.match(fieldsetMatch[1], /id="task-editor-more-fields"/);
  assert.doesNotMatch(formActions[1], /<fieldset/);
  assert.ok(formActions, "TaskEditor must render its form actions");
  assert.match(formActions[1], /v-if="errorMessage"[\s\S]{0,160}:id="errorId"[\s\S]{0,160}class="form-message form-message-error task-editor-save-error"[\s\S]{0,120}role="alert"[\s\S]{0,120}aria-live="assertive"/);
  assert.ok(formActions[1].indexOf('v-if="errorMessage"') < formActions[1].indexOf('type="button"'));
  assert.match(formActions[1], /<button type="submit"[\s\S]{0,160}:aria-describedby="errorMessage \? errorId : undefined"/);
  assert.match(editor, /fieldset\.task-editor-fields \{\s*display: grid;\s*gap: 14px;\s*min-width: 0;\s*margin: 0;\s*padding: 0;\s*border: 0;\s*\}/);
});

test("workspace quick add preserves input until parent confirms success", async () => {
  const quickAdd = await source("desktop/src/components/WorkspaceQuickAdd.vue");
  const submitMatch = quickAdd.match(
    /function submit\(\): void \{([\s\S]*?)\n\}(?=\n\nfunction clear\()/,
  );

  assert.match(quickAdd, /<form class="workspace-quick-add" @submit\.prevent="submit">/);
  assert.match(quickAdd, /invalid\?: boolean;\s*errorId\?: string;/);
  assert.ok(submitMatch, "submit function must be declared");
  assert.match(submitMatch[1], /const trimmedTitle = title\.value\.trim\(\)/);
  assert.match(submitMatch[1], /if \(!trimmedTitle\) return/);
  assert.match(submitMatch[1], /emit\("submit", trimmedTitle\)/);
  assert.doesNotMatch(submitMatch[1], /title\.value\s*=\s*["']{2}/);
  assert.doesNotMatch(submitMatch[1], /\bclear\s*\(/);

  const clearMatch = quickAdd.match(
    /function clear\(submittedTitle: string\): boolean \{([\s\S]*?)\n\}(?=\n\nfunction focus\(\): void \{)/,
  );
  assert.ok(clearMatch, "clear must accept the submitted title and report whether it cleared");
  assert.match(
    clearMatch[1],
    /if \(title\.value\.trim\(\) !== submittedTitle\.trim\(\)\) return false/,
  );
  assert.match(clearMatch[1], /title\.value = "";\s*return true;/);
  assert.match(quickAdd, /function focus\(\): void \{\s*input\.value\?\.focus\(\)/);
  assert.match(quickAdd, /defineExpose\(\{ clear, focus \}\)/);

  assert.match(quickAdd, /maxlength="120"/);
  assert.match(quickAdd, /<input[\s\S]{0,240}:disabled="disabled"/);
  assert.match(quickAdd, /:aria-invalid="invalid \|\| undefined"/);
  assert.match(quickAdd, /:aria-errormessage="invalid \? errorId : undefined"/);
  assert.match(quickAdd, /:aria-label="settingsStore\.t\('task\.quickAdd'\)"/);
  assert.match(quickAdd, /:placeholder="settingsStore\.t\('task\.quickAdd'\)"/);

  assert.match(quickAdd, /import \{ Plus, SlidersHorizontal \} from "lucide-vue-next"/);
  assert.match(quickAdd, /<Plus aria-hidden="true" \/>/);
  assert.match(quickAdd, /<SlidersHorizontal aria-hidden="true" \/>/);
  assert.match(quickAdd, /<button[\s\S]{0,160}type="submit"[\s\S]{0,160}:disabled="disabled"/);
  assert.match(quickAdd, /<button[\s\S]{0,160}type="submit"[\s\S]{0,160}:aria-label="settingsStore\.t\('task\.quickAdd'\)"/);
  assert.match(quickAdd, /<button[\s\S]{0,160}type="submit"[\s\S]{0,160}:title="settingsStore\.t\('task\.quickAdd'\)"/);
  assert.match(quickAdd, /<button[\s\S]{0,160}type="button"[\s\S]{0,160}:disabled="disabled"/);
  assert.match(quickAdd, /:aria-label="settingsStore\.t\('task\.quickAddMore'\)"/);
  assert.match(quickAdd, /:title="settingsStore\.t\('task\.quickAddMore'\)"/);
  assert.match(quickAdd, /@click="emit\('openEditor'\)"/);
  assert.doesNotMatch(quickAdd, /<svg\b/i);
  assert.doesNotMatch(quickAdd, />\s*\+\s*</);
  assert.doesNotMatch(quickAdd, /(?:Press|按下|Enter|回车)/i);
});
