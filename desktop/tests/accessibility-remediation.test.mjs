import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "..");

async function source(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("dangerous confirmations focus cancel while ordinary confirmations focus confirm", async () => {
  const dialog = await source("desktop/renderer/components/ConfirmDialog.vue");

  assert.match(dialog, /const cancelButton = ref<HTMLButtonElement \| null>\(null\)/);
  assert.match(dialog, /props\.danger\s*\?\s*cancelButton\.value\s*:\s*confirmButton\.value/);
  assert.match(dialog, /ref="cancelButton"/);
});

test("desktop language metadata follows the selected interface language", async () => {
  const index = await source("desktop/index.html");
  const settings = await source("desktop/renderer/stores/settings.ts");

  assert.match(index, /<html lang="zh-CN">/);
  assert.match(settings, /function applyDocumentLanguage\(/);
  assert.match(settings, /document\.documentElement\.lang = language/);
  assert.match(settings, /applyDocumentLanguage\(language\.value\)/);
});

test("task completion and quick-add text meet desktop accessibility targets", async () => {
  const base = await source("desktop/renderer/assets/base.css");
  const workspace = await source("desktop/renderer/assets/workspace.css");

  assert.match(base, /\.check-button\s*\{[^}]*min-width:\s*40px;[^}]*min-height:\s*40px;/s);
  assert.match(workspace, /input::placeholder,[\s\S]*textarea::placeholder\s*\{\s*color:\s*var\(--workspace-muted\);/);
});

test("today view has one advanced editor entry instead of duplicate create buttons", async () => {
  const today = await source("desktop/renderer/views/TodayView.vue");
  const header = today.slice(today.indexOf('<header class="view-header">'), today.indexOf("<WorkspaceQuickAdd"));

  assert.doesNotMatch(header, /task\.addToday/);
  assert.match(today, /@open-editor="openCreate"/);
});

test("desktop login tells users how password recovery works", async () => {
  const login = await source("desktop/renderer/views/LoginView.vue");
  const i18n = await source("desktop/renderer/i18n.ts");

  assert.match(login, /settingsStore\.t\("auth\.forgotPasswordHelp"\)/);
  assert.match(i18n, /"auth\.forgotPasswordHelp"/);
});

test("narrow selectable task rows reserve columns only for checkbox, body, and actions", async () => {
  const workspace = await source("desktop/renderer/assets/workspace.css");

  assert.match(
    workspace,
    /\.focus-workspace \.task-row\.selectable\s*{\s*grid-template-columns:\s*22px minmax\(0, 1fr\) auto;/,
  );
  assert.doesNotMatch(workspace, /\.task-row\.selectable\s*{[^}]*22px 40px minmax\(0, 1fr\) auto;/s);
});

test("task completion control names its task and remains the only restore entry", async () => {
  const taskItem = await source("desktop/renderer/components/TaskItem.vue");

  assert.match(
    taskItem,
    /:aria-label="taskMenuLabel\(isCompletedStatus\(task\.status\) \? settingsStore\.t\('task\.restore'\) : settingsStore\.t\('task\.complete'\), task\.title\)"/,
  );
  assert.doesNotMatch(
    taskItem,
    /v-else-if="isCompletedStatus\(task\.status\)"[^>]*>[\s\S]{0,120}task\.restore/,
  );
});
