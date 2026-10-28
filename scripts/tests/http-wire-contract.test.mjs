import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared JSON preserves null, false and absent update fields", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../shared/http-wire-fixtures.json", import.meta.url), "utf8"));
  const task = JSON.parse(JSON.stringify(fixture.task));
  assert.equal(task.content, null);
  assert.equal(task.title, "契约与 Unicode 📝");
  assert.equal(task.checklist[0].done, false);
  assert.equal(task.updated_at, "2026-10-26T10:21:00.000001Z");
  const change = JSON.parse(JSON.stringify(fixture.sync_change));
  assert.equal(change.content, null);
  assert.equal(change.priority, 0);
  assert.equal(Object.hasOwn(change, "title"), false);
});

test("release verifies actual installers after packaging and before artifact preparation", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const build = workflow.indexOf("- name: Build Windows installer");
  const budget = workflow.indexOf("- name: Verify packaged Windows artifact budgets");
  const prepare = workflow.indexOf("- name: Prepare desktop artifacts");
  assert.ok(build >= 0 && budget > build && prepare > budget);
  const step = workflow.slice(budget, workflow.indexOf("\n      - name:", budget + 1));
  assert.match(step, /--unpacked-dir release\/win-unpacked --installer \$installer.FullName/);
  assert.match(step, /LASTEXITCODE -ne 0/);
});

test("release generates the wire contract from the backend Python module directory", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("      - name: Verify generated client wire types");
  assert.ok(start >= 0, "release must check the generated wire contract");
  const end = workflow.indexOf("\n      - name:", start + 1);
  const step = workflow.slice(start, end < 0 ? undefined : end);
  assert.match(step, /working-directory:\s*backend/, "tools.client_contract is a backend module");
  assert.match(step, /run:\s*python -m tools\.client_contract --check/);
});

test("the deployment archive verifies backup drill and monitoring assets before upload", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("      - name: Build deployment bundle");
  const end = workflow.indexOf("\n      - name:", start + 1);
  const step = workflow.slice(start, end);
  assert.match(step, /git archive --format=tar HEAD deploy web README\.md VERSION/);
  const required = step.slice(step.indexOf("for required in"));
  for (const asset of ["deploy/backup-mysql.sh", "deploy/restore-mysql.sh", "deploy/verify-backup.py",
    "deploy/monitoring/prometheus.yml.example", "deploy/monitoring/alerts.yml", "deploy/monitoring/grafana-dashboard.json"]) {
    assert.ok(required.includes(`"${asset}"`), `${asset} must be checked in the deployment archive`);
  }
});

test("packaging retains its endpoint and Electron cache environment", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("      - name: Build Windows installer");
  const end = workflow.indexOf("\n      - name:", start + 1);
  const step = workflow.slice(start, end);
  assert.match(step, /run:\s*npm run dist/);
  for (const key of ["TASKBRIDGE_BASE_URL", "TASKBRIDGE_WS_URL", "ELECTRON_CACHE", "ELECTRON_BUILDER_CACHE"]) {
    assert.match(step, new RegExp(`^          ${key}:`, "m"), `${key} must belong to the packaging step`);
  }
});
