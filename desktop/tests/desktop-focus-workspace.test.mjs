import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractBalancedBlock,
  extractOpeningTag,
  hasLiteralBooleanAttribute,
} from "../scripts/script-helpers.mjs";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "..");

async function source(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

function sourceSection(value, startMarker, endMarker) {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source section start: ${startMarker}`);
  assert.ok(end > start, `missing source section end: ${endMarker}`);
  return value.slice(start, end);
}

test("desktop app composes the focus workspace shell", async () => {
  const app = await source("desktop/src/App.vue");

  assert.match(app, /import \{ deriveWorkspaceStatus \} from "\.\.\/shared\/workspace-ui-policy"/);
  assert.match(app, /import AppSidebar from "\.\/components\/AppSidebar\.vue"/);
  assert.match(app, /import WorkspaceStatusBanner from "\.\/components\/WorkspaceStatusBanner\.vue"/);
  assert.match(app, /const workspaceStatus = computed\(\(\) =>[\s\S]{0,120}deriveWorkspaceStatus\(syncStore\.status, syncStore\.diagnostics\)/);
  assert.match(app, /<AppSidebar/);
  assert.match(app, /class="workspace-main"/);
  assert.match(app, /v-if="auth\.isAuthenticated && workspaceStatus\.banner !== 'none'"/);
  assert.doesNotMatch(app, /<SyncStatus|sidebar-sync-button/);
});

test("desktop services follow authenticated workspace state instead of a disappearing login event", async () => {
  const app = await source("desktop/src/App.vue");

  assert.match(app, /import \{[^}]*\bwatch\b[^}]*\} from "vue"/);
  assert.match(app, /watch\(\s*\(\) => \[auth\.isAuthenticated, auth\.workspaceKey\] as const/);
  assert.match(app, /function activateAuthenticatedWorkspace\(/);
  assert.match(app, /void activateAuthenticatedWorkspace\(workspaceKey\)/);
  assert.match(
    app,
    /onBeforeUnmount\(\(\) => \{[\s\S]{0,500}desktopServicesActivationId \+= 1;[\s\S]{0,160}desktopServicesWorkspaceKey = null;/,
  );
  const startupBlock = extractBalancedBlock(app, "async function startDesktopServices");
  assert.match(
    app,
    /async function startDesktopServices\(\s*workspaceKey: string,\s*activationId: number,\s*\)/,
  );
  assert.match(
    startupBlock,
    /await reloadTasksAndPruneReminders\(\);\s*if \(!isCurrentWorkspaceActivation\(workspaceKey, activationId\)\) return;\s*await syncStore\.start\(reloadTasksAndPruneReminders\);\s*if \(!isCurrentWorkspaceActivation\(workspaceKey, activationId\)\) return;\s*startReminderLoop\(\);/,
  );
  const activationBlock = extractBalancedBlock(
    app,
    "async function activateAuthenticatedWorkspace",
  );
  assert.doesNotMatch(
    activationBlock,
    /if \(!isCurrentWorkspaceActivation\(workspaceKey, activationId\)\) \{\s*syncStore\.stop\(\);/,
  );
  assert.doesNotMatch(app, /@authenticated="handleAuthenticated"/);
  assert.doesNotMatch(app, /if \(auth\.isAuthenticated\) \{\s*await startDesktopServices\(\)/);
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
  assert.match(sidebar, /class="brand" title="TaskBridge"/);
  assert.match(sidebar, /class="account-menu-trigger"[\s\S]{0,120}:title="accountMenuAriaLabel"/);
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

  assert.match(tasks, /import \{ computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch \} from "vue"/);
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

test("all tasks keeps common filters visible and moves secondary filters into menus", async () => {
  const [taskView, taskItem, taskEditor] = await Promise.all([
    source("desktop/src/views/TaskView.vue"),
    source("desktop/src/components/TaskItem.vue"),
    source("desktop/src/components/TaskEditor.vue"),
  ]);

  assert.match(taskView, /class="task-command-bar"/);
  assert.match(taskView, /class="segment-control task-filter-segments"/);
  assert.match(taskView, /class="filter-menu"/);
  assert.match(taskView, /activeFilterItems/);
  assert.match(taskView, /clearActiveFilter/);
  assert.match(taskView, /if \(key === "filter"\) filter\.value = "all"/);
  assert.match(taskView, /if \(key === "project"\) selectedProject\.value = ""/);
  assert.match(taskView, /if \(key === "tag"\) selectedTag\.value = ""/);
  assert.match(taskView, /if \(key === "search"\) search\.value = ""/);
  assert.match(taskView, /const taskSearchInput = useTemplateRef<HTMLInputElement>\("taskSearchInput"\)/);
  assert.match(taskView, /const clearFiltersButton = useTemplateRef<HTMLButtonElement>\("clearFiltersButton"\)/);
  assert.match(taskView, /await focusAfterActiveFilterRemoval\(\)/);
  assert.match(taskView, /settingsStore\.language === "zh-CN" \? `搜索: \$\{keyword\}` : `Search: \$\{keyword\}`/);
  assert.match(taskView, /ref="taskSearchInput"/);
  assert.match(taskView, /ref="clearFiltersButton"/);
  assert.match(taskView, /v-for="option in secondaryFilterOptions"/);
  assert.match(taskView, /v-model="selectedProject"/);
  assert.match(taskView, /v-model="selectedTag"/);
  assert.match(taskEditor, /role="alert"/);
  assert.match(taskView, /<AppToast/);
  assert.match(taskView, /v-if="selectionMode" class="bulk-action-toolbar"/);
  assert.doesNotMatch(taskView, /TaskSyncHealthBar|currentFilters|activeFilterLabels|v-model="secondaryFilter"/);
  assert.match(taskItem, /<MoreHorizontal/);
  const taskMenuTrigger = taskItem.match(/<summary[\s\S]*?<MoreHorizontal[\s\S]*?<\/summary>/);
  assert.ok(taskMenuTrigger, "task menu must expose an icon trigger");
  assert.match(taskMenuTrigger[0], /task\.title/);
  assert.match(taskItem, /\.task-title\s*\{[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?\}/);
});

test("settings displays one persistent category panel at a time", async () => {
  const [settings, recovery] = await Promise.all([
    source("desktop/src/views/SettingsView.vue"),
    source("desktop/src/components/settings/SettingsSyncRecoveryPanel.vue"),
  ]);

  assert.match(settings, /type SettingsSectionId\s*=/);
  assert.match(settings, /const activeSettingsSection = ref<SettingsSectionId>\("account-display"\)/);
  assert.match(settings, /const syncDiagnosticsOpen = ref\(false\)/);
  assert.match(settings, /const diagnosticsExportNote = ref\(""\)/);
  assert.match(settings, /const settingsNavItems = computed/);
  assert.match(settings, /function showSettingsSection\(sectionId: string\): void/);
  assert.match(settings, /class="settings-category-nav"/);
  assert.match(settings, /:aria-current="activeSettingsSection === item\.sectionId \? 'page' : undefined"/);
  for (const section of ["account-display", "account-security", "connection", "window", "data", "sync-recovery", "metadata"]) {
    assert.match(settings, new RegExp(`v-show="activeSettingsSection === '${section}'"`));
  }
  assert.match(settings, /<SettingsSyncRecoveryPanel/);
  const recoveryPanelTag = extractOpeningTag(settings, "<SettingsSyncRecoveryPanel");
  for (const contract of [
    ':diagnostics="syncStore.diagnostics"',
    'v-model:diagnostics-open="syncDiagnosticsOpen"',
    ':export-note="diagnosticsExportNote"',
    '@refresh="refreshDiagnostics"',
    '@retry="retryExhaustedQueue"',
    '@export-diagnostics="exportDiagnostics"',
  ]) {
    assert.ok(recoveryPanelTag.includes(contract), `sync recovery panel must wire ${contract}`);
  }
  assert.match(settings, /if \(request\.sectionId === "sync-recovery"\) syncDiagnosticsOpen\.value = true/);
  assert.doesNotMatch(settings, /scrollIntoView|scrollToSettingsSection|settings-section-nav|settingsNavGroups/);
  assert.match(recovery, /settings\.syncRecoveryCenter/);
  assert.match(recovery, /settings\.syncDiagnostics/);
  assert.match(recovery, /settings\.diagnosticsSupportTools/);
  assert.match(recovery, /const diagnosticsOpen = defineModel<boolean>\("diagnosticsOpen"/);
  assert.match(recovery, /exportNote: string/);
  assert.match(recovery, /v-if="exportNote"[\s\S]{0,180}role="status"/);
  assert.match(recovery, /defineEmits<\{\s*refresh: \[\];\s*retry: \[\];\s*exportDiagnostics: \[\];\s*\}>/);
  assert.match(recovery, /@click="emit\('refresh'\)"/);
  assert.match(recovery, /@click="emit\('retry'\)"/);
  assert.match(recovery, /@click="emit\('exportDiagnostics'\)"/);
  const diagnosticsTag = extractOpeningTag(recovery, '<details class="settings-advanced-details"');
  assert.match(diagnosticsTag, /:open="diagnosticsOpen"/);
  assert.equal(hasLiteralBooleanAttribute(diagnosticsTag, "open"), false);

  const exportDiagnostics = settings.match(/async function exportDiagnostics\(\): Promise<void> \{([\s\S]*?)\n\}/);
  assert.ok(exportDiagnostics, "exportDiagnostics must be declared");
  assert.match(exportDiagnostics[1], /diagnosticsExportNote\.value/);
  assert.doesNotMatch(exportDiagnostics[1], /\bexportNote\.value/);
});

test("metadata rename feedback stays in the metadata category", async () => {
  const [settings, metadata] = await Promise.all([
    source("desktop/src/views/SettingsView.vue"),
    source("desktop/src/components/settings/SettingsMetadataPanel.vue"),
  ]);

  assert.match(settings, /const metadataNote = ref\(""\)/);
  for (const [functionName, translationKey] of [
    ["renameProject", "settings.projectRenamed"],
    ["renameTag", "settings.tagRenamed"],
  ]) {
    const renameBlock = extractBalancedBlock(settings, `async function ${functionName}`);
    assert.match(renameBlock, new RegExp(`metadataNote\\.value = settingsStore\\.t\\("${translationKey.replace(".", "\\.")}\\"\\)`));
    assert.doesNotMatch(renameBlock, /exportNote\.value/);
  }
  const metadataPanelTag = extractOpeningTag(settings, "<SettingsMetadataPanel");
  assert.match(metadataPanelTag, /:note="metadataNote"/);
  assert.match(metadata, /note: string/);
  assert.match(metadata, /v-if="note"[^>]*role="status"/);
});

test("desktop visual verifier rejects runtime errors and covers narrow interactions", async () => {
  const visual = await source("desktop/scripts/check-desktop-focus-visual.mjs");
  const mainBlock = sourceSection(visual, "async function main", "function createApiServer");
  const runtimeErrorBlock = sourceSection(
    visual,
    "async function assertNoRuntimeErrors",
    "async function loginThroughUserInterface",
  );
  const tasksBlock = sourceSection(
    visual,
    "async function verifyAllTasksWorkspace",
    "async function verifyNarrowTaskInteractions",
  );
  const narrowTasksBlock = sourceSection(
    visual,
    "async function verifyNarrowTaskInteractions",
    "async function verifySettingsWorkspace",
  );
  const settingsBlock = sourceSection(
    visual,
    "async function verifySettingsWorkspace",
    "async function verifyStatusAndMotionStates",
  );

  assert.match(mainBlock, /await assertNoRuntimeErrors\(\)/);
  assert.match(runtimeErrorBlock, /__taskBridgeVisualErrors/);
  assert.match(runtimeErrorBlock, /Runtime\.exceptionThrown/);
  assert.match(runtimeErrorBlock, /Runtime\.consoleAPICalled/);
  assert.match(runtimeErrorBlock, /findUnexpectedRuntimeLogLines\(runtimeLogs\)/);
  assert.match(runtimeErrorBlock, /expectedRuntimeWarningPatterns\.some/);
  assert.match(visual, /shortcut registration failed/);

  assert.match(tasksBlock, /await verifyNarrowTaskInteractions\(\)/);
  assert.match(narrowTasksBlock, /setWindowSize\(799, 700\)/);
  assert.match(narrowTasksBlock, /assertWorkspaceLayout\(64, metrics, "tasks-narrow"\)/);
  assert.match(narrowTasksBlock, /filter-menu\[open\]/);
  assert.match(narrowTasksBlock, /task-menu\[open\]/);
  assert.match(narrowTasksBlock, /Boolean\(document\.querySelector\('\.side-panel'\)\)/);
  assert.match(narrowTasksBlock, /assertNoUnnamedInteractiveControls\("all tasks filter menu"\)/);
  assert.match(narrowTasksBlock, /assertNoUnnamedInteractiveControls\("all tasks task menu"\)/);
  assert.match(narrowTasksBlock, /assertNoUnnamedInteractiveControls\("all tasks narrow drawer"\)/);

  assert.match(settingsBlock, /setWindowSize\(1024, 768\)/);
  assert.match(settingsBlock, /assertWorkspaceLayout\(72, mediumMetrics, "settings-medium"\)/);
  assert.match(settingsBlock, /setWindowSize\(800, 700\)/);
  assert.match(settingsBlock, /assertNoUnnamedInteractiveControls\(`settings \$\{label\}`\)/);
});

test("workspace stylesheet defines stable desktop and narrow layouts", async () => {
  const [main, css, baseCss] = await Promise.all([
    source("desktop/src/main.ts"),
    source("desktop/src/assets/workspace.css"),
    source("desktop/src/assets/base.css"),
  ]);

  const baseImportIndex = main.indexOf('import "./assets/base.css"');
  const workspaceImportIndex = main.indexOf('import "./assets/workspace.css"');
  assert.notEqual(baseImportIndex, -1, "desktop entry must import base styles");
  assert.notEqual(workspaceImportIndex, -1, "desktop entry must import workspace styles");
  assert.ok(
    baseImportIndex < workspaceImportIndex,
    "workspace styles must load after base styles",
  );
  const mediumCss = extractBalancedBlock(css, "@media (max-width: 1099px)");
  const narrowCss = extractBalancedBlock(css, "@media (max-width: 799px)");
  const reducedMotionCss = extractBalancedBlock(css, "@media (prefers-reduced-motion: reduce)");
  const reducedMotionRule = extractBalancedBlock(reducedMotionCss, ".focus-workspace *,");
  assert.match(css, /grid-template-columns:\s*184px minmax\(0, 1fr\)/);
  assert.match(css, /max-width:\s*1080px/);
  assert.match(css, /width:\s*min\(440px/);
  assert.match(mediumCss, /\.focus-workspace\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\)/);
  assert.match(mediumCss, /\.focus-workspace \.settings-workspace\s*\{[^}]*grid-template-columns:\s*200px minmax\(0, 1fr\)/);
  const accountMenuRule = css.match(/\.focus-workspace \.account-menu-items \{([^}]*)\}/);
  assert.ok(accountMenuRule, "workspace account menu must have a positioning rule");
  assert.match(accountMenuRule[1], /right:\s*auto/);
  assert.match(accountMenuRule[1], /left:\s*calc\(100% \+ 8px\)/);
  assert.match(narrowCss, /\.focus-workspace\s*\{[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\)[^}]*overflow-x:\s*hidden/);
  assert.match(narrowCss, /\.focus-workspace \.settings-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(narrowCss, /\.focus-workspace \.side-panel\s*\{[^}]*width:\s*min\(440px,\s*calc\(100vw - 64px\)\)/);
  assert.match(reducedMotionCss, /\.focus-workspace \*,\s*\.app-toast\s*\{/);
  assert.match(reducedMotionRule, /animation:\s*none !important/);
  assert.match(css, /\.focus-workspace button:focus-visible,[\s\S]*?outline:\s*3px solid var\(--focus\)/);
  const iconButtonRule = [...css.matchAll(/\.focus-workspace \.icon-button \{([^}]*)\}/g)]
    .find((match) => /width:\s*36px/.test(match[1]));
  assert.ok(iconButtonRule, "workspace icon buttons must have a stable base rule");
  assert.match(iconButtonRule[1], /width:\s*36px/);
  assert.match(iconButtonRule[1], /height:\s*36px/);
  assert.match(iconButtonRule[1], /min-height:\s*36px/);
  assert.match(iconButtonRule[1], /padding:\s*0/);

  const activeSegmentRule = css.match(/\.focus-workspace \.segment-control\.task-filter-segments button\.active \{([^}]*)\}/);
  assert.ok(activeSegmentRule, "active task filter segment must have a style rule");
  assert.doesNotMatch(activeSegmentRule[1], /box-shadow/);
  assert.doesNotMatch(baseCss, /\.sidebar-sync-button|\.task-sync-health-bar|\.filter-advanced-details|\.sync-status|\.sync-dot|\.settings-section-nav|\.settings-nav-group/);
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

test("expired desktop sessions keep the real workspace and offer an explicit local mode", async () => {
  const [app, login, authStore, state, http, ipc, banner] = await Promise.all([
    source("desktop/src/App.vue"),
    source("desktop/src/views/LoginView.vue"),
    source("desktop/src/stores/auth.ts"),
    source("desktop/electron/state.ts"),
    source("desktop/electron/http.ts"),
    source("desktop/electron/ipc.ts"),
    source("desktop/src/components/ReauthenticationBanner.vue"),
  ]);

  assert.match(state, /export function expireTokens\(\): void/);
  const expireTokens = extractBalancedBlock(state, "export function expireTokens");
  assert.doesNotMatch(expireTokens, /currentUserId/);
  assert.match(http, /expireTokens\(\);[\s\S]{0,120}broadcastSessionExpired\("refresh-rejected"\)/);
  assert.match(ipc, /serverChanged && \(hasTokens\(\) \|\| previousSettings\.currentUserId !== null\)/);
  assert.match(authStore, /const cachedWorkspaceKey = tryCreateWorkspaceKey\(settings\.baseUrl, settings\.currentUserId\)/);
  assert.match(authStore, /sessionExpired\.value = true;[\s\S]{0,100}workspaceKey\.value = cachedWorkspaceKey/);
  const expireSession = extractBalancedBlock(authStore, "function expireSession");
  assert.doesNotMatch(expireSession, /user\.value = null|workspaceKey\.value = null/);

  assert.match(app, /const continueOfflineAfterExpiry = ref\(false\)/);
  assert.match(app, /<LoginView[\s\S]{0,260}@continue-offline="continueWithCachedWorkspace"/);
  assert.match(app, /<ReauthenticationBanner[\s\S]{0,180}@reauthenticate="showReauthentication"/);
  assert.match(app, /v-show="auth\.isAuthenticated \|\| continueOfflineAfterExpiry"/);
  assert.match(login, /canContinueOffline: boolean/);
  assert.match(login, /cachedTaskCount: number/);
  assert.match(login, /emit\("continueOffline"\)/);
  assert.match(banner, /role="status"/);
  assert.match(banner, /emit\('reauthenticate'\)/);
});

test("desktop batch actions use an explicit selection mode without competing completion controls", async () => {
  const [taskView, taskItem, taskListSection] = await Promise.all([
    source("desktop/src/views/TaskView.vue"),
    source("desktop/src/components/TaskItem.vue"),
    source("desktop/src/components/TaskListSection.vue"),
  ]);

  assert.match(taskView, /const selectionMode = ref\(false\)/);
  assert.match(taskView, /<ListChecks/);
  assert.match(taskView, /v-if="selectionMode" class="bulk-action-toolbar"/);
  assert.match(taskView, /:disabled="bulkActionTargets\.length === 0"/);
  assert.match(taskView, /\$\{bulkActionTargets\.value\.length\} \$\{settingsStore\.t\("task\.selectedCountSuffix"\)\}/);
  const completeSelected = extractBalancedBlock(taskView, "async function completeVisibleTasks");
  assert.doesNotMatch(completeSelected, /requestConfirmation/);
  assert.match(taskItem, /v-if="selectable" class="task-selection-checkbox"/);
  assert.match(taskItem, /v-if="!trash && !selectable"[\s\S]{0,100}class="check-button"/);
  assert.match(taskListSection, /:selectable="selectionMode && selectable"/);
});
