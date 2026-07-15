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

test("workspace quick add preserves input until parent confirms success", async () => {
  const quickAdd = await source("desktop/src/components/WorkspaceQuickAdd.vue");
  const submitMatch = quickAdd.match(
    /function submit\(\): void \{([\s\S]*?)\n\}(?=\n\nfunction clear\()/,
  );

  assert.match(quickAdd, /<form class="workspace-quick-add" @submit\.prevent="submit">/);
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
