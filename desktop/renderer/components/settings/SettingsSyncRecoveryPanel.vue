<script setup lang="ts">
import type { TaskMetaDto } from "../../api/task";
import { useSettingsStore } from "../../stores/settings";
import type { SyncDiagnostics } from "../../stores/sync";

defineProps<{
  deviceId: string;
  diagnostics: SyncDiagnostics;
  serverTaskMeta: TaskMetaDto | null;
  note: string;
  exportNote: string;
  updateTechnicalDetail: string;
}>();

const emit = defineEmits<{
  refresh: [];
  retry: [];
  exportDiagnostics: [];
}>();

const diagnosticsOpen = defineModel<boolean>("diagnosticsOpen", { default: false });

const settingsStore = useSettingsStore();

function onDiagnosticsToggle(event: Event): void {
  diagnosticsOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}

function syncQueueActionText(action: string): string {
  const normalized = String(action || "").toLowerCase();
  const english = settingsStore.language === "en-US";
  switch (normalized) {
    case "create":
    case "pending_create":
      return english ? "Create task" : "新建任务";
    case "update":
    case "pending_update":
      return english ? "Update task" : "更新任务";
    case "delete":
    case "pending_delete":
      return english ? "Delete task" : "删除任务";
    case "complete":
      return english ? "Complete task" : "完成任务";
    case "restore":
      return english ? "Restore task" : "恢复任务";
    default:
      return english ? "Pending change" : "待同步修改";
  }
}
</script>

<template>
  <section class="settings-section settings-sync-recovery">
    <div class="settings-section-heading-row">
      <h2>{{ settingsStore.t("settings.syncRecoveryCenter") }}</h2>
      <button
        class="secondary-button"
        type="button"
        :disabled="diagnostics.recoverableSyncIssueCount === 0"
        @click="emit('retry')"
      >
        {{ settingsStore.t("settings.retryExhaustedQueue") }}
      </button>
    </div>

    <p v-if="diagnostics.recoverableSyncIssueCount > 0" class="settings-sensitive-note">
      {{ settingsStore.t("settings.pendingOrFailedSyncRetryAvailable") }}
    </p>
    <p v-if="note" class="form-message form-message-success" role="status">
      {{ note }}
    </p>

    <p v-if="diagnostics.exhaustedQueueItems.length === 0" class="settings-sensitive-note">
      {{ settingsStore.t("settings.noExhaustedQueueItems") }}
    </p>
    <ul v-else class="sync-issue-list">
      <li v-for="issue in diagnostics.exhaustedQueueItems" :key="issue.id">
        <strong>{{ issue.title }}</strong>
        <span>
          {{ settingsStore.t("settings.syncIssueAction") }}:
          {{ syncQueueActionText(issue.action) }}
        </span>
        <span>
          {{ settingsStore.t("settings.syncIssueAttempts") }}:
          {{ issue.attemptCount }}
        </span>
        <span>
          {{ settingsStore.t("settings.syncIssueCreatedAt") }}:
          {{ issue.createdAt || "-" }}
        </span>
      </li>
    </ul>

    <details class="settings-advanced-details" :open="diagnosticsOpen" @toggle="onDiagnosticsToggle">
      <summary>{{ settingsStore.t("settings.syncDiagnostics") }}</summary>
      <div class="sync-diagnostics">
        <dl class="settings-device-list">
          <div>
            <dt>{{ settingsStore.t("settings.deviceId") }}</dt>
            <dd>{{ deviceId || "-" }}</dd>
          </div>
          <div>
            <dt>{{ settingsStore.t("settings.pendingQueueCount") }}</dt>
            <dd>{{ diagnostics.pendingQueueCount }}</dd>
          </div>
          <div>
            <dt>{{ settingsStore.t("settings.exhaustedQueueCount") }}</dt>
            <dd>{{ diagnostics.exhaustedQueueCount }}</dd>
          </div>
          <div>
            <dt>{{ settingsStore.t("settings.failedTaskCount") }}</dt>
            <dd>{{ diagnostics.failedCount }}</dd>
          </div>
          <div>
            <dt>{{ settingsStore.t("settings.conflictCount") }}</dt>
            <dd>{{ diagnostics.conflictCount }}</dd>
          </div>
          <div v-if="serverTaskMeta">
            <dt>{{ settingsStore.t("settings.serverTodayCount") }}</dt>
            <dd>{{ serverTaskMeta.counts.today }}</dd>
          </div>
          <div v-if="serverTaskMeta">
            <dt>{{ settingsStore.t("settings.serverOverdueCount") }}</dt>
            <dd>{{ serverTaskMeta.counts.overdue }}</dd>
          </div>
          <div>
            <dt>{{ settingsStore.t("settings.diagnosticsUpdatedAt") }}</dt>
            <dd>{{ diagnostics.updatedAt || "-" }}</dd>
          </div>
        </dl>
        <div class="form-actions settings-actions">
          <button class="secondary-button" type="button" @click="emit('refresh')">
            {{ settingsStore.t("settings.refreshDiagnostics") }}
          </button>
        </div>
      </div>
    </details>

    <details class="settings-advanced-details settings-support-tools">
      <summary>{{ settingsStore.t("settings.diagnosticsSupportTools") }}</summary>
      <div class="sync-diagnostics">
        <p class="settings-sensitive-note">{{ settingsStore.t("settings.diagnosticsSensitiveHint") }}</p>
        <div class="form-actions settings-actions">
          <button class="secondary-button" type="button" @click="emit('exportDiagnostics')">
            {{ settingsStore.t("settings.exportDiagnostics") }}
          </button>
        </div>
        <p v-if="exportNote" class="form-message form-message-success" role="status">{{ exportNote }}</p>
        <details v-if="updateTechnicalDetail" class="settings-technical-details">
          <summary>{{ settingsStore.t("settings.updateTechnicalDetails") }}</summary>
          <p>{{ updateTechnicalDetail }}</p>
        </details>
      </div>
    </details>
  </section>
</template>
