import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

import { findUnexpectedRuntimeLogLines, workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);
const electronPath = resolve(desktopRoot, "node_modules/electron/dist/electron.exe");
const mainPath = resolve(desktopRoot, "out/main/index.js");
const screenshotDirectory = resolve(repoRoot, "docs/assets");
const apiRequests = [];
const unexpectedApiPaths = new Set();
const runtimeLogs = [];
const expectedRuntimeWarningPatterns = [
  /^\[TaskBridge\] shortcut registration failed\b/,
];
let electronProcess;
let cdp;
let apiServer;
let userDataDirectory;

async function main() {
  assert.equal(process.platform, "win32", "desktop focus visual check currently requires Windows");
  assert.ok(existsSync(electronPath), "Electron runtime is missing; run npm ci in desktop first");
  assert.ok(existsSync(mainPath), "desktop build is missing; run npm run build before visual verification");

  try {
    userDataDirectory = await mkdtemp(join(tmpdir(), "taskbridge-desktop-focus-"));
    apiServer = createApiServer();
    await listen(apiServer);
    const apiPort = apiServer.address().port;
    const cdpPort = await reservePort();
    await writeIsolatedSettings(apiPort);

    electronProcess = launchElectron(cdpPort);
    const pageTarget = await waitForPageTarget(cdpPort);
    cdp = await CdpClient.connect(pageTarget.webSocketDebuggerUrl, pageTarget.id);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Accessibility.enable");
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });

    await cdp.waitFor("document.readyState === 'complete'", "renderer load");
    await cdp.waitFor("Boolean(document.querySelector('.login-shell'))", "login view");
    await installDomHelpers();
    await loginThroughUserInterface();

    await verifyTodayWorkspace();
    await verifyAllTasksWorkspace();
    await verifySettingsWorkspace();
    await verifyStatusAndMotionStates();
    await assertNoRuntimeErrors();

    assert.deepEqual(
      [...unexpectedApiPaths],
      [],
      `visual check reached unhandled API paths: ${[...unexpectedApiPaths].join(", ")}`,
    );

    console.log("desktop focus visual check passed");
    for (const request of apiRequests) console.log(`  ${request}`);
  } catch (error) {
    console.error(error);
    if (apiRequests.length > 0) {
      console.error(`API requests before failure: ${apiRequests.join(", ")}`);
    }
    if (cdp) {
      try {
        const rendererState = await cdp.evaluate(`(() => {
          const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
          const taskStore = pinia?._s?.get('task');
          const syncStore = pinia?._s?.get('sync');
          return {
            pageText: document.body.innerText.slice(0, 800),
            taskRows: document.querySelectorAll('.task-row').length,
            todayRows: document.querySelectorAll('.today-view .task-row').length,
            activeTasks: taskStore?.activeTasks?.length,
            todayTasks: taskStore?.todayTasks?.length,
            syncStatus: syncStore?.status,
            syncMessage: syncStore?.message,
            visualErrors: window.__taskBridgeVisualErrors ?? [],
          };
        })()`);
        console.error(`Renderer state: ${JSON.stringify(rendererState)}`);
        const asyncProbe = await cdp.evaluate(`Promise.race([
          (async () => {
            const rows = await window.taskBridge.db.listTasks();
            const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
            await pinia._s.get('task').load();
            return { completed: true, dbRows: rows.length, loadedTasks: pinia._s.get('task').activeTasks.length };
          })(),
          new Promise((resolve) => setTimeout(() => resolve({ completed: false }), 3000)),
        ])`);
        console.error(`Async bridge probe: ${JSON.stringify(asyncProbe)}`);
        const manualSyncProbe = await cdp.evaluate(`Promise.race([
          (async () => {
            const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
            const taskStore = pinia._s.get('task');
            const syncStore = pinia._s.get('sync');
            await syncStore.start(() => taskStore.load());
            return { completed: true, status: syncStore.status, activeTasks: taskStore.activeTasks.length };
          })(),
          new Promise((resolve) => setTimeout(() => resolve({ completed: false }), 5000)),
        ])`);
        console.error(`Manual sync probe: ${JSON.stringify(manualSyncProbe)}`);
      } catch (diagnosticError) {
        console.error(`Unable to read renderer state: ${diagnosticError}`);
      }
    }
    if (runtimeLogs.length > 0) {
      console.error("Electron runtime log tail:");
      console.error(runtimeLogs.join("").slice(-4000));
    }
    if (cdp?.events.length > 0) {
      console.error(`CDP event tail: ${JSON.stringify(cdp.events.slice(-20))}`);
    }
    throw error;
  } finally {
    cdp?.close();
    await stopElectron(electronProcess);
    if (apiServer) {
      apiServer.closeAllConnections?.();
      await new Promise((resolveClose) => apiServer.close(() => resolveClose()));
    }
    if (userDataDirectory) {
      await rm(userDataDirectory, { recursive: true, force: true });
    }
  }
}

function createApiServer() {
  const tasks = buildServerTasks();
  const user = {
    id: 1,
    username: "desktop-reviewer",
    email: "reviewer@taskbridge.test",
    is_active: true,
    created_at: isoOffset(-7 * 86_400_000),
    updated_at: isoOffset(-60_000),
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = url.pathname.replace(/^\/api\/v1/, "") || "/";
      const method = request.method ?? "GET";
      const body = await readJsonBody(request);
      apiRequests.push(`${method} ${path}`);

      if (method === "GET" && path === "/auth/registration") {
        return sendEnvelope(response, { registration_enabled: false });
      }
      if (method === "GET" && path === "/sync/status") {
        return sendEnvelope(response, {
          status: "ready",
          database: "ok",
          redis: "ok",
          websocket: "enabled",
          server_time: isoOffset(0),
          limits: { push_max_changes: 100, pull_default_limit: 200, pull_max_limit: 500 },
        });
      }
      if (method === "POST" && path === "/auth/login") {
        assert.equal(body?.username_or_email, "desktop-reviewer");
        assert.equal(body?.password, "visual-check-password");
        return sendEnvelope(response, {
          access_token: "visual-access-token",
          refresh_token: "visual-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user,
        });
      }
      if (method === "POST" && path === "/auth/refresh") {
        return sendEnvelope(response, {
          access_token: "visual-access-token-refreshed",
          refresh_token: "visual-refresh-token-refreshed",
        });
      }
      if (method === "GET" && path === "/auth/me") return sendEnvelope(response, user);
      if (method === "POST" && path === "/auth/ws-ticket") {
        return sendEnvelope(response, { ticket: "visual-ws-ticket", expires_in: 60 });
      }
      if (method === "GET" && path === "/auth/sessions") {
        return sendEnvelope(response, [
          {
            id: 1,
            device_id: body?.device_id ?? null,
            created_at: isoOffset(-3_600_000),
            expires_at: isoOffset(7 * 86_400_000),
            revoked_at: null,
          },
        ]);
      }
      if (method === "POST" && path === "/devices/register") {
        return sendEnvelope(response, {
          id: 1,
          user_id: 1,
          device_id: body?.device_id,
          device_name: body?.device_name,
          device_type: body?.device_type,
          created_at: isoOffset(-60_000),
          updated_at: isoOffset(0),
        });
      }
      if (method === "GET" && path === "/sync/pull") {
        const firstPull = (url.searchParams.get("last_sync_time") ?? "").startsWith("1970-01-01");
        return sendEnvelope(response, {
          changed_tasks: firstPull ? tasks : [],
          deleted_tasks: [],
          server_time: isoOffset(0),
          has_more: false,
          next_cursor_updated_at: null,
          next_cursor_id: null,
        });
      }
      if (method === "POST" && path === "/sync/push") {
        const changes = Array.isArray(body?.changes) ? body.changes : [];
        return sendEnvelope(response, {
          results: changes.map((change, index) => ({
            local_id: change.local_id,
            server_id: 1000 + index,
            action: change.action,
            status: "applied",
            version: Math.max(1, Number(change.version ?? 0) + 1),
            message: null,
            task: null,
            server_task: null,
          })),
          server_time: isoOffset(0),
        });
      }
      if (method === "GET" && path === "/tasks/meta") {
        return sendEnvelope(response, {
          projects: ["TaskBridge 桌面端重设计", "季度客户体验复盘"],
          tags: ["交互验收", "需要跨团队持续跟进并在下周复盘的关键客户反馈"],
          counts: { open: 5, completed: 1, inbox: 1, today: 4, overdue: 1, templates: 0, trash: 0 },
        });
      }

      unexpectedApiPaths.add(`${method} ${path}`);
      return sendEnvelope(response, null, 404, "Not found");
    } catch (error) {
      return sendEnvelope(response, null, 500, error instanceof Error ? error.message : String(error));
    }
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  return server;
}

function buildServerTasks() {
  const today = localDate(0);
  const tomorrow = localDate(86_400_000);
  const base = {
    user_id: 1,
    content: null,
    status: "pending",
    priority: 0,
    tag: null,
    project: null,
    list_type: "today",
    due_time: null,
    remind_time: null,
    repeat_rule: null,
    planned_date: today,
    completed_at: null,
    snoozed_until: null,
    parent_task_id: null,
    checklist: [],
    is_template: false,
    template_name: null,
    sort_order: 0,
    version: 1,
    is_deleted: false,
    created_at: isoOffset(-2 * 86_400_000),
    updated_at: isoOffset(-60_000),
    deleted_at: null,
  };
  const task = (id, title, overrides = {}) => ({ ...base, id, title, sort_order: id, ...overrides });
  return [
    task(1, "修复发布流程中仍然阻塞用户安装的签名问题", {
      due_time: isoOffset(-26 * 3_600_000),
      priority: 5,
      project: "TaskBridge 桌面端重设计",
    }),
    task(2, "确认今天的桌面端回归测试结果", {
      due_time: isoOffset(2 * 3_600_000),
      tag: "交互验收",
    }),
    task(3, "这是一个用于确认超长任务标题会自然换行而不会遮挡完成按钮、更多操作菜单或下一条任务内容的桌面端布局验收任务", {
      content: "长标题需要完整可读，任务行可以增高，但不能制造横向滚动。",
      due_time: isoOffset(5 * 3_600_000),
    }),
    task(4, "整理客户反馈并安排跨团队复盘", {
      tag: "需要跨团队持续跟进并在下周复盘的关键客户反馈",
      project: "季度客户体验复盘",
      checklist: [
        { id: "item-1", title: "归类反馈", done: true },
        { id: "item-2", title: "确认负责人", done: false },
      ],
      priority: 3,
    }),
    task(5, "准备明天的版本说明", {
      list_type: "inbox",
      planned_date: tomorrow,
      project: "TaskBridge 桌面端重设计",
    }),
    task(6, "已完成的桌面端信息架构复核", {
      status: "completed",
      completed_at: isoOffset(-3_600_000),
      planned_date: today,
    }),
  ];
}

async function writeIsolatedSettings(apiPort) {
  await writeFile(
    join(userDataDirectory, "config.json"),
    `${JSON.stringify({
      settingsSchemaVersion: 4,
      baseUrl: `http://127.0.0.1:${apiPort}/api/v1`,
      wsUrl: `ws://127.0.0.1:${apiPort}/ws/sync`,
      language: "zh-CN",
      desktopTheme: "warm",
      displayTimeZone: "Asia/Shanghai",
      lastSyncTime: "1970-01-01T00:00:00Z",
      autoStart: false,
      floatingOpacity: 0.96,
      floatingVisibleOnStart: false,
      floatingWidth: 320,
      floatingHeight: 460,
    }, null, 2)}\n`,
    "utf8",
  );
}

function launchElectron(cdpPort) {
  const child = spawn(
    electronPath,
    [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDirectory}`,
      mainPath,
    ],
    {
      cwd: desktopRoot,
      env: { ...process.env, TASKBRIDGE_DISABLE_AUTO_UPDATE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout.on("data", (chunk) => runtimeLogs.push(String(chunk)));
  child.stderr.on("data", (chunk) => runtimeLogs.push(String(chunk)));
  return child;
}

async function installDomHelpers() {
  await cdp.evaluate(`(() => {
    window.__taskBridgeVisualErrors = [];
    window.addEventListener('error', (event) => {
      window.__taskBridgeVisualErrors.push(event.error?.stack ?? event.message ?? String(event.error));
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__taskBridgeVisualErrors.push(event.reason?.stack ?? event.reason?.message ?? String(event.reason));
    });
    const visible = (element) => Boolean(
      element &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden"
    );
    const elements = (selector) => [...document.querySelectorAll(selector)];
    const setValue = (selector, value, index = 0) => {
      const element = elements(selector)[index];
      if (!element) throw new Error("Missing input: " + selector + " #" + index);
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
      descriptor.set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return element.value;
    };
    const click = (selector, index = 0, focus = false) => {
      const element = elements(selector)[index];
      if (!element) throw new Error("Missing click target: " + selector + " #" + index);
      if (focus) element.focus();
      element.click();
    };
    const clickText = (selector, text, root = document) => {
      const element = [...root.querySelectorAll(selector)].find((item) => item.textContent.trim() === text);
      if (!element) throw new Error("Missing text target: " + selector + " / " + text);
      element.click();
    };
    window.__taskBridgeVisual = { visible, elements, setValue, click, clickText };
    return true;
  })()`);
}

async function assertNoRuntimeErrors() {
  const rendererErrors = await cdp.evaluate(
    "(window.__taskBridgeVisualErrors ?? []).map((error) => String(error))",
  );
  const runtimeExceptions = cdp.events
    .filter((event) => event.method === "Runtime.exceptionThrown")
    .map((event) =>
      event.params?.exceptionDetails?.exception?.description ??
      event.params?.exceptionDetails?.text ??
      JSON.stringify(event.params ?? event),
    );
  const consoleErrors = cdp.events
    .filter(
      (event) =>
        event.method === "Runtime.consoleAPICalled" &&
        ["assert", "error"].includes(event.params?.type),
    )
    .map((event) =>
      (event.params?.args ?? [])
        .map((argument) => argument.value ?? argument.description ?? argument.type)
        .join(" "),
    );
  const processErrors = findUnexpectedRuntimeLogLines(runtimeLogs).filter(
    (line) => !expectedRuntimeWarningPatterns.some((pattern) => pattern.test(line)),
  );

  assert.deepEqual(rendererErrors, [], "renderer emitted an error or unhandled rejection");
  assert.deepEqual(runtimeExceptions, [], "CDP observed an uncaught renderer exception");
  assert.deepEqual(consoleErrors, [], "renderer wrote an unexpected console error");
  assert.deepEqual(processErrors, [], "Electron main process wrote an unexpected error");
}

async function loginThroughUserInterface() {
  await cdp.evaluate(`(() => {
    window.__taskBridgeVisual.setValue('.auth-main-form input[autocomplete="email"]', 'desktop-reviewer');
    window.__taskBridgeVisual.setValue('.auth-main-form input[autocomplete="current-password"]', 'visual-check-password');
    window.__taskBridgeVisual.click('.auth-main-form button.primary-button[type="submit"]');
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.focus-workspace'))", "authenticated workspace", 15_000);
  await cdp.waitFor("document.querySelectorAll('.today-view .task-row').length >= 4", "synced task data", 15_000);
  assert.equal(await cdp.evaluate("document.querySelectorAll('.workspace-status-banner').length"), 0);
}

async function verifyTodayWorkspace() {
  const metrics = await setWindowSize(1440, 1000);
  await assertWorkspaceLayout(184, metrics, "today-wide");
  await assertAccountMenuInsideViewport();
  await assertNoUnnamedInteractiveControls("today");
  await captureVerifiedScreenshot("desktop-focus-1440.png", metrics);

  const drawerMetrics = await cdp.evaluate(`(() => {
    const list = document.querySelector('.today-view .task-list');
    const opener = document.querySelector('.today-view .view-header .primary-button');
    window.__taskBridgeVisual.drawerOpener = opener;
    window.__taskBridgeVisual.listWidthBeforeDrawer = list.getBoundingClientRect().width;
    opener.focus();
    opener.click();
    return { listWidth: window.__taskBridgeVisual.listWidthBeforeDrawer };
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.side-panel'))", "today editor drawer");
  const drawerState = await cdp.evaluate(`(() => {
    const panel = document.querySelector('.side-panel');
    const list = document.querySelector('.today-view .task-list');
    const title = panel.querySelector('input[type="text"]');
    const rect = panel.getBoundingClientRect();
    return {
      width: rect.width,
      right: rect.right,
      viewport: innerWidth,
      listWidth: list.getBoundingClientRect().width,
      titleFocused: document.activeElement === title,
    };
  })()`);
  assert.ok(drawerState.width <= 440.5, `wide drawer must not exceed 440px: ${drawerState.width}`);
  assert.ok(Math.abs(drawerState.right - drawerState.viewport) <= 1, "drawer must align with the workspace edge");
  assert.ok(Math.abs(drawerState.listWidth - drawerMetrics.listWidth) <= 1, "drawer must overlay instead of shrinking the list");
  assert.equal(drawerState.titleFocused, true, "drawer must focus the title input");

  await setEditorTitle("未保存的焦点恢复验收草稿");
  await cdp.evaluate("window.__taskBridgeVisual.click('.side-panel .panel-header .ghost-button')");
  await cdp.waitFor("Boolean(document.querySelector('.confirm-dialog'))", "discard confirmation");
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('.side-panel input').value)"), true);
  await cdp.evaluate("window.__taskBridgeVisual.click('.confirm-dialog-actions .secondary-button')");
  await cdp.waitFor("!document.querySelector('.confirm-dialog') && Boolean(document.querySelector('.side-panel'))", "discard cancellation");
  assert.equal(
    await cdp.evaluate("document.querySelector('.side-panel input[type=\"text\"]').value"),
    "未保存的焦点恢复验收草稿",
  );
  await closeDirtyEditorAndConfirm();
  assert.equal(
    await cdp.evaluate("document.activeElement === window.__taskBridgeVisual.drawerOpener"),
    true,
    "drawer close must restore focus to its opener",
  );

  await verifyEditorSaveFailurePreservesDraft();
  await verifySuccessToast();
}

async function verifyEditorSaveFailurePreservesDraft() {
  await cdp.evaluate(`(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const taskStore = pinia._s.get('task');
    window.__taskBridgeVisual.originalAddTask = taskStore.addTask;
    taskStore.addTask = async () => { throw new Error('visual save failure'); };
    const opener = document.querySelector('.today-view .view-header .primary-button');
    window.__taskBridgeVisual.drawerOpener = opener;
    opener.focus();
    opener.click();
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.side-panel'))", "save-failure editor");
  await setEditorTitle("保存失败后必须保留的草稿");
  await cdp.evaluate("window.__taskBridgeVisual.click('.side-panel .task-editor button[type=submit]')");
  await cdp.waitFor("Boolean(document.querySelector('.task-editor-save-error[role=alert]'))", "save failure alert");
  const failureState = await cdp.evaluate(`(() => ({
    draft: document.querySelector('.side-panel input[type="text"]').value,
    drawerOpen: Boolean(document.querySelector('.side-panel')),
    alertText: document.querySelector('.task-editor-save-error').textContent.trim(),
  }))()`);
  assert.equal(failureState.draft, "保存失败后必须保留的草稿");
  assert.equal(failureState.drawerOpen, true);
  assert.ok(failureState.alertText.length > 0);
  await cdp.evaluate(`(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia._s.get('task').addTask = window.__taskBridgeVisual.originalAddTask;
  })()`);
  await closeDirtyEditorAndConfirm();
}

async function verifySuccessToast() {
  await cdp.evaluate(`(() => {
    window.__taskBridgeVisual.setValue('.today-view .workspace-quick-add input', '视觉验收成功反馈');
    window.__taskBridgeVisual.click('.today-view .workspace-quick-add button[type="submit"]');
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.app-toast[role=status]'))", "success status toast");
  assert.ok((await cdp.evaluate("document.querySelector('.app-toast').textContent.trim()")).length > 0);
  await cdp.waitFor("!document.querySelector('.app-toast')", "toast dismissal", 5_000);
}

async function verifyAllTasksWorkspace() {
  await cdp.evaluate("window.__taskBridgeVisual.click('.nav-list button[aria-label=\"全部\"]')");
  await cdp.waitFor("document.querySelector('.view-header h1')?.textContent.trim() === '全部待办'", "all tasks view");
  const metrics = await setWindowSize(1024, 768);
  await assertWorkspaceLayout(72, metrics, "tasks-medium");
  await assertAccountMenuInsideViewport();

  assert.equal(await cdp.evaluate("Boolean(document.querySelector('.bulk-action-toolbar'))"), false);
  await cdp.evaluate("window.__taskBridgeVisual.click('.task-command-actions button[aria-label=\"批量选择任务\"]')");
  await cdp.waitFor("Boolean(document.querySelector('.bulk-action-toolbar')) && Boolean(document.querySelector('.task-selection-checkbox input'))", "selection mode");
  assert.equal(
    await cdp.evaluate("[...document.querySelectorAll('.bulk-action-toolbar button.secondary-button')].every((button) => button.disabled)"),
    true,
    "selection actions must start disabled before a task is selected",
  );
  await cdp.evaluate("window.__taskBridgeVisual.click('.task-selection-checkbox input')");
  await cdp.waitFor("document.querySelector('.bulk-action-toolbar span')?.textContent.includes('1 条已选')", "selected task count");
  assert.equal(
    await cdp.evaluate("[...document.querySelectorAll('.bulk-action-toolbar button.secondary-button')].every((button) => !button.disabled)"),
    true,
    "selection actions must enable after selecting a task",
  );
  await cdp.evaluate("window.__taskBridgeVisual.click('.task-selection-checkbox input')");
  await cdp.waitFor("document.querySelector('.bulk-action-toolbar span')?.textContent.includes('0 条已选')", "cleared selected task count");
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('.bulk-action-toolbar'))"), true);
  await cdp.evaluate("window.__taskBridgeVisual.click('.bulk-action-toolbar .text-button')");
  await cdp.waitFor("!document.querySelector('.bulk-action-toolbar') && !document.querySelector('.task-selection-checkbox')", "selection mode exit");

  await cdp.evaluate("window.__taskBridgeVisual.click('.filter-menu > summary')");
  await cdp.waitFor("Boolean(document.querySelector('.filter-menu[open] .filter-menu-panel'))", "filter menu");
  await assertElementInsideViewport(".filter-menu-panel", "filter menu");
  await cdp.evaluate("window.__taskBridgeVisual.click('.filter-menu > summary')");

  await cdp.evaluate("window.__taskBridgeVisual.click('.task-menu > summary')");
  await cdp.waitFor("Boolean(document.querySelector('.task-menu[open] .task-menu-panel'))", "task menu");
  await assertElementInsideViewport(".task-menu-panel", "task menu");
  await cdp.evaluate("window.__taskBridgeVisual.click('.task-menu > summary')");

  const longContentState = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.task-row')];
    const longTitle = [...document.querySelectorAll('.task-title')].find((item) => item.textContent.includes('超长任务标题'));
    const longTag = [...document.querySelectorAll('.task-meta span')].find((item) => item.textContent.includes('需要跨团队持续跟进'));
    const inside = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1;
    };
    return {
      rowsInside: rows.every(inside),
      titleInside: inside(longTitle),
      titleWrap: getComputedStyle(longTitle).whiteSpace === 'normal' && longTitle.scrollWidth <= longTitle.clientWidth + 1,
      tagInside: inside(longTag),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  })()`);
  assert.equal(longContentState.rowsInside, true, "task rows must stay inside the viewport");
  assert.equal(longContentState.titleInside, true, "long title must stay inside the viewport");
  assert.equal(longContentState.titleWrap, true, "long title must wrap without clipping");
  assert.equal(longContentState.tagInside, true, "long tag must stay inside the viewport");
  assert.ok(longContentState.horizontalOverflow <= 1, `tasks view horizontal overflow: ${longContentState.horizontalOverflow}`);

  await assertNoUnnamedInteractiveControls("all tasks");
  await captureVerifiedScreenshot("desktop-focus-1024.png", metrics);
  await verifyNarrowTaskInteractions();
}

async function verifyNarrowTaskInteractions() {
  const metrics = await setWindowSize(799, 700);
  await assertWorkspaceLayout(64, metrics, "tasks-narrow");

  await cdp.evaluate("window.__taskBridgeVisual.click('.filter-menu > summary')");
  await cdp.waitFor("Boolean(document.querySelector('.filter-menu[open] .filter-menu-panel'))", "narrow filter menu");
  await assertElementInsideViewport(".filter-menu-panel", "narrow filter menu");
  await assertNoUnnamedInteractiveControls("all tasks filter menu");
  await cdp.evaluate("window.__taskBridgeVisual.click('.filter-menu > summary')");

  await cdp.evaluate("window.__taskBridgeVisual.click('.task-menu > summary')");
  await cdp.waitFor("Boolean(document.querySelector('.task-menu[open] .task-menu-panel'))", "narrow task menu");
  await assertElementInsideViewport(".task-menu-panel", "narrow task menu");
  await assertNoUnnamedInteractiveControls("all tasks task menu");
  await cdp.evaluate("window.__taskBridgeVisual.click('.task-menu > summary')");

  const drawerMetrics = await cdp.evaluate(`(() => {
    const list = document.querySelector('.task-list');
    const opener = document.querySelector('.task-command-bar .primary-button');
    window.__taskBridgeVisual.drawerOpener = opener;
    opener.focus();
    const listWidth = list.getBoundingClientRect().width;
    opener.click();
    return { listWidth };
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.side-panel'))", "narrow task drawer");
  const drawerState = await cdp.evaluate(`(() => {
    const panel = document.querySelector('.side-panel');
    const panelRect = panel.getBoundingClientRect();
    const sidebarRect = document.querySelector('.app-sidebar').getBoundingClientRect();
    const listWidth = document.querySelector('.task-list').getBoundingClientRect().width;
    return {
      left: panelRect.left,
      right: panelRect.right,
      width: panelRect.width,
      sidebarRight: sidebarRect.right,
      viewport: innerWidth,
      listWidth,
      titleFocused: document.activeElement === panel.querySelector('input[type="text"]'),
    };
  })()`);
  assert.ok(drawerState.left >= drawerState.sidebarRight - 1, "narrow drawer must not cover primary navigation");
  assert.ok(Math.abs(drawerState.right - drawerState.viewport) <= 1, "narrow drawer must align with the viewport edge");
  assert.ok(drawerState.width <= 440.5, `narrow drawer must not exceed 440px: ${drawerState.width}`);
  assert.ok(Math.abs(drawerState.listWidth - drawerMetrics.listWidth) <= 1, "narrow drawer must overlay instead of shrinking the list");
  assert.equal(drawerState.titleFocused, true, "narrow drawer must focus the title input");
  await assertNoUnnamedInteractiveControls("all tasks narrow drawer");
  await cdp.evaluate("window.__taskBridgeVisual.click('.side-panel .panel-header .ghost-button')");
  await cdp.waitFor("!document.querySelector('.side-panel')", "narrow task drawer close");
  assert.equal(
    await cdp.evaluate("document.activeElement === window.__taskBridgeVisual.drawerOpener"),
    true,
    "narrow drawer close must restore focus to its opener",
  );
}

async function verifySettingsWorkspace() {
  await cdp.evaluate("window.__taskBridgeVisual.click('.nav-list button[aria-label=\"设置\"]')");
  await cdp.waitFor("Boolean(document.querySelector('.settings-workspace'))", "settings view");
  const mediumMetrics = await setWindowSize(1024, 768);
  await assertWorkspaceLayout(72, mediumMetrics, "settings-medium");
  const mediumSettingsLayout = await cdp.evaluate(`(() => {
    const nav = document.querySelector('.settings-category-nav').getBoundingClientRect();
    const content = document.querySelector('.settings-content').getBoundingClientRect();
    return {
      navRight: nav.right,
      contentLeft: content.left,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  })()`);
  assert.ok(mediumSettingsLayout.navRight <= mediumSettingsLayout.contentLeft + 1, "medium settings navigation must not overlap content");
  assert.ok(mediumSettingsLayout.horizontalOverflow <= 1, `medium settings horizontal overflow: ${mediumSettingsLayout.horizontalOverflow}`);

  const metrics = await setWindowSize(800, 700);
  await assertWorkspaceLayout(64, metrics, "settings-narrow");
  await assertAccountMenuInsideViewport();

  const sections = [
    ["账号与显示", "settings-account-display"],
    ["账号安全", "settings-account-security"],
    ["连接与同步", "settings-connection"],
    ["窗口", "settings-window"],
    ["数据与备份", "settings-data"],
    ["同步问题", "settings-sync-recovery"],
    ["项目与标签", "settings-metadata"],
  ];
  for (const [label, id] of sections) {
    await cdp.evaluate(`window.__taskBridgeVisual.clickText('.settings-category-nav button', ${JSON.stringify(label)})`);
    await cdp.waitFor(`document.querySelector('#${id}')?.getClientRects().length > 0`, `settings section ${label}`);
    const sectionState = await cdp.evaluate(`(() => ({
      visibleCount: ['settings-account-display','settings-account-security','settings-connection','settings-window','settings-data','settings-sync-recovery','settings-metadata']
        .filter((sectionId) => document.querySelector('#' + sectionId)?.getClientRects().length > 0).length,
      currentText: document.querySelector('.settings-category-nav button[aria-current="page"]')?.textContent.trim(),
    }))()`);
    assert.equal(sectionState.visibleCount, 1, `settings must display one section while ${label} is active`);
    assert.equal(sectionState.currentText, label);
    await assertNoUnnamedInteractiveControls(`settings ${label}`);
  }

  await cdp.evaluate(`(() => {
    window.__taskBridgeVisual.click('.settings-metadata-details > summary');
    const project = document.querySelector('.settings-metadata select option:not([value=""])')?.value;
    if (!project) throw new Error('Missing project metadata for rename verification');
    window.__taskBridgeVisual.setValue('.settings-metadata select', project);
    window.__taskBridgeVisual.setValue('.settings-metadata input[type="text"]', project + '（视觉验收）');
    window.__taskBridgeVisual.clickText('.settings-metadata button', '重命名项目');
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.confirm-dialog'))", "metadata rename confirmation");
  await cdp.evaluate("window.__taskBridgeVisual.click('.confirm-dialog-actions .primary-button')");
  await cdp.waitFor("Boolean(document.querySelector('.settings-metadata [role=status]'))", "metadata rename feedback");
  const metadataFeedback = await cdp.evaluate(`(() => ({
    metadata: document.querySelector('.settings-metadata [role=status]')?.textContent.trim(),
    data: document.querySelector('#settings-data .save-note')?.textContent.trim() ?? '',
  }))()`);
  assert.equal(metadataFeedback.metadata, "项目已更新。");
  assert.equal(metadataFeedback.data, "", "metadata feedback must not leak into data and backup settings");
  await assertNoUnnamedInteractiveControls("settings metadata expanded");

  await cdp.evaluate("window.__taskBridgeVisual.clickText('.settings-category-nav button', '账号与显示')");
  const settingsLayout = await cdp.evaluate(`(() => {
    const nav = document.querySelector('.settings-category-nav').getBoundingClientRect();
    const content = document.querySelector('.settings-content').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.settings-category-nav button')];
    return {
      navBottom: nav.bottom,
      contentTop: content.top,
      buttonsFit: buttons.every((button) => button.scrollWidth <= button.clientWidth + 1),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  })()`);
  assert.ok(settingsLayout.navBottom <= settingsLayout.contentTop + 1, "narrow settings navigation must not overlap content");
  assert.equal(settingsLayout.buttonsFit, true, "settings category labels must fit their buttons");
  assert.ok(settingsLayout.horizontalOverflow <= 1, `settings view horizontal overflow: ${settingsLayout.horizontalOverflow}`);

  await assertNoUnnamedInteractiveControls("settings account display");
  await captureVerifiedScreenshot("desktop-focus-800.png", metrics);
}

async function verifyStatusAndMotionStates() {
  await cdp.evaluate(`(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const syncStore = pinia._s.get('sync');
    syncStore.stop();
    syncStore.status = 'offline';
  })()`);
  await cdp.waitFor("document.querySelectorAll('.workspace-status-banner').length === 1", "offline banner");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.workspace-status-banner').length"), 1);

  await cdp.evaluate(`(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia._s.get('sync').status = 'error';
  })()`);
  await cdp.waitFor("document.querySelector('.workspace-status-banner')?.dataset.banner === 'attention'", "sync error banner");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.workspace-status-banner').length"), 1);

  await cdp.evaluate(`(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia._s.get('sync').status = 'syncing';
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.account-status-indicator.syncing'))", "syncing indicator");
  const animationName = await cdp.evaluate("getComputedStyle(document.querySelector('.account-status-indicator.syncing')).animationName");
  assert.equal(animationName, "none", "reduced motion must disable the syncing animation");

  await cdp.evaluate(`(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia._s.get('sync').status = 'synced';
  })()`);
  await cdp.waitFor("!document.querySelector('.workspace-status-banner')", "healthy status silence");
}

async function setWindowSize(width, height) {
  await cdp.evaluate(`window.resizeTo(${width}, ${height}); true`);
  await cdp.waitFor(
    `outerWidth === ${width} && outerHeight === ${height}`,
    `${width}x${height} window bounds`,
  );
  await delay(150);
  const metrics = await cdp.evaluate("({ width: innerWidth, height: innerHeight, outerWidth, outerHeight })");
  assert.equal(metrics.outerWidth, width, `Electron outer width must be ${width}px`);
  assert.equal(metrics.outerHeight, height, `Electron outer height must be ${height}px`);
  return { width: metrics.width, height: metrics.height };
}

async function assertWorkspaceLayout(expectedSidebarWidth, metrics, context) {
  const state = await cdp.evaluate(`(() => {
    const sidebar = document.querySelector('.app-sidebar').getBoundingClientRect();
    const shell = document.querySelector('.focus-workspace');
    const accountName = document.querySelector('.account-name');
    const accountNameStyle = getComputedStyle(accountName);
    const accountNameRect = accountName.getBoundingClientRect();
    const navRects = [...document.querySelectorAll('.nav-list button')].map((button) => button.getBoundingClientRect());
    const visibleButtons = [...document.querySelectorAll('button')]
      .filter((button) => window.__taskBridgeVisual.visible(button));
    return {
      sidebarWidth: sidebar.width,
      shellOverflow: shell.scrollWidth - shell.clientWidth,
      documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      controlsInside: visibleButtons.every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= innerWidth + 1;
      }),
      accountNameSingleLine:
        !window.__taskBridgeVisual.visible(accountName) ||
        (accountNameStyle.whiteSpace === 'nowrap' &&
          accountNameRect.height <= Number.parseFloat(accountNameStyle.lineHeight) + 1),
      navigationIsVertical: navRects.every((rect, index) => index === 0 || rect.top >= navRects[index - 1].bottom),
      navigationButtonsUsable: navRects.every((rect) => rect.width >= 36 && rect.height >= 36),
      viewport: { width: innerWidth, height: innerHeight },
    };
  })()`);
  assert.ok(Math.abs(state.sidebarWidth - expectedSidebarWidth) <= 0.5, `${context} sidebar width: ${state.sidebarWidth}`);
  assert.ok(state.shellOverflow <= 1, `${context} shell horizontal overflow: ${state.shellOverflow}`);
  assert.ok(state.documentOverflow <= 1, `${context} document horizontal overflow: ${state.documentOverflow}`);
  assert.equal(state.controlsInside, true, `${context} controls must stay inside the viewport`);
  assert.equal(state.accountNameSingleLine, true, `${context} account name must stay on one line`);
  assert.equal(state.navigationIsVertical, true, `${context} primary navigation must remain vertical`);
  assert.equal(state.navigationButtonsUsable, true, `${context} primary navigation buttons must remain usable`);
  assert.deepEqual(state.viewport, metrics);
}

async function assertAccountMenuInsideViewport() {
  await cdp.evaluate(`(() => {
    const trigger = document.querySelector('#account-menu-trigger');
    trigger.focus();
    trigger.click();
  })()`);
  await cdp.waitFor("Boolean(document.querySelector('.account-menu-items'))", "account menu");
  await assertElementInsideViewport(".account-menu-items", "account menu");
  await cdp.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await cdp.waitFor("!document.querySelector('.account-menu-items')", "account menu close");
  assert.equal(
    await cdp.evaluate("document.activeElement === document.querySelector('#account-menu-trigger')"),
    true,
    "account menu Escape must restore trigger focus",
  );
}

async function assertElementInsideViewport(selector, label) {
  const rect = await cdp.evaluate(`(() => {
    const value = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  })()`);
  assert.ok(rect.left >= -1, `${label} left edge is outside the viewport: ${rect.left}`);
  assert.ok(rect.top >= -1, `${label} top edge is outside the viewport: ${rect.top}`);
  assert.ok(rect.right <= (await cdp.evaluate("innerWidth")) + 1, `${label} right edge is outside the viewport: ${rect.right}`);
  assert.ok(rect.bottom <= (await cdp.evaluate("innerHeight")) + 1, `${label} bottom edge is outside the viewport: ${rect.bottom}`);
}

async function assertNoUnnamedInteractiveControls(context) {
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const roles = new Set(["button", "checkbox", "combobox", "link", "menuitem", "radio", "searchbox", "textbox"]);
  const unnamed = nodes
    .filter((node) => !node.ignored && roles.has(node.role?.value))
    .filter((node) => !String(node.name?.value ?? "").trim())
    .map((node) => `${node.role?.value}:${node.backendDOMNodeId ?? node.nodeId}`);
  assert.deepEqual(unnamed, [], `${context} contains unnamed interactive accessibility nodes`);
}

async function captureVerifiedScreenshot(fileName, expectedMetrics) {
  await mkdir(screenshotDirectory, { recursive: true });
  await cdp.evaluate("document.activeElement instanceof HTMLElement && document.activeElement.blur(); true");
  await delay(50);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const png = Buffer.from(data, "base64");
  const analysis = analyzePng(png);
  assert.equal(analysis.width, expectedMetrics.width, `${fileName} width must match the Electron viewport`);
  assert.equal(analysis.height, expectedMetrics.height, `${fileName} height must match the Electron viewport`);
  assert.ok(png.length > 20_000, `${fileName} is unexpectedly small (${png.length} bytes)`);
  assert.ok(analysis.uniqueColors > 64, `${fileName} appears blank or nearly monochrome`);
  assert.ok(analysis.luminanceRange > 48, `${fileName} lacks visible foreground/background contrast`);
  assert.ok(analysis.opaqueRatio > 0.98, `${fileName} contains unexpected transparency`);
  await writeFile(join(screenshotDirectory, fileName), png);
  console.log(
    `${fileName}: ${analysis.width}x${analysis.height}, ${analysis.uniqueColors} sampled colors, ${png.length} bytes`,
  );
}

async function setEditorTitle(value) {
  await cdp.evaluate(`window.__taskBridgeVisual.setValue('.side-panel input[type="text"]', ${JSON.stringify(value)})`);
  await cdp.waitFor(
    `document.querySelector('.side-panel input[type="text"]').value === ${JSON.stringify(value)}`,
    "editor draft",
  );
}

async function closeDirtyEditorAndConfirm() {
  await cdp.evaluate("window.__taskBridgeVisual.click('.side-panel .panel-header .ghost-button')");
  await cdp.waitFor("Boolean(document.querySelector('.confirm-dialog'))", "discard confirmation");
  await cdp.evaluate("window.__taskBridgeVisual.click('.confirm-dialog-actions .primary-button')");
  await cdp.waitFor("!document.querySelector('.side-panel') && !document.querySelector('.confirm-dialog')", "editor close");
}

class CdpClient {
  constructor(socket, targetId) {
    this.socket = socket;
    this.targetId = targetId;
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => this.rejectPending(new Error("CDP socket closed"));
    socket.onerror = () => this.rejectPending(new Error("CDP socket failed"));
  }

  static async connect(url, targetId) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.onopen = () => resolveOpen();
      socket.onerror = () => rejectOpen(new Error("Unable to connect to Electron CDP"));
    });
    return new CdpClient(socket, targetId);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolveMessage, rejectMessage) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectMessage(new Error(`CDP command timed out: ${method}`));
      }, 12_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveMessage(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectMessage(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  notify(method, params = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ id: ++this.nextId, method, params }));
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "renderer evaluation failed");
    }
    return result.result.value;
  }

  async waitFor(expression, label, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(`Boolean(${expression})`)) return;
      } catch (error) {
        lastError = error;
      }
      await delay(80);
    }
    throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown" || message.method === "Runtime.consoleAPICalled") {
        this.events.push(message);
      }
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${message.error.message} (${message.error.code})`));
    } else {
      pending.resolve(message.result);
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }
}

function analyzePng(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "invalid PNG signature");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  assert.equal(bitDepth, 8, "visual check only supports 8-bit screenshots");
  assert.ok(colorType === 2 || colorType === 6, `unsupported screenshot PNG color type: ${colorType}`);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(rowBytes * height);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const rowStart = y * rowBytes;
    const previousStart = rowStart - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const encoded = raw[rawOffset++];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[previousStart + x - bytesPerPixel] : 0;
      pixels[rowStart + x] = unfilterByte(filter, encoded, left, up, upLeft);
    }
  }
  const unique = new Set();
  let minLuminance = 255;
  let maxLuminance = 0;
  let opaque = 0;
  let sampled = 0;
  const pixelStep = Math.max(1, Math.floor((width * height) / 30_000));
  for (let index = 0; index < width * height; index += pixelStep) {
    const byteIndex = index * bytesPerPixel;
    const red = pixels[byteIndex];
    const green = pixels[byteIndex + 1];
    const blue = pixels[byteIndex + 2];
    const alpha = bytesPerPixel === 4 ? pixels[byteIndex + 3] : 255;
    unique.add(`${red >> 3}:${green >> 3}:${blue >> 3}:${alpha >> 4}`);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    if (alpha >= 250) opaque += 1;
    sampled += 1;
  }
  return {
    width,
    height,
    uniqueColors: unique.size,
    luminanceRange: maxLuminance - minLuminance,
    opaqueRatio: opaque / sampled,
  };
}

function unfilterByte(filter, encoded, left, up, upLeft) {
  if (filter === 0) return encoded;
  if (filter === 1) return (encoded + left) & 0xff;
  if (filter === 2) return (encoded + up) & 0xff;
  if (filter === 3) return (encoded + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (encoded + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`unsupported PNG filter: ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  if (upDistance <= diagonalDistance) return up;
  return upLeft;
}

async function waitForPageTarget(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (electronProcess?.exitCode !== null) {
      throw new Error(`Electron exited before exposing CDP (code ${electronProcess.exitCode})`);
    }
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === "page" && item.url.includes("out/renderer/index.html"));
      if (target) return target;
    } catch {
      // Electron has not opened the debugging port yet.
    }
    await delay(100);
  }
  throw new Error("Electron did not expose a renderer CDP target");
}

async function reservePort() {
  const server = http.createServer();
  await listen(server);
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  return port;
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendEnvelope(response, data, statusCode = 200, message = "ok") {
  const body = JSON.stringify({ code: statusCode === 200 ? 0 : statusCode, message, data });
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    connection: "close",
  });
  response.end(body);
}

function localDate(offsetMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + offsetMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isoOffset(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function stopElectron(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", () => resolveExit()));
  const graceful = await Promise.race([exited.then(() => true), delay(2_500).then(() => false)]);
  if (graceful || child.exitCode !== null) return;
  child.kill();
  await Promise.race([exited, delay(2_500)]);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

await main();
