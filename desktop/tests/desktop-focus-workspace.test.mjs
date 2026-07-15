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
  assert.match(sidebar, /function syncNow\(\): void \{\s*closeMenu\(\);\s*emit\("syncNow"\)/);
  assert.match(sidebar, /function openSyncDetails\(\): void \{\s*closeMenu\(\);\s*emit\("openSyncDetails"\)/);
  assert.match(sidebar, /function logout\(\): void \{\s*closeMenu\(\);\s*emit\("logout"\)/);
  assert.match(sidebar, /event\.key !== "Escape"[\s\S]{0,120}closeMenu\(\);\s*accountTrigger\.value\?\.focus\(\)/);
});

test("desktop workspace banner exposes polite retry and details actions", async () => {
  const banner = await source("desktop/src/components/WorkspaceStatusBanner.vue");

  assert.match(banner, /aria-live="polite"/);
  assert.match(banner, /aria-atomic="true"/);
  assert.match(banner, /retry: \[\]/);
  assert.match(banner, /openDetails: \[\]/);
  assert.match(banner, /status\.issueCount > 0/);
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
