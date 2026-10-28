import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const execFileAsync = promisify(execFile);
const desktopRoot = resolve(import.meta.dirname, "..");
const electronPath = resolve(desktopRoot, "node_modules/electron/dist/electron.exe");

async function databaseFunctions() {
  const source = await readFile(resolve(desktopRoot, "main/db.ts"), "utf8");
  const ast = ts.createSourceFile("db.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set(["upsertTask", "upsertTasks", "saveTaskRecord", "taskFromRow", "taskScalarFields", "toSyncStatus"]);
  const functions = ast.statements
    .filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
    .map((node) => node.getText(ast));
  assert.equal(functions.length, names.size);
  return ts.transpileModule(functions.join("\n"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test("remote task writes atomically preserve unsynced content, identity, snapshots and queue", async () => {
  const directory = await mkdtemp(join(tmpdir(), "taskbridge-remote-preservation-"));
  const runner = join(directory, "check.mjs");
  try {
    const compiled = await databaseFunctions();
    await writeFile(runner, `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      const require = createRequire(${JSON.stringify(resolve(desktopRoot, "package.json"))});
      const Database = require("better-sqlite3");
      const connection = new Database(":memory:");
      const database = () => connection;
      let activeWorkspace = "workspace-a";
      const getActiveWorkspaceKey = () => activeWorkspace;
      connection.exec(\`
        CREATE TABLE tasks (
          local_id TEXT PRIMARY KEY, server_id INTEGER, title TEXT, content TEXT,
          status TEXT, priority INTEGER, tag TEXT, project TEXT, list_type TEXT,
          due_time TEXT, remind_time TEXT, repeat_rule TEXT, planned_date TEXT,
          completed_at TEXT, snoozed_until TEXT, parent_server_id INTEGER,
          checklist_json TEXT, is_template INTEGER, template_name TEXT, sort_order INTEGER,
          version INTEGER, is_deleted INTEGER, sync_status TEXT, created_at TEXT,
          updated_at TEXT, last_sync_at TEXT, conflict_server_json TEXT, conflict_local_json TEXT
        );
        CREATE TABLE sync_queue (local_id TEXT);
      \`);
      ${compiled}
      const base = {
        localId: "local-child", serverId: 42, title: "Local edited child", content: "Private draft",
        status: "todo", priority: 3, tag: "local", project: "Local project", listType: "inbox",
        dueTime: null, remindTime: null, repeatRule: "daily", plannedDate: "2026-05-21",
        completedAt: null, snoozedUntil: null, parentServerId: 41, checklistJson: "[]",
        isTemplate: false, templateName: null, sortOrder: 0, version: 3, isDeleted: false,
        syncStatus: "conflict", createdAt: "2026-05-20T08:00:00Z", updatedAt: "2026-05-20T10:00:00Z",
        lastSyncAt: null, conflictServerJson: "server snapshot", conflictLocalJson: "local snapshot",
      };
      const remote = {
        ...base, localId: "server-42", title: "Server child", content: "Server content",
        syncStatus: "synced", version: 4, conflictServerJson: null, conflictLocalJson: null,
      };
      for (const syncStatus of ["pending_create", "pending_update", "pending_delete", "sync_failed", "conflict"]) {
        connection.exec("DELETE FROM tasks; DELETE FROM sync_queue;");
        const local = { ...base, syncStatus, isDeleted: syncStatus === "pending_delete" };
        upsertTask(local);
        connection.prepare("INSERT INTO sync_queue(local_id) VALUES (?)").run(local.localId);
        const saved = upsertTask(remote, true);
        assert.deepEqual(saved, local, syncStatus);
        assert.deepEqual(taskFromRow(connection.prepare("SELECT * FROM tasks").get()), local, syncStatus);
        assert.equal(connection.prepare("SELECT COUNT(*) AS count FROM sync_queue").get().count, 1);
        assert.equal(connection.prepare("SELECT COUNT(*) AS count FROM tasks").get().count, 1);
      }
      connection.exec("DELETE FROM tasks; DELETE FROM sync_queue;");
      assert.equal(upsertTask(remote, true).title, "Server child");
      const synced = { ...base, syncStatus: "synced", conflictServerJson: null, conflictLocalJson: null };
      connection.exec("DELETE FROM tasks;");
      upsertTask(synced);
      const updated = upsertTask(remote, true);
      assert.equal(updated.title, "Server child");
      assert.equal(updated.localId, "local-child");
      assert.equal(updated.version, 4);
      const newer = { ...synced, version: 5, title: "Synced newer edit" };
      upsertTask(newer);
      assert.deepEqual(upsertTask(remote, true), newer, "a delayed remote reply cannot roll back a newer synced task");
      upsertTask(base);
      assert.equal(upsertTask(remote).syncStatus, "synced", "normal acknowledgements still update local tasks");
      activeWorkspace = "workspace-b";
      assert.throws(() => upsertTask(remote, true, "workspace-a"), /workspace/i);
      activeWorkspace = "workspace-a";
      assert.equal(upsertTask(remote, true, "workspace-a").serverId, 42);
      connection.close();
      process.stdout.write("remote-preservation-ok");
    `, "utf8");
    const { stdout } = await execFileAsync(electronPath, [runner], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, timeout: 20000,
    });
    assert.match(stdout, /remote-preservation-ok/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
