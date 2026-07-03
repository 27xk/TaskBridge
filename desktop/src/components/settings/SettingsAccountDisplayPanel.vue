<script setup lang="ts">
import type { DesktopThemeId, DesktopThemeOption } from "../../../shared/desktop-theme";
import type { AppLanguage } from "../../i18n";
import { useSettingsStore } from "../../stores/settings";

const props = defineProps<{
  language: AppLanguage;
  displayTimeZone: string;
  desktopTheme: DesktopThemeId;
  autoStart: boolean;
  timeZoneOptions: Array<{ value: string; label: string }>;
  themeOptions: readonly DesktopThemeOption[];
}>();

const emit = defineEmits<{
  languageChange: [value: AppLanguage];
  displayTimeZoneChange: [value: string];
  desktopThemeChange: [value: DesktopThemeId];
  autoStartChange: [value: boolean];
}>();

const settingsStore = useSettingsStore();

function updateThemeFromKeyboard(event: KeyboardEvent, currentTheme: DesktopThemeId): void {
  const currentIndex = props.themeOptions.findIndex((theme) => theme.value === currentTheme);
  const lastIndex = props.themeOptions.length - 1;
  let nextIndex = currentIndex;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = lastIndex;
      break;
    default:
      return;
  }
  event.preventDefault();
  const nextTheme = props.themeOptions[nextIndex];
  if (nextTheme) emit("desktopThemeChange", nextTheme.value);
}

function onLanguageChange(event: Event): void {
  emit("languageChange", (event.target as HTMLSelectElement).value as AppLanguage);
}

function onDisplayTimeZoneChange(event: Event): void {
  emit("displayTimeZoneChange", (event.target as HTMLSelectElement).value);
}

function onAutoStartChange(event: Event): void {
  emit("autoStartChange", (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <section class="settings-section settings-primary">
    <h2>{{ settingsStore.t("settings.accountDisplay") }}</h2>
    <div class="settings-grid settings-primary-grid">
      <label>
        <span>{{ settingsStore.t("settings.language") }}</span>
        <select :value="language" @change="onLanguageChange">
          <option value="zh-CN">{{ settingsStore.t("settings.languageZh") }}</option>
          <option value="en-US">{{ settingsStore.t("settings.languageEn") }}</option>
        </select>
      </label>
      <label>
        <span>{{ settingsStore.t("settings.displayTimeZone") }}</span>
        <select :value="displayTimeZone" @change="onDisplayTimeZoneChange">
          <option v-for="zone in timeZoneOptions" :key="zone.value" :value="zone.value">
            {{ zone.label }}
          </option>
        </select>
        <small>{{ settingsStore.t("settings.displayTimeZoneHint") }}</small>
      </label>
      <div class="settings-theme-field">
        <span class="settings-field-label">{{ settingsStore.t("settings.desktopTheme") }}</span>
        <div class="theme-picker" role="radiogroup" :aria-label="settingsStore.t('settings.desktopTheme')">
          <button
            v-for="theme in themeOptions"
            :key="theme.value"
            type="button"
            class="theme-option"
            :class="{ active: desktopTheme === theme.value }"
            :aria-checked="desktopTheme === theme.value"
            :tabindex="desktopTheme === theme.value ? 0 : -1"
            role="radio"
            @click="$emit('desktopThemeChange', theme.value)"
            @keydown="updateThemeFromKeyboard($event, theme.value)"
          >
            <span class="theme-swatch" aria-hidden="true">
              <i v-for="color in theme.swatches" :key="color" :style="{ background: color }"></i>
            </span>
            <span>{{ settingsStore.language === "zh-CN" ? theme.zh : theme.en }}</span>
          </button>
        </div>
        <small>{{ settingsStore.t("settings.desktopThemeHint") }}</small>
      </div>
      <label class="checkbox-line">
        <input
          type="checkbox"
          :checked="autoStart"
          @change="onAutoStartChange"
        />
        <span>{{ settingsStore.t("settings.autoStart") }}</span>
      </label>
    </div>
  </section>
</template>
