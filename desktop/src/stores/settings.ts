import { defineStore } from "pinia";
import { ref } from "vue";

import { bridge } from "../db/sqlite";
import { normalizeLanguage, translate, type AppLanguage } from "../i18n";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "../../shared/quick-add-parser";

export const useSettingsStore = defineStore("settings", () => {
  const language = ref<AppLanguage>("zh-CN");
  const displayTimeZone = ref(DEFAULT_TIME_ZONE);
  const loaded = ref(false);

  async function load(): Promise<void> {
    const settings = await bridge().app.getSettings();
    language.value = normalizeLanguage(settings.language);
    displayTimeZone.value = normalizeTimeZone(settings.displayTimeZone);
    loaded.value = true;
  }

  async function setLanguage(nextLanguage: AppLanguage): Promise<void> {
    const normalized = normalizeLanguage(nextLanguage);
    const settings = await bridge().app.setSetting("language", normalized);
    language.value = normalizeLanguage(settings.language);
  }

  async function setDisplayTimeZone(timeZoneId: string): Promise<void> {
    const settings = await bridge().app.setSetting("displayTimeZone", normalizeTimeZone(timeZoneId));
    displayTimeZone.value = normalizeTimeZone(settings.displayTimeZone);
  }

  function t(key: Parameters<typeof translate>[0]): string {
    return translate(key, language.value);
  }

  return {
    language,
    displayTimeZone,
    loaded,
    load,
    setLanguage,
    setDisplayTimeZone,
    t,
  };
});
