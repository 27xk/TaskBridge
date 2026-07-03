import { defineStore } from "pinia";
import { ref } from "vue";

import { bridge } from "../db/sqlite";
import { normalizeLanguage, translate, type AppLanguage } from "../i18n";
import {
  DEFAULT_DESKTOP_THEME,
  normalizeDesktopTheme,
  type DesktopThemeId,
} from "../../shared/desktop-theme";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "../../shared/quick-add-parser";

export const useSettingsStore = defineStore("settings", () => {
  const language = ref<AppLanguage>("zh-CN");
  const desktopTheme = ref<DesktopThemeId>(DEFAULT_DESKTOP_THEME);
  const displayTimeZone = ref(DEFAULT_TIME_ZONE);
  const loaded = ref(false);

  applyDesktopTheme(desktopTheme.value);

  async function load(): Promise<void> {
    const settings = await bridge().app.getSettings();
    language.value = normalizeLanguage(settings.language);
    desktopTheme.value = normalizeDesktopTheme(settings.desktopTheme);
    displayTimeZone.value = normalizeTimeZone(settings.displayTimeZone);
    applyDesktopTheme(desktopTheme.value);
    loaded.value = true;
  }

  async function setLanguage(nextLanguage: AppLanguage): Promise<void> {
    const normalized = normalizeLanguage(nextLanguage);
    const settings = await bridge().app.setSetting("language", normalized);
    language.value = normalizeLanguage(settings.language);
  }

  async function setDesktopTheme(nextTheme: DesktopThemeId): Promise<void> {
    const normalized = normalizeDesktopTheme(nextTheme);
    desktopTheme.value = normalized;
    applyDesktopTheme(normalized);
    const settings = await bridge().app.setSetting("desktopTheme", normalized);
    desktopTheme.value = normalizeDesktopTheme(settings.desktopTheme);
    applyDesktopTheme(desktopTheme.value);
  }

  async function setDisplayTimeZone(timeZoneId: string): Promise<void> {
    const settings = await bridge().app.setSetting("displayTimeZone", normalizeTimeZone(timeZoneId));
    displayTimeZone.value = normalizeTimeZone(settings.displayTimeZone);
  }

  function t(key: Parameters<typeof translate>[0]): string {
    return translate(key, language.value);
  }

  function applyDesktopTheme(theme: DesktopThemeId): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = normalizeDesktopTheme(theme);
  }

  return {
    language,
    desktopTheme,
    displayTimeZone,
    loaded,
    load,
    setLanguage,
    setDesktopTheme,
    setDisplayTimeZone,
    t,
  };
});
