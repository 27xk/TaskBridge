import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspaceRoot } from "./script-helpers.mjs";

const root = workspaceRoot(import.meta.url);

const [
  packageSource,
  themeSource,
  envSource,
  stateSource,
  ipcSource,
  settingsStoreSource,
  settingsViewSource,
  cssSource,
  i18nSource,
] = await Promise.all([
  readFile(resolve(root, "package.json"), "utf8"),
  readFile(resolve(root, "shared/desktop-theme.ts"), "utf8"),
  readFile(resolve(root, "src/env.d.ts"), "utf8"),
  readFile(resolve(root, "electron/state.ts"), "utf8"),
  readFile(resolve(root, "electron/ipc.ts"), "utf8"),
  readFile(resolve(root, "src/stores/settings.ts"), "utf8"),
  readFile(resolve(root, "src/views/SettingsView.vue"), "utf8"),
  readFile(resolve(root, "src/assets/base.css"), "utf8"),
  readFile(resolve(root, "src/i18n.ts"), "utf8"),
]);

const expectedThemes = ["warm", "mist", "forest", "harbor", "rose"];

for (const themeId of expectedThemes) {
  assert.match(themeSource, new RegExp(`"${themeId}"`), `shared theme list must include ${themeId}`);
  assert.match(cssSource, new RegExp(`data-theme="${themeId}"`), `CSS must define the ${themeId} theme`);
}

assert.match(
  themeSource,
  /normalizeDesktopTheme/,
  "desktop theme values must be normalized before use",
);
assert.match(
  themeSource,
  /export const DESKTOP_THEME_OPTIONS/,
  "shared theme module must expose theme metadata as the single source of truth",
);
assert.match(
  themeSource,
  /DESKTOP_THEME_IDS\s*=\s*DESKTOP_THEME_OPTIONS\.map\(\(theme\) => theme\.value\)/,
  "theme IDs must be derived from the shared theme metadata",
);
assert.match(
  envSource,
  /desktopTheme/,
  "renderer settings type must include desktopTheme",
);
assert.match(
  stateSource,
  /desktopTheme/,
  "main-process settings schema must persist desktopTheme",
);
assert.match(
  stateSource,
  /DEFAULT_DESKTOP_THEME/,
  "desktop settings must default to the shared desktop theme",
);
assert.match(
  ipcSource,
  /key === "desktopTheme"/,
  "IPC settings validation must allow desktopTheme",
);
assert.match(
  ipcSource,
  /normalizeDesktopTheme/,
  "IPC settings validation must normalize desktopTheme",
);
assert.match(
  settingsStoreSource,
  /document\.documentElement\.dataset\.theme/,
  "renderer settings store must apply the theme to the document root",
);
assert.match(
  settingsStoreSource,
  /setDesktopTheme/,
  "renderer settings store must expose an immediate theme setter",
);
assert.match(
  settingsViewSource,
  /theme-picker/,
  "settings page must expose a theme picker",
);
assert.match(
  settingsViewSource,
  /DESKTOP_THEME_OPTIONS/,
  "settings page must render theme choices from the shared theme metadata",
);
assert.doesNotMatch(
  settingsViewSource,
  /const desktopThemeOptions:/,
  "settings page must not duplicate desktop theme metadata inline",
);
assert.match(
  settingsViewSource,
  /setDesktopTheme/,
  "settings page must apply theme changes immediately",
);
assert.match(
  i18nSource,
  /"settings\.desktopTheme"/,
  "settings copy must include a desktop theme label",
);
assert.match(
  packageSource,
  /check:desktop-theme/,
  "package scripts must expose the desktop theme check",
);

console.log("desktop theme config check passed");
