import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkDesktopArtifactBudget, DESKTOP_ARTIFACT_LIMITS } from "../scripts/check-desktop-artifact-budget.mjs";

test("artifact budgets measure built bytes and reject an oversized emitted renderer chunk", t => {
  const root = mkdtempSync(join(tmpdir(), "taskbridge-artifact-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["main", "preload", "renderer/assets", "unpacked/resources"]) mkdirSync(join(root, directory), { recursive: true });
  for (const file of ["main/index.js", "preload/index.cjs", "renderer/index.html", "renderer/assets/app.js", "renderer/assets/app.css", "unpacked/resources/app.asar", "setup.exe"]) writeFileSync(join(root, file), "fixture");
  const valid = checkDesktopArtifactBudget({ buildDirectory: root, unpackedDirectory: join(root, "unpacked"), installer: join(root, "setup.exe") });
  assert.equal(valid.rendererJsBytes, 7);
  assert.equal(valid.asarBytes, 7);
  assert.equal(valid.installerBytes, 7);
  writeFileSync(join(root, "renderer/assets/extra.js"), Buffer.alloc(DESKTOP_ARTIFACT_LIMITS.rendererJs));
  assert.throws(() => checkDesktopArtifactBudget({ buildDirectory: root }), /renderer JavaScript exceeded/);
});

test("missing outputs cannot silently pass an artifact budget", () => {
  assert.throws(() => checkDesktopArtifactBudget(), /select at least/);
  assert.throws(() => checkDesktopArtifactBudget({ buildDirectory: join(tmpdir(), "taskbridge-no-built-output") }), /ENOENT/);
});
