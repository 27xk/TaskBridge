import { defineStore } from "pinia";
import { ref } from "vue";

import { bridge } from "../db/sqlite";
import { normalizeLanguage, translate, type AppLanguage } from "../i18n";

export const useSettingsStore = defineStore("settings", () => {
  const language = ref<AppLanguage>("zh-CN");
  const loaded = ref(false);

  async function load(): Promise<void> {
    const settings = await bridge().app.getSettings();
    language.value = normalizeLanguage(settings.language);
    loaded.value = true;
  }

  async function setLanguage(nextLanguage: AppLanguage): Promise<void> {
    const normalized = normalizeLanguage(nextLanguage);
    const settings = await bridge().app.setSetting("language", normalized);
    language.value = normalizeLanguage(settings.language);
  }

  function t(key: Parameters<typeof translate>[0]): string {
    return translate(key, language.value);
  }

  return {
    language,
    loaded,
    load,
    setLanguage,
    t,
  };
});
