// Run after sign-in in Today or unfiltered All, with no editor open. This never writes the database.
export async function measureDesktopGlass(cdp) {
  const token = `glass-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const evaluate = (fn, ...args) => cdp.evaluate(`(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(",")})`);
  const order = ["off", "on", "on", "off"];
  const runs = [];
  let performanceEnabled = false;
  let result;
  await cdp.send("Page.bringToFront");
  try {
    performanceEnabled = await cdp.send("Performance.enable").then(() => true, () => false);
    const metadata = await evaluate(prepareGlassBenchmark, token);
    for (const mode of order) {
      const sample = await evaluate(sampleGlassBenchmark, token, mode);
      let heap = null;
      if (performanceEnabled) {
        const metrics = await cdp.send("Performance.getMetrics").catch(() => null);
        const values = Object.fromEntries((metrics?.metrics ?? []).map(({ name, value }) => [name, value]));
        if (Number.isFinite(values.JSHeapUsedSize)) heap = { usedBytes: values.JSHeapUsedSize, totalBytes: values.JSHeapTotalSize ?? null };
      }
      runs.push({ mode, ...sample, ...summarizeFrames(sample.framesMs), heap });
    }
    result = { ...metadata, order, warmupMs: [200, 200], sampleMs: 1600, runs,
      modes: Object.fromEntries(["off", "on"].map((mode) => [mode, summarizeFrames(runs.filter((run) => run.mode === mode).flatMap((run) => run.framesMs))])) };
  } finally {
    try {
      const restored = await evaluate(restoreGlassBenchmark, token);
      if (result) result.restored = restored;
    } finally {
      if (performanceEnabled) await cdp.send("Performance.disable").catch(() => {});
    }
  }
  return result;
}

function summarizeFrames(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (value) => Math.round(value * 1000) / 1000;
  const percentile = (fraction) => {
    const index = (sorted.length - 1) * fraction;
    const low = Math.floor(index);
    return round(sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low));
  };
  return { frames: samples.length, medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: round(sorted.at(-1)),
    slowFrameThresholdMs: 33.3, slowFrameRatio: samples.filter((value) => value > 33.3).length / samples.length };
}

async function prepareGlassBenchmark(token) {
  const pinia = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$pinia;
  const task = pinia?._s.get("task");
  const settings = pinia?._s.get("settings");
  const main = document.querySelector(".workspace-main");
  if (!task || !settings || !pinia._s.get("auth")?.isAuthenticated || !main) throw new Error("Glass benchmark requires a signed-in workspace");
  if (window.__taskBridgeGlassBenchmark || document.querySelector(".side-panel")) throw new Error("Close the existing editor before benchmarking");
  const original = { token, task, settings, main, tasks: task.tasks, todayTasks: task.todayTasks,
    glass: settings.desktopGlassEnabled, attribute: document.documentElement.getAttribute("data-glass"),
    scrollTop: main.scrollTop, activeElement: document.activeElement, openedPanel: false };
  window.__taskBridgeGlassBenchmark = original;
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.displayTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const fixtures = Array.from({ length: 260 }, (_, index) => ({
    localId: `glass-benchmark-${index}`, serverId: null, title: `玻璃滚动验收任务 ${index + 1}：检查桌面工作区中的文字与交互响应`,
    content: "临时渲染任务，仅用于帧率采样。", status: "pending", priority: index % 6, tag: "性能验收", project: "桌面交互",
    listType: "today", plannedDate: today, dueTime: null, remindTime: null, repeatRule: null, completedAt: null,
    snoozedUntil: null, parentServerId: null, checklistJson: "[]", isTemplate: false, templateName: null,
    sortOrder: index, version: 1, isDeleted: false, syncStatus: "synced", createdAt: now.toISOString(),
    updatedAt: now.toISOString(), lastSyncAt: now.toISOString(), conflictServerJson: null, conflictLocalJson: null,
  }));
  task.tasks = fixtures;
  task.todayTasks = fixtures;
  const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await settle();
  const rows = document.querySelectorAll(".workspace-main .task-row").length;
  const reachableTaskCount = [...document.querySelectorAll(".workspace-main [data-task-count]")]
    .reduce((count, section) => count + Number(section.dataset.taskCount), 0);
  if (reachableTaskCount !== fixtures.length || task.tasks.length !== fixtures.length || task.todayTasks.length !== fixtures.length) {
    throw new Error(`Glass benchmark requires all 260 fixtures in an unfiltered task view; reachable ${reachableTaskCount}`);
  }
  if (rows < 1 || rows >= 60) throw new Error(`Glass benchmark requires bounded visible rows; rendered ${rows}`);
  // Reach the final item before sampling. Reapply the end offset while variable rows settle.
  for (let pass = 0; pass < 3; pass++) { main.scrollTop = main.scrollHeight - main.clientHeight; await settle(); }
  const lastRow = document.querySelector('[data-task-id="glass-benchmark-259"]');
  const lastBounds = lastRow?.getBoundingClientRect();
  const viewportBounds = main.getBoundingClientRect();
  const lastTaskReachable = Boolean(lastBounds && lastBounds.bottom > viewportBounds.top && lastBounds.top < viewportBounds.bottom);
  if (!lastTaskReachable) throw new Error("The final glass benchmark task is unreachable");
  main.scrollTop = 0;
  await settle();
  const trigger = document.querySelector(".workspace-main .task-edit-trigger");
  if (!trigger) throw new Error("Missing task detail entry");
  trigger.click();
  original.openedPanel = true;
  await settle();
  const visible = (element) => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  if (!visible(document.querySelector(".side-panel")) || !visible(document.querySelector(".sidebar"))) throw new Error("Both glass layers must be visible");
  if (main.scrollHeight <= main.clientHeight) throw new Error("Workspace is not scrollable");
  return { taskCount: fixtures.length, reachableTaskCount, lastTaskReachable, renderedRows: rows, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio } };
}

async function sampleGlassBenchmark(token, mode) {
  const state = window.__taskBridgeGlassBenchmark;
  if (state?.token !== token) throw new Error("Glass benchmark state is unavailable");
  if (document.visibilityState !== "visible") throw new Error("Glass benchmark window must remain visible");
  state.settings.desktopGlassEnabled = mode === "on";
  document.documentElement.dataset.glass = mode;
  const main = state.main;
  const distance = Math.min(main.scrollHeight - main.clientHeight, main.clientHeight * 4);
  const animate = (duration) => new Promise((resolve, reject) => {
    const frames = [];
    let start;
    let previous;
    let request;
    const timeout = setTimeout(() => { cancelAnimationFrame(request); reject(new Error("Animation frames stalled during glass benchmark")); }, 8000);
    const frame = (time) => {
      start ??= time;
      if (previous !== undefined) frames.push(time - previous);
      previous = time;
      const progress = Math.min(1, (time - start) / duration);
      main.scrollTop = Math.round(distance * (1 - Math.abs(2 * progress - 1)));
      if (progress < 1) request = requestAnimationFrame(frame);
      else { clearTimeout(timeout); resolve(frames); }
    };
    request = requestAnimationFrame(frame);
  });
  await animate(200);
  await animate(200);
  const framesMs = await animate(1600);
  if (framesMs.length < 10 || document.visibilityState !== "visible") throw new Error("Too few visible animation frames for a valid measurement");
  if (state.task.tasks.length !== 260 || !state.task.tasks[0]?.localId.startsWith("glass-benchmark-")) throw new Error("Tasks changed during glass measurement; retry when sync is idle");
  if (document.querySelectorAll(".workspace-main .task-row").length >= 60) throw new Error("Task rows stopped being virtualized during glass measurement");
  const layers = Object.fromEntries([".sidebar", ".side-panel"].map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Glass layer disappeared: ${selector}`);
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return [selector, { backdropFilter: style.backdropFilter, backgroundColor: style.backgroundColor, width: rect.width, height: rect.height }];
  }));
  return { framesMs, layers, scrollDistance: distance };
}

async function restoreGlassBenchmark(token) {
  const state = window.__taskBridgeGlassBenchmark;
  if (state?.token !== token) return false;
  try {
    if (state.openedPanel) document.querySelector(".side-panel .panel-header .ghost-button")?.click();
    state.task.tasks = state.tasks;
    state.task.todayTasks = state.todayTasks;
    state.settings.desktopGlassEnabled = state.glass;
    if (state.attribute === null) delete document.documentElement.dataset.glass;
    else document.documentElement.dataset.glass = state.attribute;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    state.main.scrollTop = state.scrollTop;
    if (state.activeElement?.isConnected) state.activeElement.focus();
    if (state.openedPanel && document.querySelector(".side-panel")) throw new Error("Benchmark editor did not close cleanly");
    return true;
  } finally {
    delete window.__taskBridgeGlassBenchmark;
  }
}
