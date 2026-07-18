import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { compileTsModule, loadTsModule } from "./helpers/load-ts-module.mjs";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "..");
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const execFileAsync = promisify(execFile);

async function source(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("workspace identity normalizes server origin and isolates users and servers", async () => {
  const {
    createWorkspaceKey,
    isLegacyWorkspaceOwner,
    normalizeServerOrigin,
    workspaceDatabaseFileName,
  } = await loadTsModule("shared/workspace.ts");

  assert.equal(normalizeServerOrigin(" HTTPS://Example.COM:443/api/v1/ "), "https://example.com");
  assert.equal(normalizeServerOrigin("http://example.com:8080/custom/api/v1"), "http://example.com:8080");
  assert.equal(createWorkspaceKey("https://example.com/api/v1", 7), "https://example.com::user:7");
  assert.notEqual(
    createWorkspaceKey("https://example.com/api/v1", 7),
    createWorkspaceKey("https://other.example/api/v1", 7),
  );
  assert.notEqual(
    createWorkspaceKey("https://example.com/api/v1", 7),
    createWorkspaceKey("https://example.com/api/v1", 8),
  );
  assert.equal(isLegacyWorkspaceOwner(undefined, "https://example.com::user:7"), false);
  assert.equal(isLegacyWorkspaceOwner("https://example.com::user:7", "https://example.com::user:7"), true);
  assert.equal(isLegacyWorkspaceOwner("https://other.example::user:7", "https://example.com::user:7"), false);
  assert.match(workspaceDatabaseFileName("https://example.com/api/v1", 7), /^taskbridge-workspace-user-7-[a-f0-9]{16}\.sqlite$/);
});

test("legacy sync cursor is restored only when its persisted workspace owner is known", async () => {
  const { EPOCH_SYNC_TIME, migrateLegacyWorkspaceCursor } = await loadTsModule("shared/workspace.ts");
  const legacyCursor = "2026-07-01T12:00:00Z";
  const workspaceKey = "https://one.example::user:9";
  const unclaimed = migrateLegacyWorkspaceCursor({}, legacyCursor, undefined, workspaceKey);

  assert.equal(unclaimed.current, EPOCH_SYNC_TIME);
  assert.equal(unclaimed.legacyWorkspaceKey, "");
  assert.equal(unclaimed.cursors[workspaceKey], undefined);

  const owned = migrateLegacyWorkspaceCursor({}, legacyCursor, workspaceKey, workspaceKey);

  assert.equal(owned.current, legacyCursor);
  assert.equal(owned.legacyWorkspaceKey, workspaceKey);
  assert.equal(owned.cursors[workspaceKey], legacyCursor);

  const otherWorkspace = migrateLegacyWorkspaceCursor(
    owned.cursors,
    legacyCursor,
    owned.legacyWorkspaceKey,
    "https://two.example::user:9",
  );
  assert.equal(otherWorkspace.current, EPOCH_SYNC_TIME);
  assert.equal(otherWorkspace.cursors["https://two.example::user:9"], undefined);
});

test("workspace state is preserved only when reauthentication returns to the same workspace", async () => {
  const { shouldPreserveWorkspaceState } = await loadTsModule("shared/workspace.ts");
  const first = "https://one.example::user:9";

  assert.equal(shouldPreserveWorkspaceState(first, first), true);
  assert.equal(shouldPreserveWorkspaceState(first, "https://two.example::user:9"), false);
  assert.equal(shouldPreserveWorkspaceState(first, null), false);
  assert.equal(shouldPreserveWorkspaceState(null, first), false);
});

test("refresh results cannot overwrite or invalidate a newer server session", async () => {
  const {
    captureAuthSession,
    classifyRefreshCommit,
    canInvalidateAuthSession,
  } = await loadTsModule("shared/auth-session.ts");
  const oldTokens = { accessToken: "access-old", refreshToken: "refresh-old", userId: 9 };
  const oldSession = captureAuthSession("https://one.example/api/v1", oldTokens, "device-1");
  const refreshed = { access_token: "access-rotated", refresh_token: "refresh-rotated" };

  assert.equal(
    classifyRefreshCommit(oldSession, "https://one.example/api/v1", oldTokens, refreshed),
    "commit",
  );
  assert.equal(
    classifyRefreshCommit(oldSession, "https://one.example/api/v1", { accessToken: "access-rotated", refreshToken: "refresh-rotated", userId: 9 }, refreshed),
    "already-applied",
  );
  assert.equal(
    classifyRefreshCommit(oldSession, "https://two.example/api/v1", { accessToken: "access-new", refreshToken: "refresh-new", userId: 10 }, refreshed),
    "stale",
  );
  assert.equal(
    canInvalidateAuthSession(oldSession, "https://two.example/api/v1", { accessToken: "access-new", refreshToken: "refresh-new", userId: 10 }),
    false,
  );
  assert.equal(
    canInvalidateAuthSession(oldSession, "https://one.example/api/v1", oldTokens),
    true,
  );
  assert.equal(
    canInvalidateAuthSession(oldSession, "https://one.example/api/v1", { ...oldTokens, userId: 10 }),
    false,
  );
});

test("generic settings IPC cannot mutate connection or identity fields", async () => {
  const { isMutableAppSettingKey } = await loadTsModule("shared/settings-policy.ts");

  assert.equal(isMutableAppSettingKey("language"), true);
  assert.equal(isMutableAppSettingKey("displayTimeZone"), true);
  assert.equal(isMutableAppSettingKey("baseUrl"), false);
  assert.equal(isMutableAppSettingKey("wsUrl"), false);
  assert.equal(isMutableAppSettingKey("currentUserId"), false);
  assert.equal(isMutableAppSettingKey("deviceId"), false);
});

test("legacy SQLite migration includes committed WAL rows and publishes atomically", async () => {
  const compiledModule = await compileTsModule(
    "electron/sqlite-migration.ts",
    { resolvePackagesFromProject: true },
  );
  const directory = await mkdtemp(join(tmpdir(), "taskbridge-sqlite-migration-"));
  const sourcePath = join(directory, "legacy.sqlite");
  const destinationPath = join(directory, "workspace.sqlite");
  const runnerPath = join(compiledModule.tempDir, "sqlite-migration-runner.mjs");
  try {
    await writeFile(
      runnerPath,
      `
        import Database from "better-sqlite3";
        import { existsSync } from "node:fs";
        import { migrateSqliteDatabase } from "./${basename(compiledModule.modulePath)}";

        const [sourcePath, destinationPath] = process.argv.slice(2);
        const source = new Database(sourcePath);
        source.pragma("journal_mode = WAL");
        source.pragma("wal_autocheckpoint = 0");
        source.exec("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
        source.pragma("wal_checkpoint(TRUNCATE)");
        source.prepare("INSERT INTO tasks (title) VALUES (?)").run("committed in wal");
        const walPresent = existsSync(sourcePath + "-wal");
        const migrated = migrateSqliteDatabase(sourcePath, destinationPath);
        const destination = new Database(destinationPath, { readonly: true });
        const rows = destination.prepare("SELECT title FROM tasks").all();
        const quickCheck = destination.pragma("quick_check", { simple: true });
        destination.close();
        source.close();
        process.stdout.write(JSON.stringify({
          walPresent,
          migrated,
          rows,
          quickCheck,
          temporaryPresent: existsSync(destinationPath + ".migrating"),
        }));
      `,
      "utf8",
    );
    const { stdout } = await execFileAsync(
      electronPath,
      [runnerPath, sourcePath, destinationPath],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        windowsHide: true,
      },
    );
    assert.deepEqual(JSON.parse(stdout), {
      walPresent: true,
      migrated: true,
      rows: [{ title: "committed in wal" }],
      quickCheck: "ok",
      temporaryPresent: false,
    });
  } finally {
    await compiledModule.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});

test("desktop state and database select a migrated origin-plus-user workspace", async () => {
  const [state, database] = await Promise.all([
    source("desktop/electron/state.ts"),
    source("desktop/electron/db.ts"),
  ]);

  assert.match(state, /lastSyncTimeByWorkspace\?: Record<string, string>/);
  assert.match(state, /legacyLastSyncWorkspaceKey\?: string/);
  assert.match(state, /export function getActiveWorkspaceKey/);
  assert.match(state, /export function claimLegacyUserDatabaseWorkspace/);
  assert.doesNotMatch(state, /const preserveLegacyNetworkSettings = hasStoredSessionCredentials\(\)/);
  assert.match(database, /workspaceDatabaseFileName/);
  assert.match(database, /claimLegacyUserDatabaseWorkspace/);
  assert.doesNotMatch(database, /key: `user-\$\{userId\}`/);
});

test("refresh rejection broadcasts session expiry and renderer stops services", async () => {
  const [http, preload, env, authStore, app] = await Promise.all([
    source("desktop/electron/http.ts"),
    source("desktop/electron/preload.ts"),
    source("desktop/src/env.d.ts"),
    source("desktop/src/stores/auth.ts"),
    source("desktop/src/App.vue"),
  ]);

  assert.match(http, /broadcastSessionExpired\("refresh-rejected"\)/);
  assert.match(preload, /onSessionExpired/);
  assert.match(preload, /taskbridge:session-expired/);
  assert.match(env, /onSessionExpired/);
  assert.match(authStore, /const sessionExpired = ref\(false\)/);
  assert.match(authStore, /const workspaceKey = ref<string \| null>\(null\)/);
  assert.match(authStore, /function expireSession/);
  assert.match(app, /onSessionExpired/);
  assert.match(app, /syncStore\.stop\(\)/);
  assert.match(app, /auth\.expireSession/);
  assert.match(app, /keepWorkspaceMounted/);
  assert.match(app, /sessionExpiredReason === "refresh-rejected"/);
  assert.match(app, /shouldPreserveWorkspaceState/);
  assert.match(app, /taskStore\.resetWorkspace\(\)/);
  assert.match(app, /:key="workspaceInstanceKey"/);
  assert.match(app, /v-if="!isFloating && keepWorkspaceMounted"/);
  assert.match(app, /v-show="auth\.isAuthenticated \|\| continueOfflineAfterExpiry"/);
});

test("stopped sync runs cannot continue into a switched workspace", async () => {
  const manager = await source("desktop/src/sync/SyncManager.ts");

  assert.match(manager, /private generation = 0/);
  assert.match(manager, /this\.generation \+= 1/);
  assert.match(manager, /isRunActive\(generation\)/);
  assert.match(manager, /pushPendingChanges\([^)]*generation/);
  assert.match(manager, /pullRemoteChanges\([^)]*generation/);
});

test("Windows lifecycle is single-instance, hidden on login launch, and signed-out safe", async () => {
  const [main, autoStart, tray] = await Promise.all([
    source("desktop/electron/main.ts"),
    source("desktop/electron/auto-start.ts"),
    source("desktop/electron/tray.ts"),
  ]);

  assert.match(main, /app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /app\.on\("second-instance"/);
  assert.match(main, /process\.argv\.includes\("--hidden"\)/);
  assert.match(main, /hasTokens\(\)[\s\S]{0,100}floatingVisibleOnStart/);
  assert.match(main, /closeToTrayNoticeShown/);
  assert.match(autoStart, /args:\s*\["--hidden"\]/);
  assert.match(tray, /hasTokens\(\)\s*\?\s*"已同步"\s*:\s*"未登录"/);
});

test("desktop updater uses an ESM-to-CommonJS compatible runtime import", async () => {
  const updater = await source("desktop/electron/updater.ts");

  assert.doesNotMatch(
    updater,
    /import\s*\{\s*autoUpdater\s*\}\s*from\s*["']electron-updater["']/,
    "electron-updater is externalized CommonJS, so a named ESM import crashes the built main process",
  );
  assert.match(updater, /import\s+\w+\s+from\s+["']electron-updater["']/);
});

test("task and login submissions are latched and quick add focuses the title", async () => {
  const [login, taskView, todayView, editor, drawer] = await Promise.all([
    source("desktop/src/views/LoginView.vue"),
    source("desktop/src/views/TaskView.vue"),
    source("desktop/src/views/TodayView.vue"),
    source("desktop/src/components/TaskEditor.vue"),
    source("desktop/src/components/EditorDrawer.vue"),
  ]);

  assert.match(login, /const submitting = ref\(false\)/);
  assert.match(login, /if \(submitting\.value\) return/);
  assert.match(login, /:disabled="submitting \|\| auth\.loading"/);
  for (const view of [taskView, todayView]) {
    assert.match(view, /const isSaving = ref\(false\)/);
    assert.match(view, /if \(isSaving\.value\) return/);
    assert.match(view, /:is-saving="isSaving"/);
  }
  assert.match(editor, /isSaving\?: boolean/);
  assert.match(editor, /:disabled="isSaving"/);
  assert.match(drawer, /\[data-initial-focus\], \[autofocus\]/);
});

test("desktop accessibility exposes auth errors and editor disclosure state", async () => {
  const [login, editor] = await Promise.all([
    source("desktop/src/views/LoginView.vue"),
    source("desktop/src/components/TaskEditor.vue"),
  ]);

  assert.match(login, /role="alert"/);
  assert.match(login, /aria-live="(?:assertive|polite)"/);
  assert.match(editor, /aria-expanded/);
  assert.match(editor, /aria-controls/);
  assert.match(editor, /id="task-editor-body-fields"/);
  assert.match(editor, /id="task-editor-arrangement-fields"/);
  assert.match(editor, /id="task-editor-more-fields"/);
});

test("floating truncation, shortcut conflict, and notification task routing are explicit", async () => {
  const [floatingStore, floatingView, shortcut, notification, ipc, app] = await Promise.all([
    source("desktop/src/stores/floating.ts"),
    source("desktop/src/views/FloatingView.vue"),
    source("desktop/electron/shortcut.ts"),
    source("desktop/electron/notification.ts"),
    source("desktop/electron/ipc.ts"),
    source("desktop/src/App.vue"),
  ]);

  assert.match(floatingStore, /hiddenTaskCount/);
  assert.match(floatingView, /hiddenTaskCount/);
  assert.match(shortcut, /const registered = globalShortcut\.register/);
  assert.match(shortcut, /shortcut registration failed/i);
  assert.match(notification, /localId\?: string/);
  assert.match(notification, /notification\.on\("click"/);
  assert.match(ipc, /validateOptionalLocalId/);
  assert.match(app, /task\.localId/);
});

test("task API uses configured timezone and account security contracts are reachable", async () => {
  const [taskApi, authApi, settingsView, securityPanel] = await Promise.all([
    source("desktop/src/api/task.ts"),
    source("desktop/src/api/auth.ts"),
    source("desktop/src/views/SettingsView.vue"),
    source("desktop/src/components/settings/SettingsAccountSecurityPanel.vue"),
  ]);

  assert.match(taskApi, /timezone\?: string/);
  assert.match(taskApi, /params\.set\("timezone"/);
  assert.match(taskApi, /export function fetchTaskMeta/);
  assert.match(taskApi, /request\.get\("\/tasks", \{ params/);
  assert.match(taskApi, /request\.get\("\/tasks\/meta", \{ params/);
  assert.doesNotMatch(taskApi, /`\/tasks\?\$\{/);
  assert.match(settingsView, /fetchTaskMeta\(settings\.displayTimeZone\)/);
  assert.match(authApi, /export function listSessions/);
  assert.match(authApi, /export function revokeSession/);
  assert.match(authApi, /export function revokeOtherSessions/);
  assert.match(authApi, /export function changePassword/);
  assert.match(securityPanel, /currentPassword/);
  assert.match(securityPanel, /newPassword/);
  assert.match(securityPanel, /revokeOtherSessions/);
});
