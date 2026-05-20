<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import { bridge } from "../db/sqlite";
import type { AppLanguage } from "../i18n";
import { useSettingsStore } from "../stores/settings";
import { useTaskStore } from "../stores/task";

const settings = reactive<TaskBridgeSettings>({
  baseUrl: "",
  wsUrl: "",
  language: "zh-CN",
  displayTimeZone: "Asia/Shanghai",
  deviceId: "",
  lastSyncTime: "",
  autoStart: false,
  floatingOpacity: 0.96,
  floatingVisibleOnStart: true,
  floatingMiniMode: false,
  floatingX: null,
  floatingY: null,
  floatingWidth: 320,
  floatingHeight: 460,
});
const saved = ref(false);
const exportNote = ref("");
const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const timeZoneOptions = [
  { value: "Asia/Shanghai", zh: "中国标准时间", en: "China Standard Time" },
  { value: "Asia/Tokyo", zh: "日本时间", en: "Japan Time" },
  { value: "Asia/Singapore", zh: "新加坡时间", en: "Singapore Time" },
  { value: "UTC", zh: "UTC", en: "UTC" },
  { value: "Europe/London", zh: "伦敦时间", en: "London Time" },
  { value: "America/New_York", zh: "纽约时间", en: "New York Time" },
  { value: "America/Los_Angeles", zh: "洛杉矶时间", en: "Los Angeles Time" },
];
const metaEdit = reactive({
  projectFrom: "",
  projectTo: "",
  tagFrom: "",
  tagTo: "",
});

onMounted(async () => {
  Object.assign(settings, await bridge().app.getSettings());
});

async function save(): Promise<void> {
  Object.assign(settings, await bridge().app.setSetting("language", settings.language));
  await settingsStore.setLanguage(settings.language);
  Object.assign(settings, await bridge().app.setSetting("displayTimeZone", settings.displayTimeZone));
  await settingsStore.setDisplayTimeZone(settings.displayTimeZone);
  Object.assign(settings, await bridge().app.setSetting("floatingOpacity", settings.floatingOpacity));
  Object.assign(settings, await bridge().app.setSetting("floatingVisibleOnStart", settings.floatingVisibleOnStart));
  Object.assign(settings, await bridge().app.setSetting("floatingMiniMode", settings.floatingMiniMode));
  Object.assign(settings, await bridge().app.setAutoStart(settings.autoStart));
  saved.value = true;
  window.setTimeout(() => {
    saved.value = false;
  }, 1800);
}

async function applyFloatingOpacity(): Promise<void> {
  settings.floatingOpacity = await bridge().floating.setOpacity(settings.floatingOpacity);
}

async function exportBackup(): Promise<void> {
  const result = await bridge().task.exportJson();
  exportNote.value = result.canceled ? settingsStore.t("settings.exportCanceled") : `${settingsStore.t("settings.exported")}${result.filePath}`;
}

async function importBackup(): Promise<void> {
  const result = await bridge().task.importJson();
  exportNote.value = result.canceled
    ? settingsStore.t("settings.importCanceled")
    : `${settingsStore.t("settings.imported")}${result.importedCount ?? 0}${settingsStore.t("settings.importedSuffix")}`;
  await taskStore.load();
}

async function renameProject(): Promise<void> {
  await taskStore.renameProject(metaEdit.projectFrom, metaEdit.projectTo);
  exportNote.value = settingsStore.t("settings.projectRenamed");
}

async function renameTag(): Promise<void> {
  await taskStore.renameTag(metaEdit.tagFrom, metaEdit.tagTo);
  exportNote.value = settingsStore.t("settings.tagRenamed");
}

function updateLanguage(event: Event): void {
  settings.language = (event.target as HTMLSelectElement).value as AppLanguage;
  void settingsStore.setLanguage(settings.language);
}
</script>

<template>
  <section class="view-shell settings-view">
    <header class="view-header">
      <div>
        <p class="eyebrow">{{ settingsStore.t("settings.title") }}</p>
        <h1>{{ settingsStore.t("settings.subtitle") }}</h1>
      </div>
      <button class="primary-button" type="button" @click="save">{{ settingsStore.t("settings.save") }}</button>
    </header>

    <div class="settings-layout">
      <section class="settings-section settings-primary">
        <h2>{{ settingsStore.t("settings.accountDisplay") }}</h2>
        <div class="settings-grid settings-primary-grid">
          <label>
            <span>{{ settingsStore.t("settings.language") }}</span>
            <select v-model="settings.language" @change="updateLanguage">
              <option value="zh-CN">{{ settingsStore.t("settings.languageZh") }}</option>
              <option value="en-US">{{ settingsStore.t("settings.languageEn") }}</option>
            </select>
          </label>
          <label>
            <span>{{ settingsStore.t("settings.displayTimeZone") }}</span>
            <select v-model="settings.displayTimeZone">
              <option v-for="zone in timeZoneOptions" :key="zone.value" :value="zone.value">
                {{ settingsStore.language === "zh-CN" ? zone.zh : zone.en }} · {{ zone.value }}
              </option>
            </select>
            <small>{{ settingsStore.t("settings.displayTimeZoneHint") }}</small>
          </label>
          <label class="checkbox-line">
            <input v-model="settings.autoStart" type="checkbox" />
            <span>{{ settingsStore.t("settings.autoStart") }}</span>
          </label>
        </div>
      </section>

      <div class="settings-row">
        <section class="settings-section">
          <h2>{{ settingsStore.t("settings.window") }}</h2>
          <div class="settings-grid settings-window-grid">
            <label class="checkbox-line">
              <input v-model="settings.floatingVisibleOnStart" type="checkbox" />
              <span>{{ settingsStore.t("settings.floatingVisibleOnStart") }}</span>
            </label>
            <label class="checkbox-line">
              <input v-model="settings.floatingMiniMode" type="checkbox" />
              <span>{{ settingsStore.t("settings.floatingMiniMode") }}</span>
            </label>
            <label class="settings-range">
              <span>{{ settingsStore.t("settings.floatingOpacity") }} {{ Math.round(settings.floatingOpacity * 100) }}%</span>
              <input
                v-model.number="settings.floatingOpacity"
                type="range"
                min="0.45"
                max="1"
                step="0.05"
                @input="applyFloatingOpacity"
              />
            </label>
          </div>
        </section>

        <section class="settings-section settings-data">
          <h2>{{ settingsStore.t("settings.dataSession") }}</h2>
          <div class="settings-data-actions">
            <button class="secondary-button" type="button" @click="exportBackup">{{ settingsStore.t("settings.exportBackup") }}</button>
            <button class="secondary-button" type="button" @click="importBackup">{{ settingsStore.t("settings.importBackup") }}</button>
          </div>
          <dl class="settings-device-list">
            <div>
              <dt>{{ settingsStore.t("settings.deviceId") }}</dt>
              <dd>{{ settings.deviceId || "-" }}</dd>
            </div>
            <div>
              <dt>{{ settingsStore.t("settings.lastSyncTime") }}</dt>
              <dd>{{ settings.lastSyncTime || "-" }}</dd>
            </div>
          </dl>
          <p v-if="saved" class="save-note">{{ settingsStore.t("settings.saved") }}</p>
          <p v-if="exportNote" class="save-note">{{ exportNote }}</p>
        </section>
      </div>

      <section class="settings-section settings-metadata">
        <h2>{{ settingsStore.t("settings.metadata") }}</h2>
        <div class="settings-grid">
          <label>
            <span>{{ settingsStore.t("settings.projectFrom") }}</span>
            <select v-model="metaEdit.projectFrom">
              <option value="">{{ settingsStore.t("settings.projectFrom") }}</option>
              <option v-for="project in taskStore.projects" :key="project" :value="project">{{ project }}</option>
            </select>
          </label>
          <label>
            <span>{{ settingsStore.t("settings.projectTo") }}</span>
            <input v-model="metaEdit.projectTo" type="text" />
          </label>
          <label>
            <span>{{ settingsStore.t("settings.tagFrom") }}</span>
            <select v-model="metaEdit.tagFrom">
              <option value="">{{ settingsStore.t("settings.tagFrom") }}</option>
              <option v-for="tag in taskStore.tags" :key="tag" :value="tag">#{{ tag }}</option>
            </select>
          </label>
          <label>
            <span>{{ settingsStore.t("settings.tagTo") }}</span>
            <input v-model="metaEdit.tagTo" type="text" />
          </label>
        </div>
        <div class="form-actions settings-actions">
          <button class="secondary-button" type="button" @click="renameProject">{{ settingsStore.t("settings.renameProject") }}</button>
          <button class="secondary-button" type="button" @click="renameTag">{{ settingsStore.t("settings.renameTag") }}</button>
        </div>
      </section>
    </div>
  </section>
</template>
