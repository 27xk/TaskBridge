import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const { deriveWorkspaceStatus } = await loadTsModule(
  "shared/workspace-ui-policy.ts",
);

const zeroDiagnostics = {
  pendingQueueCount: 0,
  exhaustedQueueCount: 0,
  failedCount: 0,
  conflictCount: 0,
};

describe("workspace status presentation", () => {
  test("keeps a synced workspace quiet when diagnostics are clear", () => {
    assert.deepEqual(deriveWorkspaceStatus("synced", zeroDiagnostics), {
      indicator: "ready",
      banner: "none",
      issueCount: 0,
    });
  });

  test("keeps an idle workspace quiet while diagnostics initialize", () => {
    assert.deepEqual(deriveWorkspaceStatus("idle", {
      pendingQueueCount: 2,
      exhaustedQueueCount: 1,
      failedCount: 1,
      conflictCount: 1,
    }), {
      indicator: "ready",
      banner: "none",
      issueCount: 0,
    });
  });

  test("shows syncing as working without a main-area banner", () => {
    assert.deepEqual(deriveWorkspaceStatus("syncing", zeroDiagnostics), {
      indicator: "working",
      banner: "none",
      issueCount: 0,
    });
  });

  test("shows queued offline work in the offline presentation", () => {
    assert.deepEqual(deriveWorkspaceStatus("offline", {
      ...zeroDiagnostics,
      pendingQueueCount: 2,
    }), {
      indicator: "offline",
      banner: "offline",
      issueCount: 2,
    });
  });

  test("shows a sync error as requiring attention", () => {
    assert.deepEqual(deriveWorkspaceStatus("error", zeroDiagnostics), {
      indicator: "attention",
      banner: "attention",
      issueCount: 0,
    });
  });

  test("prioritizes actionable diagnostics over a synced status", () => {
    assert.deepEqual(deriveWorkspaceStatus("synced", {
      pendingQueueCount: 0,
      exhaustedQueueCount: 1,
      failedCount: 1,
      conflictCount: 2,
    }), {
      indicator: "attention",
      banner: "attention",
      issueCount: 4,
    });
  });

  test("does not escalate a synced pending queue to an alert banner", () => {
    assert.deepEqual(deriveWorkspaceStatus("synced", {
      ...zeroDiagnostics,
      pendingQueueCount: 2,
    }), {
      indicator: "ready",
      banner: "none",
      issueCount: 2,
    });
  });
});
