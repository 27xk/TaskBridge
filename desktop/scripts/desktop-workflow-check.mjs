import assert from "node:assert/strict";

const quote = JSON.stringify;
const store = (name) => `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get(${quote(name)})`;
const taskStore = store("task");
const workspaceStore = store("workspace");
const title = (index) => `回归任务 ${String(index).padStart(2, "0")}`;
const stateFields = ["status", "isDeleted", "priority", "plannedDate", "dueTime", "remindTime", "snoozedUntil", "listType"];

async function installHelpers(client) {
  await client.evaluate(`(() => {
    if (window.__taskBridgeVisual) return;
    const elements = (selector) => [...document.querySelectorAll(selector)];
    const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const setValue = (selector, value, index = 0) => {
      const element = elements(selector)[index];
      if (!element) throw new Error('Missing workflow input: ' + selector);
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const click = (selector, index = 0, focus = false) => {
      const element = elements(selector)[index];
      if (!element) throw new Error('Missing workflow button: ' + selector);
      if (focus) element.focus();
      element.click();
    };
    const clickText = (selector, text) => {
      const element = elements(selector).find((node) => node.textContent.trim() === text);
      if (!element) throw new Error('Missing workflow action: ' + text);
      element.click();
    };
    window.__taskBridgeVisual = { elements, visible, setValue, click, clickText };
    window.__taskBridgeVisualErrors = [];
    addEventListener('error', (event) => window.__taskBridgeVisualErrors.push(event.message));
    addEventListener('unhandledrejection', (event) => window.__taskBridgeVisualErrors.push(String(event.reason)));
  })()`);
}

async function chord(client, key, code, windowsVirtualKeyCode) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers: 2 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers: 0 });
}

/** Runs against the caller's isolated Electron profile after UI login. */
export async function verifyDesktopWorkflow(cdp, { setWindowSize, cdpPort, connectCdp, captureScreenshot }) {
  const evaluate = (body, client = cdp) => client.evaluate(`(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const tasks = pinia._s.get('task'), workspace = pinia._s.get('workspace'), settings = pinia._s.get('settings');
    const ui = window.__taskBridgeVisual;
    const row = (text) => {
      const found = [...document.querySelectorAll('.task-row')].find((node) => node.querySelector('.task-edit-trigger')?.textContent.trim() === text);
      if (!found) throw new Error('Missing workflow task row: ' + text);
      return found;
    };
    ${body}
  })()`);
  const click = (selector, index = 0) => evaluate(`ui.click(${quote(selector)}, ${index});`);
  const setValue = (selector, value, index = 0) => evaluate(`ui.setValue(${quote(selector)}, ${quote(value)}, ${index});`);
  const snapshot = (ids) => `${quote(ids)}.map((id) => { const task = ${taskStore}.tasks.find((item) => item.localId === id); return Object.fromEntries(${quote(stateFields)}.map((key) => [key, task?.[key]])); })`;
  const navigate = async (label, selector) => {
    await click(`.nav-list button[aria-label="${label}"]`);
    await cdp.waitFor(`Boolean(document.querySelector(${quote(selector)}))`, `workflow navigation: ${label}`);
  };
  const undo = async (ids, before) => {
    await cdp.waitFor("Boolean(document.querySelector('.undo-notice .undo-action:not(:disabled)'))", "workflow undo action");
    assert.equal(await evaluate("return tasks.pendingUndo?.count;"), ids.length, "one undo must cover the whole operation");
    await click(".undo-notice .undo-action");
    await cdp.waitFor(`!${taskStore}.undoing && JSON.stringify(${snapshot(ids)}) === ${quote(JSON.stringify(before))}`, "workflow undo restoration");
    assert.equal(await evaluate("return tasks.pendingUndo === null;"), true);
  };

  await setWindowSize(1440, 900);
  for (const [label, selector] of [["今日", ".today-view"], ["设置", ".settings-workspace"]]) {
    await navigate(label, selector);
    await chord(cdp, "f", "KeyF", 70);
    await cdp.waitFor("document.activeElement === document.querySelector('.task-search-field input')", `Ctrl+F from ${label}`);
    assert.equal(await evaluate("return Boolean(document.querySelector('.task-workspace-view'));"), true);
  }
  const fixtureCount = await evaluate(`
    const base = tasks.tasks.find((task) => !task.isDeleted);
    if (!base) throw new Error('Workflow fixtures require a synced baseline task');
    const now = new Date().toISOString();
    await window.taskBridge.db.upsertTasks(Array.from({ length: 70 }, (_, index) => ({
      ...base, localId: 'workflow-' + index, serverId: null, title: '回归任务 ' + String(index).padStart(2, '0'),
      content: null, project: '交互验证', tag: '现场', priority: 3, status: 'todo', syncStatus: 'synced', version: 0,
      plannedDate: null, dueTime: null, remindTime: null, completedAt: null, snoozedUntil: null, repeatRule: null,
      listType: 'inbox', isDeleted: false, isTemplate: false, templateName: null, parentServerId: null,
      checklistJson: '[]', conflictLocalJson: null, conflictServerJson: null, lastSyncAt: null,
      sortOrder: index, createdAt: now, updatedAt: now,
    })));
    await tasks.load();
    return tasks.tasks.filter((task) => task.localId.startsWith('workflow-')).length;
  `);
  assert.equal(fixtureCount, 70);
  await evaluate("document.querySelector('.active-filter-bar .text-button')?.click();");
  await setValue(".task-search-field input", "回归任务");
  await click(".filter-menu > summary");
  await setValue(".filter-menu .filter-selects select", "交互验证", 0);
  await click(".filter-menu > summary");
  await cdp.waitFor("[...document.querySelectorAll('.task-workspace-view [data-task-count]')].reduce((n, section) => n + Number(section.dataset.taskCount), 0) === 70", "70 reachable filtered workflow fixtures");
  assert.ok(await cdp.evaluate("document.querySelectorAll('.task-workspace-view .task-row').length < 70"), "only visible workflow rows should mount");
  await evaluate("document.querySelector('.workspace-main').scrollTop = 450;");
  await navigate("设置", ".settings-workspace");
  await navigate("全部", ".task-workspace-view");
  await cdp.waitFor("Math.abs(document.querySelector('.workspace-main').scrollTop - 450) <= 2", "restored task scroll position");
  assert.deepEqual(await evaluate("return [workspace.taskView.search, workspace.taskView.project];"), ["回归任务", "交互验证"]);

  await evaluate("document.querySelector('.workspace-main').scrollTop = 0;");
  await cdp.waitFor("document.querySelector('[data-task-id=\"workflow-0\"] .task-edit-trigger')", "first virtual row");
  await evaluate("document.querySelector('[data-task-id=\"workflow-0\"] .task-edit-trigger').focus();");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35 });
  await cdp.waitFor("document.activeElement?.closest('[data-task-id]')?.dataset.taskId === 'workflow-69'", "End reaches the final virtual row");
  assert.equal(await cdp.evaluate("document.activeElement.closest('[role=listitem]').getAttribute('aria-setsize')"), "70");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
  await cdp.waitFor("document.activeElement?.closest('[data-task-id]')?.dataset.taskId === 'workflow-0'", "Home restores the first virtual row");
  const viewName = "工作流回归视图";
  await click(".saved-views > summary");
  await evaluate(`const existing = workspace.savedViews.find((view) => view.name === ${quote(viewName)});
    if (existing) ui.click('.saved-views-list li .icon-button', workspace.savedViews.indexOf(existing));`);
  await setValue("#saved-task-view-name", viewName);
  await click(".save-view-form button[type=submit]");
  await cdp.waitFor(`${workspaceStore}.savedViews.some((view) => view.name === ${quote(viewName)})`, "saved named view");
  await click(".saved-views > summary");
  await click(".active-filter-bar .text-button");
  await cdp.waitFor(`${workspaceStore}.taskView.search === '' && ${workspaceStore}.taskView.project === ''`, "cleared saved-view conditions");
  await click(".saved-views > summary");
  await evaluate(`ui.clickText('.saved-views-list .saved-view-apply', ${quote(viewName)});`);
  await cdp.waitFor(`${workspaceStore}.taskView.search === '回归任务' && ${workspaceStore}.taskView.project === '交互验证'`, "applied saved view");
  await cdp.send("Page.reload", { ignoreCache: true });
  await cdp.waitFor("Boolean(document.querySelector('.today-view'))", "default Today view after reload", 15_000);
  await cdp.evaluate("window.taskBridge.window.openMain()");
  await cdp.send("Page.bringToFront");
  await cdp.waitFor(`${store("sync")}.status === 'synced' && !${taskStore}.loading`, "reloaded workspace initialization", 15_000);
  await installHelpers(cdp);
  await chord(cdp, "f", "KeyF", 70);
  await cdp.waitFor("document.activeElement === document.querySelector('.task-search-field input')", "restored search focus after reload");
  assert.deepEqual(await evaluate("return [workspace.taskView.search, workspace.taskView.project];"), ["回归任务", "交互验证"]);
  await click(".saved-views > summary");
  assert.ok((await evaluate("return document.querySelector('.saved-views-list').textContent;")).includes(viewName));
  await click(".saved-views > summary");
  console.log("[workflow] Ctrl+F, saved views, restart and scroll restoration passed");

  const first = ["workflow-0"];
  let before = await cdp.evaluate(snapshot(first));
  await evaluate(`row(${quote(title(0))}).querySelector('.check-button').click();`);
  await cdp.waitFor(`${taskStore}.tasks.find((task) => task.localId === 'workflow-0')?.status === 'completed'`, "single completion");
  await undo(first, before);
  before = await cdp.evaluate(snapshot(first));
  await evaluate(`row(${quote(title(0))}).querySelector('.task-menu-trigger').click();`);
  await cdp.waitFor("Boolean(document.querySelector('.task-menu-panel'))", "opened task menu");
  await evaluate("ui.clickText('.task-menu-panel button', '删除');");
  await cdp.waitFor("Boolean(document.querySelector('.confirm-dialog'))", "single delete confirmation");
  await click(".confirm-dialog-actions .primary-button");
  await cdp.waitFor(`${taskStore}.tasks.find((task) => task.localId === 'workflow-0')?.isDeleted === true`, "single delete");
  await undo(first, before);

  const pair = ["workflow-0", "workflow-1"];
  const today = await evaluate("return new Intl.DateTimeFormat('en-CA', { timeZone: settings.displayTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tasks.timelineNow);");
  for (const kind of ["date", "priority", "today"]) {
    before = await cdp.evaluate(snapshot(pair));
    await click(".task-command-actions .icon-button");
    await cdp.waitFor("Boolean(document.querySelector('.task-selection-checkbox input'))", "batch selection mode");
    await evaluate(`${[0, 1].map((index) => `row(${quote(title(index))}).querySelector('.task-selection-checkbox input').click();`).join(" ")}`);
    await cdp.waitFor("document.querySelectorAll('.task-selection-checkbox input:checked').length === 2", "two selected tasks");
    if (kind === "date") {
      await click(".batch-schedule-menu > summary", 0);
      await setValue(".batch-schedule-panel input[type=date]", "2030-05-21");
      await click(".batch-schedule-menu[open] button[type=submit]");
    } else if (kind === "priority") {
      await click(".batch-schedule-menu > summary", 1);
      await setValue(".batch-schedule-panel select", "5");
      await click(".batch-schedule-menu[open] button[type=submit]");
    } else await click(".batch-schedule-actions > button");
    const condition = kind === "date" ? "task.plannedDate === '2030-05-21'" : kind === "priority" ? "task.priority === 5" : `task.plannedDate === ${quote(today)} && task.listType === 'today'`;
    await cdp.waitFor(`${quote(pair)}.every((id) => { const task = ${taskStore}.tasks.find((item) => item.localId === id); return task && (${condition}); })`, `batch ${kind}`);
    await cdp.waitFor("!document.querySelector('.bulk-action-toolbar')", `batch ${kind} selection exit`);
    await undo(pair, before);
  }
  console.log("[workflow] single and batch mutations restore with one undo");

  const detailMetrics = await setWindowSize(1440, 900);
  await evaluate(`row(${quote(title(0))}).querySelector('.task-edit-trigger').click();`);
  await cdp.waitFor("Boolean(document.querySelector('.side-panel'))", "docked task editor");
  const unsaved = `${title(0)}（未保存）`;
  await setValue(".side-panel input[type=text]", unsaved);
  await evaluate(`row(${quote(title(1))}).querySelector('.task-edit-trigger').click();`);
  await cdp.waitFor("Boolean(document.querySelector('.confirm-dialog'))", "dirty editor switch confirmation");
  await click(".confirm-dialog-actions .secondary-button");
  await cdp.waitFor("!document.querySelector('.confirm-dialog')", "canceled editor switch");
  assert.equal(await evaluate("return document.querySelector('.side-panel input[type=text]').value;"), unsaved);
  await evaluate(`row(${quote(title(1))}).querySelector('.task-edit-trigger').click();`);
  await cdp.waitFor("Boolean(document.querySelector('.confirm-dialog'))", "repeated editor switch confirmation");
  await click(".confirm-dialog-actions .primary-button");
  await cdp.waitFor(`document.querySelector('.side-panel input[type=text]')?.value === ${quote(title(1))}`, "confirmed editor switch");
  const detail = await evaluate(`const panel = document.querySelector('.side-panel'), list = document.querySelector('.task-list');
    return { role: panel.getAttribute('role'), modal: panel.getAttribute('aria-modal'), scrim: Boolean(document.querySelector('.drawer-scrim')),
      listRight: list.getBoundingClientRect().right, panelLeft: panel.getBoundingClientRect().left, firstTitle: tasks.tasks.find((task) => task.localId === 'workflow-0').title };`);
  assert.equal(detail.role, "complementary");
  assert.equal(detail.modal, null);
  assert.equal(detail.scrim, false);
  assert.ok(detail.listRight <= detail.panelLeft + 1, "docked detail must leave the task list visible");
  assert.equal(detail.firstTitle, title(0));
  await captureScreenshot("desktop-workflow-detail-1440.png", detailMetrics);
  await click(".side-panel .panel-header .ghost-button");
  await cdp.waitFor("!document.querySelector('.side-panel')", "docked detail close");
  const previousDensity = await evaluate("return settings.desktopDensity;");
  const heights = {};
  for (const density of ["comfortable", "compact"]) {
    await evaluate(`await settings.setDesktopDensity(${quote(density)});`);
    await cdp.waitFor(`document.documentElement.dataset.density === ${quote(density)}`, `density ${density}`);
    heights[density] = await evaluate(`return row(${quote(title(0))}).getBoundingClientRect().height;`);
    assert.equal(await evaluate("return (await window.taskBridge.app.getSettings()).desktopDensity;"), density);
  }
  assert.ok(heights.compact < heights.comfortable, `compact rows must be shorter: ${JSON.stringify(heights)}`);
  await evaluate(`await settings.setDesktopDensity(${quote(previousDensity)});`);
  console.log("[workflow] dirty detail switching, docked layout and density passed");

  const targets = async () => {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json`, { signal: AbortSignal.timeout(3000) });
    assert.ok(response.ok, "CDP target discovery must succeed");
    return response.json();
  };
  const isFloating = (target) => target.type === "page" && target.url.includes("view=floating");
  assert.equal((await targets()).some(isFloating), false, "first quick-add scenario requires an uncreated floating window");
  const mainConditions = await evaluate("return JSON.stringify(workspace.taskView);");
  await evaluate(`window.__workflowQuickAdds = 0;
    window.__workflowRemoveQuickAdd = window.taskBridge.window.onQuickAdd(() => { window.__workflowQuickAdds += 1; });
    await window.taskBridge.window.quickAdd();`);
  let floating;
  try {
    const deadline = Date.now() + 12_000;
    let target;
    while (!target && Date.now() < deadline) {
      target = (await targets()).find(isFloating);
      if (!target) await new Promise((resolve) => setTimeout(resolve, 80));
    }
    assert.ok(target, "quick-add must create the floating renderer");
    floating = await connectCdp(target);
    await floating.send("Runtime.enable");
    await floating.waitFor("Boolean(document.querySelector('[data-floating-quick-add]')) && document.activeElement === document.querySelector('[data-floating-quick-add]')", "first floating capture focus", 15_000);
    await installHelpers(floating);
    const captureText = "浮窗工作流验证";
    await evaluate(`const capture = pinia._s.get('floating');
      window.__workflowOriginalQuickAdd = capture.quickAdd; window.__workflowCaptureCalls = 0;
      capture.quickAdd = async () => { window.__workflowCaptureCalls += 1; throw new Error('workflow capture failure'); };
      ui.setValue('[data-floating-quick-add]', ${quote(captureText)});
      document.querySelector('[data-floating-quick-add]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true }));`, floating);
    assert.equal(await floating.evaluate("window.__workflowCaptureCalls"), 0, "IME composition must not submit Ctrl+Enter");
    await chord(floating, "Enter", "Enter", 13);
    await floating.waitFor("Boolean(document.querySelector('#floating-quick-add-error'))", "floating save failure");
    assert.equal(await floating.evaluate("document.querySelector('[data-floating-quick-add]').value"), captureText);
    assert.equal(await floating.evaluate("window.__workflowCaptureCalls"), 1);
    await evaluate("pinia._s.get('floating').quickAdd = window.__workflowOriginalQuickAdd;", floating);
    await floating.waitFor("document.activeElement === document.querySelector('[data-floating-quick-add]') && !document.activeElement.disabled", "floating retry focus");
    await chord(floating, "Enter", "Enter", 13);
    await floating.waitFor("document.querySelector('[data-floating-quick-add]').value === '' && !document.querySelector('#floating-quick-add-error')", "successful floating capture clears input", 15_000);
    await cdp.waitFor(`${taskStore}.tasks.some((task) => task.title === ${quote(captureText)})`, "main observes saved floating task", 15_000);
    assert.equal(await evaluate(`return (await window.taskBridge.db.listTasks()).filter((task) => task.title === ${quote(captureText)}).length;`), 1);
    assert.equal(await evaluate("return window.__workflowQuickAdds;"), 0, "floating shortcut must not broadcast to the main renderer");
    assert.equal(await evaluate("return Boolean(document.querySelector('.task-workspace-view')) && !document.querySelector('.side-panel');"), true);
    assert.equal(await evaluate("return JSON.stringify(workspace.taskView);"), mainConditions);
    assert.deepEqual(await floating.evaluate("window.__taskBridgeVisualErrors ?? []"), []);
  } finally {
    if (floating) {
      await evaluate("if (window.__workflowOriginalQuickAdd) pinia._s.get('floating').quickAdd = window.__workflowOriginalQuickAdd; await window.taskBridge.floating.hide();", floating);
      floating.close();
    }
    await evaluate("window.__workflowRemoveQuickAdd?.(); delete window.__workflowRemoveQuickAdd;");
  }
  console.log("[workflow] floating first focus, IME guard, retry and Ctrl+Enter passed");
  return { fixtureCount, savedView: viewName, restoredScroll: 450, rowHeights: heights, floatingMainBroadcasts: 0 };
}
