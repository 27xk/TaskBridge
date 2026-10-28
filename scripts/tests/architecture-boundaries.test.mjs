import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkArchitecture } from "../checks/check-architecture-boundaries.mjs";

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), "taskbridge-architecture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ["desktop/main", "desktop/preload", "desktop/renderer", "desktop/common",
    "backend/app/services/tasks", "android/app/src/main/java/com/taskbridge/app/domain"]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const [path, source] of Object.entries({
    "backend/app/services/task_service.py": "",
    "backend/app/services/sync_service.py": "",
    "backend/app/services/sync_log_service.py": "",
    ...files,
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source);
  }
  return root;
}

test("process adapters may depend on common while domain remains independent", async (t) => {
  const root = await fixture(t, {
    "desktop/common/types.ts": "export type Task = { id: string };",
    "desktop/main/db.ts": 'import type { Task } from "../common/types";',
    "desktop/preload/index.ts": 'import { contextBridge } from "electron";\nimport type { Task } from "../common/types";',
    "desktop/renderer/App.vue": '<script setup lang="ts">\nimport { ref } from "vue";\nimport type { Task } from "../common/types";\n</script>',
    "backend/app/services/task_service.py": "from app.services.tasks.recurrence import build_repeat_occurrence",
    "backend/app/services/sync_service.py": "from app.services.sync_log_service import append_sync_log",
    "android/app/src/main/java/com/taskbridge/app/domain/Task.kt": "package com.taskbridge.app.domain\ndata class Task(val id: Long)",
  });
  assert.deepEqual(await checkArchitecture(root), []);
});

test("type imports and dynamic imports cannot cross process boundaries", async (t) => {
  const root = await fixture(t, {
    "desktop/common/types.ts": 'import type { Language } from "../renderer/i18n";',
    "desktop/renderer/db.ts": 'const db = await import("better-sqlite3");',
    "desktop/preload/index.ts": 'export { readTask } from "../main/db";',
    "desktop/main/window.ts": 'import type { View } from "../renderer/view";',
  });
  const failures = await checkArchitecture(root);
  assert.equal(failures.length, 4, failures.join("\n"));
  for (const name of ["common/types.ts", "renderer/db.ts", "preload/index.ts", "main/window.ts"]) {
    assert.ok(failures.some((failure) => failure.includes(name)), name);
  }
});

test("backend coordinating services and Android data models stay outside domain modules", async (t) => {
  const root = await fixture(t, {
    "backend/app/services/task_service.py": "from app.services.sync_service import append_sync_log",
    "backend/app/services/tasks/recurrence.py": "from app.services import task_service",
    "android/app/src/main/java/com/taskbridge/app/domain/Task.kt": "import com.taskbridge.app.data.local.TaskEntity",
  });
  const failures = await checkArchitecture(root);
  assert.equal(failures.length, 3, failures.join("\n"));
});

test("commented imports do not count and missing architectural roots are reported", async (t) => {
  const root = await fixture(t, {
    "desktop/common/types.ts": '// import { View } from "../renderer/view";\n/* import { app } from "electron"; */',
    "backend/app/services/task_service.py": "# from app.services import sync_service",
    "android/app/src/main/java/com/taskbridge/app/domain/Task.kt": "// import com.taskbridge.app.data.local.TaskEntity",
  });
  assert.deepEqual(await checkArchitecture(root), []);
  await rm(join(root, "desktop/common"), { recursive: true });
  assert.ok((await checkArchitecture(root)).some((failure) => failure.includes("desktop/common")));
});

test("relative Python imports cannot reconnect coordinating services", async (t) => {
  const root = await fixture(t, {
    "backend/app/services/task_service.py": "from .sync_service import push_changes",
    "backend/app/services/sync_service.py": "from . import task_service",
    "backend/app/services/tasks/recurrence.py": "from ..task_service import complete_task",
  });
  assert.equal((await checkArchitecture(root)).length, 3);
});

test("compact Vue imports and reexports count but examples inside strings do not", async (t) => {
  const root = await fixture(t, {
    "desktop/common/example.ts": 'const example = "require(\'electron\')";\nconst url = "https://example.test/*/";',
    "desktop/renderer/App.vue": '<script setup>import { db } from "../main/db";</script>',
    "desktop/renderer/export.ts": 'export{db}from"../main/db";',
  });
  const failures = await checkArchitecture(root);
  assert.equal(failures.length, 2, failures.join("\n"));
  assert.ok(failures.every((failure) => failure.includes("renderer/")));
});
