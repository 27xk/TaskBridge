import assert from "node:assert/strict";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const {
  canUndoImportedBackupTask,
  getBackupImportUndoConfirmationMessage,
  getBackupImportUndoResultMessage,
} = await loadTsModule("shared/backup-import-policy.ts");

test("backup import undo only allows unchanged imported tasks", () => {
  assert.equal(canUndoImportedBackupTask("2026-06-08T01:00:00.000Z", "2026-06-08T01:00:00.000Z"), true);
  assert.equal(canUndoImportedBackupTask("2026-06-08T01:05:00.000Z", "2026-06-08T01:00:00.000Z"), false);
});

test("backup import undo confirmation explains changed tasks are kept", () => {
  assert.equal(
    getBackupImportUndoConfirmationMessage(3, "en-US"),
    "Undo 3 imported tasks from the most recent import? Tasks edited after import will be kept.",
  );
});

test("backup import undo result reports skipped changed tasks", () => {
  assert.equal(
    getBackupImportUndoResultMessage({ undoneCount: 2, skippedChangedCount: 1 }, "en-US"),
    "Undid 2 imported tasks. 1 changed task was kept.",
  );
  assert.equal(
    getBackupImportUndoResultMessage({ undoneCount: 0, skippedChangedCount: 2 }, "en-US"),
    "No imported tasks could be undone. 2 changed tasks were kept.",
  );
});
