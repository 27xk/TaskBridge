<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import { bridge } from "../db/sqlite";
import { useTaskStore } from "../stores/task";

const settings = reactive<TaskBridgeSettings>({
  baseUrl: "",
  wsUrl: "",
  deviceId: "",
  lastSyncTime: "",
  autoStart: false,
  floatingOpacity: 0.96,
  floatingVisibleOnStart: true,
  floatingMiniMode: false,
  floatingX: null,
  floatingY: null,
});
const saved = ref(false);
const exportNote = ref("");
const taskStore = useTaskStore();
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
  Object.assign(settings, await bridge().app.setSetting("baseUrl", settings.baseUrl));
  Object.assign(settings, await bridge().app.setSetting("wsUrl", settings.wsUrl));
  Object.assign(settings, await bridge().app.setSetting("floatingVisibleOnStart", settings.floatingVisibleOnStart));
  Object.assign(settings, await bridge().app.setSetting("floatingMiniMode", settings.floatingMiniMode));
  Object.assign(settings, await bridge().app.setAutoStart(settings.autoStart));
  saved.value = true;
  window.setTimeout(() => {
    saved.value = false;
  }, 1800);
}

async function exportBackup(): Promise<void> {
  const result = await bridge().task.exportJson();
  exportNote.value = result.canceled ? "已取消导出。" : `已导出：${result.filePath}`;
}

async function importBackup(): Promise<void> {
  const result = await bridge().task.importJson();
  exportNote.value = result.canceled ? "已取消导入。" : `已导入 ${result.importedCount ?? 0} 条任务。`;
  await taskStore.load();
}

async function renameProject(): Promise<void> {
  await taskStore.renameProject(metaEdit.projectFrom, metaEdit.projectTo);
  exportNote.value = "项目已更新。";
}

async function renameTag(): Promise<void> {
  await taskStore.renameTag(metaEdit.tagFrom, metaEdit.tagTo);
  exportNote.value = "标签已更新。";
}
</script>

<template>
  <section class="view-shell">
    <header class="view-header">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>Desktop client</h1>
      </div>
      <button class="primary-button" type="button" @click="save">Save</button>
    </header>

    <div class="settings-grid">
      <label>
        <span>API Base URL</span>
        <input v-model="settings.baseUrl" type="url" />
      </label>
      <label>
        <span>WebSocket URL</span>
        <input v-model="settings.wsUrl" type="url" />
      </label>
      <label>
        <span>Device ID</span>
        <input v-model="settings.deviceId" type="text" readonly />
      </label>
      <label>
        <span>Last sync time</span>
        <input v-model="settings.lastSyncTime" type="text" readonly />
      </label>
      <label class="checkbox-line">
        <input v-model="settings.autoStart" type="checkbox" />
        <span>Start TaskBridge when Windows starts</span>
      </label>
      <label class="checkbox-line">
        <input v-model="settings.floatingVisibleOnStart" type="checkbox" />
        <span>Show floating window when TaskBridge starts</span>
      </label>
      <label class="checkbox-line">
        <input v-model="settings.floatingMiniMode" type="checkbox" />
        <span>Floating window mini mode</span>
      </label>
    </div>

    <div class="form-actions settings-actions">
      <button class="secondary-button" type="button" @click="exportBackup">Export local backup</button>
      <button class="secondary-button" type="button" @click="importBackup">Import local backup</button>
    </div>

    <div class="settings-grid meta-tools">
      <label>
        <span>项目原名</span>
        <input v-model="metaEdit.projectFrom" type="text" list="project-options" />
      </label>
      <label>
        <span>项目新名</span>
        <input v-model="metaEdit.projectTo" type="text" />
      </label>
      <label>
        <span>标签原名</span>
        <input v-model="metaEdit.tagFrom" type="text" list="tag-options" />
      </label>
      <label>
        <span>标签新名</span>
        <input v-model="metaEdit.tagTo" type="text" />
      </label>
    </div>
    <div class="form-actions settings-actions">
      <button class="secondary-button" type="button" @click="renameProject">Rename project</button>
      <button class="secondary-button" type="button" @click="renameTag">Rename tag</button>
    </div>
    <datalist id="project-options">
      <option v-for="project in taskStore.projects" :key="project" :value="project" />
    </datalist>
    <datalist id="tag-options">
      <option v-for="tag in taskStore.tags" :key="tag" :value="tag" />
    </datalist>

    <p v-if="saved" class="save-note">Settings saved.</p>
    <p v-if="exportNote" class="save-note">{{ exportNote }}</p>
  </section>
</template>
