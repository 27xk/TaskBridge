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
  const desktopDensity = ref<"comfortable" | "compact">("comfortable");
  const desktopGlassEnabled = ref(true);
  const hardwareAcceleration = ref(false);
  const displayTimeZone = ref(DEFAULT_TIME_ZONE);
  const loaded = ref(false);

  applyDesktopTheme(desktopTheme.value);
  applyDocumentLanguage(language.value);
  applyDisplayPreferences();

  async function load(): Promise<void> {
    const settings = await bridge().app.getSettings();
    const rendering = await bridge().app.getRenderingCapabilities().catch(() => ({ hardwareAcceleration: false }));
    hardwareAcceleration.value = rendering.hardwareAcceleration;
    language.value = normalizeLanguage(settings.language);
    desktopTheme.value = normalizeDesktopTheme(settings.desktopTheme);
    displayTimeZone.value = normalizeTimeZone(settings.displayTimeZone);
    desktopDensity.value = settings.desktopDensity === "compact" ? "compact" : "comfortable";
    desktopGlassEnabled.value = settings.desktopGlassEnabled !== false;
    applyDisplayPreferences();
    applyDesktopTheme(desktopTheme.value);
    applyDocumentLanguage(language.value);
    loaded.value = true;
  }

  async function setLanguage(nextLanguage: AppLanguage): Promise<void> {
    const normalized = normalizeLanguage(nextLanguage);
    const settings = await bridge().app.setSetting("language", normalized);
    language.value = normalizeLanguage(settings.language);
    applyDocumentLanguage(language.value);
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

  async function setDesktopDensity(density: "comfortable" | "compact"): Promise<void> {
    const settings = await bridge().app.setSetting("desktopDensity", density);
    desktopDensity.value = settings.desktopDensity === "compact" ? "compact" : "comfortable";
    applyDisplayPreferences();
  }

  async function setDesktopGlassEnabled(enabled: boolean): Promise<void> {
    const settings = await bridge().app.setSetting("desktopGlassEnabled", enabled);
    desktopGlassEnabled.value = settings.desktopGlassEnabled !== false;
    applyDisplayPreferences();
  }

  function applyDisplayPreferences(): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.density = desktopDensity.value;
    document.documentElement.dataset.glass = desktopGlassEnabled.value ? "on" : "off";
    document.documentElement.dataset.renderer = hardwareAcceleration.value ? "hardware" : "software";
  }

  function t(key: Parameters<typeof translate>[0]): string {
    return translate(key, language.value);
  }

  function applyDesktopTheme(theme: DesktopThemeId): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = normalizeDesktopTheme(theme);
  }

  function applyDocumentLanguage(language: AppLanguage): void {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
  }

  return {
    language,
    desktopTheme,
    desktopDensity,
    desktopGlassEnabled,
    hardwareAcceleration,
    displayTimeZone,
    loaded,
    load,
    setLanguage,
    setDesktopTheme,
    setDesktopDensity,
    setDesktopGlassEnabled,
    setDisplayTimeZone,
    t,
  };
});
