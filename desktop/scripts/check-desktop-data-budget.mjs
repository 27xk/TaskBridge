import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { loadElectronModule } from "../tests/helpers/mock-electron-windows.mjs";

const require = createRequire(import.meta.url);
const desktopRoot = resolve(import.meta.dirname, "..");

export function assertDesktopDataBudget(report) {
  assert.equal(report.tasks, 10_000, "all seeded tasks must reach the renderer index");
  assert.ok(report.summaryBytes <= 12 * 1024 * 1024, `summary IPC exceeded 12 MiB: ${report.summaryBytes}`);
  assert.ok(report.maxPageBytes <= 1.25 * 1024 * 1024, `one IPC page exceeded 1.25 MiB: ${report.maxPageBytes}`);
  assert.ok(report.summaryBytes / report.fullBytes <= 0.1, "summary IPC must eliminate at least 90% of long-record payload");
  assert.ok(report.incrementBytes <= 2_048, `a single changed task exceeded 2 KiB: ${report.incrementBytes}`);
  assert.ok(report.unchangedBytes <= 256, "an unchanged refresh should contain only its cursor");
}

function runWorker(directory) {
  const store = loadElectronModule("main/db.ts", {
    electron: { app: { getPath: () => directory } }, "better-sqlite3": require("better-sqlite3"),
    "./state": { getSettings: () => ({ currentUserId: 1, baseUrl: "http://localhost:18080", displayTimeZone: "UTC" }),
      getActiveWorkspaceKey: () => "budget", claimLegacyGlobalDatabaseWorkspace: () => false, claimLegacyUserDatabaseWorkspace: () => false },
  });
  const body = "Long task body. ".repeat(1_024);
  const checklistJson = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: String(i), title: `Checklist ${i}`, done: i % 2 === 0 })));
  const task = { localId: "", serverId: null, title: "Budget task", content: body, status: "todo", priority: 0,
    tag: "budget", project: "performance", listType: "today", dueTime: null, remindTime: null, repeatRule: null,
    plannedDate: null, completedAt: null, snoozedUntil: null, parentServerId: null, checklistJson,
    isTemplate: false, templateName: null, sortOrder: 0, version: 1, isDeleted: false, syncStatus: "synced",
    createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:00:00Z", lastSyncAt: null,
    conflictServerJson: null, conflictLocalJson: null };
  const target = store.database();
  target.transaction(() => {
    for (let i = 0; i < 10_000; i++) store.upsertTask({ ...task, localId: `task-${String(i).padStart(5, "0")}`, serverId: i + 1,
      ...(i % 10 === 0 ? { syncStatus: "conflict", conflictServerJson: JSON.stringify({ content: body }), conflictLocalJson: JSON.stringify({ content: body }) } : {}) });
  })();
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const summaries = [];
  let summaryBytes = 0;
  let maxPageBytes = 0;
  let page = store.listTaskSnapshotPage(null, 1_000);
  const cursor = page.cursor;
  while (true) {
    const bytes = Buffer.byteLength(JSON.stringify(page));
    summaryBytes += bytes;
    maxPageBytes = Math.max(maxPageBytes, bytes);
    summaries.push(...page.tasks);
    if (page.nextLocalId === null) break;
    page = store.listTaskSnapshotPage(page.nextLocalId, 1_000);
  }
  const summaryReadMs = performance.now() - started;
  global.gc?.();
  const residentHeapDelta = process.memoryUsage().heapUsed - heapBefore;
  for (const item of summaries) {
    for (const field of ["content", "checklistJson", "conflictServerJson", "conflictLocalJson"]) assert.equal(Object.hasOwn(item, field), false, `summary contains ${field}`);
    assert.ok(item.contentPreview.length <= 240);
    assert.equal(item.checklistTotal, 50);
    assert.equal(item.checklistDone, 25);
  }
  let fullBytes = 0;
  const baselineStarted = performance.now();
  // The previous renderer read every complete record; stream its pages for comparison without retaining them.
  for (let offset = 0; offset < 10_000; offset += 1_000) fullBytes += Buffer.byteLength(JSON.stringify(store.listTasks(true, 1_000, offset)));
  const fullReadMs = performance.now() - baselineStarted;
  assert.equal(store.getTask("task-00000").content, body, "detail reads remain lossless");
  assert.equal(store.listTasks(true, 1, 0)[0].checklistJson, checklistJson, "backup reads remain lossless");
  const unchangedBytes = Buffer.byteLength(JSON.stringify(store.listTaskChanges(cursor, 1_000)));
  target.prepare("UPDATE tasks SET content = ? WHERE local_id = ?").run(body + " tail-only searchable marker", "task-00000");
  const changed = store.listTaskChanges(cursor, 1_000);
  assert.equal(changed.tasks.length, 1);
  assert.ok(changed.tasks[0].changeRevision > summaries[0].changeRevision, "changes outside the preview still invalidate the detail revision");
  assert.deepEqual(store.searchTaskIds("TAIL-ONLY SEARCHABLE MARKER"), ["task-00000"]);
  const incrementBytes = Buffer.byteLength(JSON.stringify(changed));
  const report = { tasks: summaries.length, bodyCharacters: body.length, summaryBytes, maxPageBytes, fullBytes,
    reductionPercent: Number((100 * (1 - summaryBytes / fullBytes)).toFixed(2)), incrementBytes, unchangedBytes,
    residentHeapDelta, summaryReadMs: Math.round(summaryReadMs), fullReadMs: Math.round(fullReadMs) };
  assertDesktopDataBudget(report);
  target.close();
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--worker") {
    console.log(JSON.stringify(runWorker(process.argv[3])));
  } else {
    const directory = mkdtempSync(join(tmpdir(), "taskbridge-data-budget-"));
    try {
      const executable = process.platform === "win32" ? "electron.exe" : "electron";
      const result = execFileSync(resolve(desktopRoot, "node_modules/electron/dist", executable),
        ["--expose-gc", fileURLToPath(import.meta.url), "--worker", directory],
        { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 120_000 });
      const report = JSON.parse(result.trim());
      assertDesktopDataBudget(report);
      const outputIndex = process.argv.indexOf("--output");
      if (outputIndex >= 0) writeFileSync(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify(report, null, 2));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
}
