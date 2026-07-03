<script setup lang="ts">
import { computed } from "vue";

import { useSettingsStore } from "../../stores/settings";
import { useSyncStore } from "../../stores/sync";

defineProps<{
  lastSyncTime: string;
  lastImportedBackupLocalIds: string[];
  updateStatusSummary: string;
  saved: boolean;
  exportNote: string;
  clearLocalDataBlocked: boolean;
  clearLocalDataBlockedMessage: string;
}>();

defineEmits<{
  exportBackup: [];
  importBackup: [];
  undoLastBackupImport: [];
  clearLocalDeviceData: [];
  checkForUpdates: [];
}>();

const settingsStore = useSettingsStore();
const syncStore = useSyncStore();
const syncNeedsAttention = computed(
  () =>
    syncStore.diagnostics.pendingQueueCount > 0 ||
    syncStore.diagnostics.exhaustedQueueCount > 0 ||
    syncStore.diagnostics.failedCount > 0 ||
    syncStore.diagnostics.conflictCount > 0,
);
const syncAtAGlanceText = computed(() =>
  syncNeedsAttention.value ? settingsStore.t("settings.syncNeedsAttention") : settingsStore.t("settings.syncLooksGood"),
);
const syncNextStepText = computed(() =>
  syncNeedsAttention.value ? settingsStore.t("settings.syncNextStepReview") : settingsStore.t("settings.syncNextStepNone"),
);
</script>

<template>
  <div class="settings-data-content">
    <h2>{{ settingsStore.t("settings.dataSession") }}</h2>
    <dl class="settings-device-list settings-status-summary">
      <div>
        <dt>{{ settingsStore.t("settings.syncAtAGlance") }}</dt>
        <dd>{{ syncAtAGlanceText }}</dd>
      </div>
      <div>
        <dt>{{ settingsStore.t("settings.syncNextStep") }}</dt>
        <dd>{{ syncNextStepText }}</dd>
      </div>
    </dl>
    <details class="settings-advanced-details settings-data-advanced-tools">
      <summary>{{ settingsStore.t("settings.dataTools") }}</summary>
      <div class="settings-data-actions">
        <div class="settings-data-group">
          <h3>{{ settingsStore.t("settings.backup") }}</h3>
          <div class="settings-backup-actions">
            <button class="secondary-button" type="button" @click="$emit('exportBackup')">{{ settingsStore.t("settings.exportBackup") }}</button>
            <button class="secondary-button" type="button" @click="$emit('importBackup')">{{ settingsStore.t("settings.importBackup") }}</button>
            <button
              v-if="lastImportedBackupLocalIds.length > 0"
              class="secondary-button"
              type="button"
              @click="$emit('undoLastBackupImport')"
            >
              {{ settingsStore.t("settings.undoLastImport") }}
            </button>
          </div>
        </div>
        <div class="settings-data-group">
          <h3>{{ settingsStore.t("settings.session") }}</h3>
          <p class="settings-sensitive-note">
            {{ settingsStore.t("settings.localDataTrust") }}
          </p>
          <p class="settings-sensitive-note" :class="{ 'form-message-error': clearLocalDataBlocked }">
            {{ clearLocalDataBlocked ? clearLocalDataBlockedMessage : settingsStore.t("settings.clearLocalDataSafetyHint") }}
          </p>
          <div class="settings-session-actions">
            <button
              class="secondary-button danger-outline-button"
              type="button"
              :disabled="clearLocalDataBlocked"
              @click="$emit('clearLocalDeviceData')"
            >
              {{ settingsStore.t("settings.clearLocalData") }}
            </button>
          </div>
        </div>
        <div class="settings-data-group">
          <h3>{{ settingsStore.t("settings.updates") }}</h3>
          <div class="settings-update-actions">
            <button class="secondary-button" type="button" @click="$emit('checkForUpdates')">
              {{ settingsStore.t("settings.checkUpdates") }}
            </button>
          </div>
          <p class="settings-sensitive-note">
            {{ settingsStore.t("settings.updateStatus") }}: {{ updateStatusSummary }}
          </p>
        </div>
      </div>
    </details>
    <dl class="settings-device-list">
      <div>
        <dt>{{ settingsStore.t("settings.lastSyncTime") }}</dt>
        <dd>{{ lastSyncTime || "-" }}</dd>
      </div>
    </dl>
    <p v-if="saved" class="save-note">{{ settingsStore.t("settings.autoSaved") }}</p>
    <p v-if="exportNote" class="save-note">{{ exportNote }}</p>
  </div>
</template>
