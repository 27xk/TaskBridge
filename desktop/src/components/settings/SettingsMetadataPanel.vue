<script setup lang="ts">
import { useSettingsStore } from "../../stores/settings";

defineProps<{
  projectFrom: string;
  projectTo: string;
  tagFrom: string;
  tagTo: string;
  projects: string[];
  tags: string[];
}>();

const emit = defineEmits<{
  "update:projectFrom": [value: string];
  "update:projectTo": [value: string];
  "update:tagFrom": [value: string];
  "update:tagTo": [value: string];
  renameProject: [];
  renameTag: [];
}>();

const settingsStore = useSettingsStore();

function onProjectFromChange(event: Event): void {
  emit("update:projectFrom", (event.target as HTMLSelectElement).value);
}

function onProjectToInput(event: Event): void {
  emit("update:projectTo", (event.target as HTMLInputElement).value);
}

function onTagFromChange(event: Event): void {
  emit("update:tagFrom", (event.target as HTMLSelectElement).value);
}

function onTagToInput(event: Event): void {
  emit("update:tagTo", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="settings-section settings-metadata">
    <h2>{{ settingsStore.t("settings.metadata") }}</h2>
    <div class="settings-grid">
      <label>
        <span>{{ settingsStore.t("settings.projectFrom") }}</span>
        <select :value="projectFrom" @change="onProjectFromChange">
          <option value="">{{ settingsStore.t("settings.projectFrom") }}</option>
          <option v-for="project in projects" :key="project" :value="project">{{ project }}</option>
        </select>
      </label>
      <label>
        <span>{{ settingsStore.t("settings.projectTo") }}</span>
        <input :value="projectTo" type="text" @input="onProjectToInput" />
      </label>
      <label>
        <span>{{ settingsStore.t("settings.tagFrom") }}</span>
        <select :value="tagFrom" @change="onTagFromChange">
          <option value="">{{ settingsStore.t("settings.tagFrom") }}</option>
          <option v-for="tag in tags" :key="tag" :value="tag">#{{ tag }}</option>
        </select>
      </label>
      <label>
        <span>{{ settingsStore.t("settings.tagTo") }}</span>
        <input :value="tagTo" type="text" @input="onTagToInput" />
      </label>
    </div>
    <div class="form-actions settings-actions">
      <button class="secondary-button" type="button" @click="$emit('renameProject')">{{ settingsStore.t("settings.renameProject") }}</button>
      <button class="secondary-button" type="button" @click="$emit('renameTag')">{{ settingsStore.t("settings.renameTag") }}</button>
    </div>
  </section>
</template>
