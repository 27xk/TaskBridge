<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import ConfirmDialog from "../components/ConfirmDialog.vue";
import SettingsAccountDisplayPanel from "../components/settings/SettingsAccountDisplayPanel.vue";
import SettingsConnectionPanel from "../components/settings/SettingsConnectionPanel.vue";
import SettingsDataSessionPanel from "../components/settings/SettingsDataSessionPanel.vue";
import SettingsMetadataPanel from "../components/settings/SettingsMetadataPanel.vue";
import SettingsWindowPanel from "../components/settings/SettingsWindowPanel.vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { bridge } from "../db/sqlite";
import type { AppLanguage } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { useSyncStore } from "../stores/sync";
import { useTaskStore } from "../stores/task";
import { DESKTOP_THEME_OPTIONS, type DesktopThemeId } from "../../shared/desktop-theme";
import {
  getBackupImportUndoConfirmationMessage,
  getBackupImportUndoResultMessage,
} from "../../shared/backup-import-policy";
import { formatConnectionFailureMessage } from "../../shared/user-facing-errors";

const props = defineProps<{
  sectionRequest?: { sectionId: string; nonce: number } | null;
}>();

const settings = reactive<TaskBridgeSettings>({
  baseUrl: "",
  wsUrl: "",
  currentUserId: null,
  language: "zh-CN",
  desktopTheme: "warm",
  displayTimeZone: "Asia/Shanghai",
  deviceId: "",
  lastSyncTime: "",
  autoStart: false,
  floatingOpacity: 0.96,
  floatingVisibleOnStart: true,
  floatingX: null,
  floatingY: null,
  floatingWidth: 320,
  floatingHeight: 460,
});
const saved = ref(false);
const exportNote = ref("");
const syncRecoveryNote = ref("");
const serverUrlDraft = ref("");
const connectionNote = ref("");
const connectionNoteTone = ref<"success" | "error" | null>(null);
const connectionTesting = ref(false);
const advancedConnectionOpen = ref(false);
const advancedEndpointsEdited = ref(false);
const advancedConnectionManuallyRequested = ref(false);
const syncDiagnosticsOpen = ref(false);
const updateStatus = ref<UpdateStatus | null>(null);
const pendingBackupImport = ref<BackupImportPreview | null>(null);
const confirmBackupImport = ref(false);
const lastImportedBackupLocalIds = ref<string[]>([]);
let unsubscribeUpdateStatus: (() => void) | null = null;
let autoSaveTimer: number | undefined;
const taskStore = useTaskStore();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const syncStore = useSyncStore();
const {
  confirmDialog,
  requestConfirmation,
  confirmRequestedAction,
  cancelRequestedAction,
} = useConfirmDialog(() => settingsStore.language);
const preferredTimeZones = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];
const runtimeTimeZones = typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("timeZone")
  : [];
const timeZoneOptions = computed(() =>
  Array.from(new Set([...preferredTimeZones, ...runtimeTimeZones])).map((value) => ({
    value,
    label: timeZoneOptionLabel(value),
  })),
);
const showAdvancedConnectionEntry = computed(
  () => advancedConnectionManuallyRequested.value || advancedConnectionOpen.value || advancedEndpointsEdited.value || connectionNoteTone.value === "error",
);
const clearLocalDataBlocked = computed(
  () =>
    syncStore.diagnostics.pendingQueueCount > 0 ||
    syncStore.diagnostics.exhaustedQueueCount > 0 ||
    syncStore.diagnostics.failedCount > 0 ||
    syncStore.diagnostics.conflictCount > 0,
);
const settingsNavGroups = computed(() => [
  {
    label: settingsStore.t("settings.navCommon"),
    items: [
      { sectionId: "account-display", label: settingsStore.t("settings.accountDisplay") },
      { sectionId: "connection", label: settingsStore.t("settings.connection") },
      { sectionId: "window", label: settingsStore.t("settings.window") },
    ],
  },
  {
    label: settingsStore.t("settings.navDataSafety"),
    items: [{ sectionId: "data", label: settingsStore.t("settings.dataSession") }],
  },
  {
    label: settingsStore.t("settings.navSyncRecovery"),
    items: [{ sectionId: "sync-recovery", label: settingsStore.t("settings.syncRecoveryCenter") }],
  },
  {
    label: settingsStore.t("settings.navAdvancedMaintenance"),
    items: [{ sectionId: "metadata", label: settingsStore.t("settings.metadata") }],
  },
]);

function localizeText(zh: string, en: string): string {
  return settingsStore.language === "zh-CN" ? zh : en;
}

async function scrollToSettingsSection(sectionId: string): Promise<void> {
  if (sectionId === "sync-recovery") {
    syncDiagnosticsOpen.value = true;
    await nextTick();
  }
  document.getElementById(`settings-${sectionId}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

watch(
  () => props.sectionRequest,
  (request) => {
    if (request) void scrollToSettingsSection(request.sectionId);
  },
  { immediate: true },
);

function handleSyncDiagnosticsToggle(event: Event): void {
  if (event.target instanceof HTMLDetailsElement) {
    syncDiagnosticsOpen.value = event.target.open;
  }
}

function timeZoneOptionLabel(value: string): string {
  const knownNames: Record<string, { zh: string; en: string }> = {
    "Asia/Shanghai": { zh: "上海", en: "Shanghai" },
    "Asia/Tokyo": { zh: "东京", en: "Tokyo" },
    "Asia/Singapore": { zh: "新加坡", en: "Singapore" },
    UTC: { zh: "协调世界时", en: "UTC" },
    "Europe/London": { zh: "伦敦", en: "London" },
    "America/New_York": { zh: "纽约", en: "New York" },
    "America/Los_Angeles": { zh: "洛杉矶", en: "Los Angeles" },
  };
  const fallbackName = value.split("/").pop()?.replace(/_/g, " ") || value;
  const cityName = knownNames[value]
    ? localizeText(knownNames[value].zh, knownNames[value].en)
    : fallbackName;
  const offset = timeZoneOffsetLabel(value);
  return offset ? `${cityName} (${offset})` : cityName;
}

function timeZoneOffsetLabel(value: string): string {
  try {
    const timeZoneName = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return timeZoneName || "";
  } catch {
    return "";
  }
}

const metaEdit = reactive({
  projectFrom: "",
  projectTo: "",
  tagFrom: "",
  tagTo: "",
});

onMounted(async () => {
  Object.assign(settings, await bridge().app.getSettings());
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  updateStatus.value = await bridge().app.getUpdateStatus();
  unsubscribeUpdateStatus = bridge().app.onUpdateStatus((status) => {
    updateStatus.value = status;
  });
  await refreshLastImportUndoSummary();
  await syncStore.refreshDiagnostics();
});

onBeforeUnmount(() => {
  unsubscribeUpdateStatus?.();
  unsubscribeUpdateStatus = null;
  if (autoSaveTimer !== undefined) window.clearTimeout(autoSaveTimer);
});

function showAutoSaveFeedback(): void {
  saved.value = true;
  if (autoSaveTimer !== undefined) window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    saved.value = false;
    autoSaveTimer = undefined;
  }, 1800);
}

async function save(): Promise<void> {
  await settingsStore.setLanguage(settings.language);
  settings.language = settingsStore.language;
  await settingsStore.setDesktopTheme(settings.desktopTheme);
  settings.desktopTheme = settingsStore.desktopTheme;
  await settingsStore.setDisplayTimeZone(settings.displayTimeZone);
  settings.displayTimeZone = settingsStore.displayTimeZone;
  Object.assign(settings, await bridge().app.setSetting("floatingOpacity", settings.floatingOpacity));
  Object.assign(settings, await bridge().app.setSetting("floatingVisibleOnStart", settings.floatingVisibleOnStart));
  Object.assign(settings, await bridge().app.setAutoStart(settings.autoStart));
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  showAutoSaveFeedback();
}

function deriveConnectionEndpoints(serverUrl: string): { serverUrl: string; baseUrl: string; wsUrl: string } {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const url = new URL(normalizedServerUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    serverUrl: normalizedServerUrl,
    baseUrl: `${normalizedServerUrl}/api/v1`,
    wsUrl: `${wsProtocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}/ws/sync`,
  };
}

function applyServerUrl(): boolean {
  try {
    const endpoints = deriveConnectionEndpoints(serverUrlDraft.value);
    serverUrlDraft.value = endpoints.serverUrl;
    settings.baseUrl = endpoints.baseUrl;
    settings.wsUrl = endpoints.wsUrl;
    advancedEndpointsEdited.value = false;
    connectionNote.value = "";
    connectionNoteTone.value = null;
    return true;
  } catch (error) {
    connectionNote.value = formatConnectionFailureMessage(
      error,
      settingsStore.t("settings.connectionFailed"),
      settingsStore.language,
    );
    connectionNoteTone.value = "error";
    return false;
  }
}

function syncServerUrlFromAdvanced(): void {
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  advancedConnectionManuallyRequested.value = true;
  advancedEndpointsEdited.value = true;
  connectionNote.value = "";
  connectionNoteTone.value = null;
}

function markAdvancedEndpointEdited(): void {
  advancedConnectionManuallyRequested.value = true;
  advancedEndpointsEdited.value = true;
  connectionNote.value = "";
  connectionNoteTone.value = null;
}

function setAdvancedConnectionOpen(event: Event): void {
  advancedConnectionOpen.value = (event.currentTarget as HTMLDetailsElement).open;
  if (advancedConnectionOpen.value) {
    advancedConnectionManuallyRequested.value = true;
  }
}

function showAdvancedConnection(): void {
  advancedConnectionManuallyRequested.value = true;
  advancedConnectionOpen.value = true;
}

async function persistConnectionSettings(baseUrl = settings.baseUrl, wsUrl = settings.wsUrl): Promise<void> {
  Object.assign(settings, await bridge().app.setSetting("baseUrl", baseUrl.trim()));
  Object.assign(settings, await bridge().app.setSetting("wsUrl", wsUrl.trim()));
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
}

async function saveConnection(): Promise<void> {
  applyServerUrl();
  await persistConnectionSettings();
  connectionNote.value = settingsStore.t("settings.connectionSaved");
  connectionNoteTone.value = "success";
}

async function resetGeneratedConnectionEndpoints(): Promise<void> {
  if (!applyServerUrl()) return;
  await persistConnectionSettings();
  connectionNote.value = settingsStore.t("settings.connectionSaved");
  connectionNoteTone.value = "success";
}

async function testConnection(): Promise<void> {
  await checkAndSaveConnection();
}

async function saveAdvancedConnection(): Promise<void> {
  connectionTesting.value = true;
  connectionNote.value = "";
  connectionNoteTone.value = null;
  try {
    await persistConnectionSettings();
    await bridge().api.request({ method: "GET", url: "/sync/status" });
    connectionNote.value = settingsStore.t("settings.connectionReady");
    connectionNoteTone.value = "success";
    advancedEndpointsEdited.value = false;
  } catch (error) {
    connectionNote.value = formatConnectionFailureMessage(
      error,
      settingsStore.t("settings.connectionFailed"),
      settingsStore.language,
    );
    connectionNoteTone.value = "error";
  } finally {
    connectionTesting.value = false;
  }
}

async function checkAndSaveConnection(): Promise<void> {
  connectionTesting.value = true;
  connectionNote.value = "";
  connectionNoteTone.value = null;
  try {
    const endpoints = advancedEndpointsEdited.value
      ? { baseUrl: settings.baseUrl, wsUrl: settings.wsUrl }
      : deriveConnectionEndpoints(serverUrlDraft.value);
    await persistConnectionSettings(endpoints.baseUrl, endpoints.wsUrl);
    await bridge().api.request({ method: "GET", url: "/sync/status" });
    connectionNote.value = settingsStore.t("settings.connectionReady");
    connectionNoteTone.value = "success";
    advancedEndpointsEdited.value = false;
  } catch (error) {
    connectionNote.value = formatConnectionFailureMessage(
      error,
      settingsStore.t("settings.connectionFailed"),
      settingsStore.language,
    );
    connectionNoteTone.value = "error";
  } finally {
    connectionTesting.value = false;
  }
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("server_url_required");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must start with http:// or https://");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "") || "/";
  return url.toString().replace(/\/+$/, "");
}

function inferServerUrlFromApi(apiUrl: string): string {
  try {
    return normalizeServerUrl(apiUrl);
  } catch {
    return "http://127.0.0.1:8000";
  }
}

async function applyFloatingOpacity(): Promise<void> {
  settings.floatingOpacity = await bridge().floating.setOpacity(settings.floatingOpacity);
  showAutoSaveFeedback();
}

async function exportBackup(): Promise<void> {
  const result = await bridge().task.exportJson();
  exportNote.value = result.canceled ? settingsStore.t("settings.exportCanceled") : `${settingsStore.t("settings.exported")}${result.filePath}`;
}

async function importBackup(): Promise<void> {
  const preview = await bridge().task.chooseImportJson();
  if (preview.canceled) {
    exportNote.value = settingsStore.t("settings.importCanceled");
    return;
  }
  if (preview.error) {
    exportNote.value = `${settingsStore.t("settings.importFailed")}${formatImportFailureMessage(preview.error)}`;
    return;
  }
  pendingBackupImport.value = preview;
  confirmBackupImport.value = true;
  const confirmed = await requestConfirmation({
    message: formatBackupImportPreviewMessage(preview),
    confirmText: settingsStore.t("settings.importBackup"),
    danger: true,
  });
  confirmBackupImport.value = false;
  if (!confirmed) {
    pendingBackupImport.value = null;
    exportNote.value = settingsStore.t("settings.importCanceled");
    return;
  }
  await confirmSelectedBackupImport();
}

async function confirmSelectedBackupImport(): Promise<void> {
  if (!pendingBackupImport.value) return;
  const result = await bridge().task.confirmImportJson();
  pendingBackupImport.value = null;
  if (result.error) {
    exportNote.value = `${settingsStore.t("settings.importFailed")}${formatImportFailureMessage(result.error)}`;
    return;
  }
  const skipped = result.skippedCount ?? 0;
  const skippedNote = skipped > 0
    ? `${settingsStore.t("settings.importSkippedPrefix")}${skipped}${settingsStore.t("settings.importSkippedSuffix")}`
    : "";
  exportNote.value = `${settingsStore.t("settings.imported")}${result.importedCount ?? 0}${settingsStore.t("settings.importedSuffix")}${skippedNote}`;
  lastImportedBackupLocalIds.value = result.importedLocalIds ?? [];
  await taskStore.load();
  await syncStore.refreshDiagnostics();
}

async function undoLastBackupImport(): Promise<void> {
  if (lastImportedBackupLocalIds.value.length === 0) return;
  const confirmed = await requestConfirmation({
    message: getBackupImportUndoConfirmationMessage(lastImportedBackupLocalIds.value.length, settingsStore.language),
    confirmText: settingsStore.t("settings.undoLastImport"),
    danger: true,
  });
  if (!confirmed) return;
  const result = await bridge().task.undoLastImportJson();
  lastImportedBackupLocalIds.value = [];
  exportNote.value = getBackupImportUndoResultMessage(
    {
      undoneCount: result.undoneCount,
      skippedChangedCount: result.skippedChangedCount,
    },
    settingsStore.language,
  );
  await taskStore.load();
  await syncStore.refreshDiagnostics();
}

async function clearLocalDeviceData(): Promise<void> {
  if (clearLocalDataBlocked.value) {
    exportNote.value = settingsStore.t("settings.clearLocalDataBlocked");
    return;
  }
  const confirmed = await requestConfirmation({
    message: settingsStore.t("settings.clearLocalDataConfirmMessage"),
    confirmText: settingsStore.t("settings.clearLocalData"),
    danger: true,
  });
  if (!confirmed) return;
  await bridge().db.clearLocalDeviceData();
  await authStore.logout();
  await taskStore.load();
  await syncStore.refreshDiagnostics();
  exportNote.value = settingsStore.t("settings.localDataCleared");
}

async function refreshLastImportUndoSummary(): Promise<void> {
  const summary = await bridge().task.getLastImportUndoSummary();
  lastImportedBackupLocalIds.value = summary.localIds;
}

async function exportDiagnostics(): Promise<void> {
  if (!(await confirmDiagnosticsExport())) {
    exportNote.value = settingsStore.t("settings.diagnosticsExportCanceled");
    return;
  }
  const result = await bridge().task.exportDiagnostics();
  exportNote.value = result.canceled
    ? settingsStore.t("settings.diagnosticsExportCanceled")
    : `${settingsStore.t("settings.diagnosticsExported")}${result.filePath}`;
}

function confirmDiagnosticsExport(): Promise<boolean> {
  return requestConfirmation({
    message: settingsStore.t("settings.confirmDiagnosticsExport"),
    confirmText: settingsStore.t("settings.exportDiagnostics"),
    danger: true,
  });
}

function formatBackupImportPreviewMessage(preview: BackupImportPreview): string {
  return settingsStore
    .t("settings.confirmBackupImport")
    .replace("{count}", String(preview.importableCount ?? 0))
    .replace("{skipped}", String(preview.skippedCount ?? 0));
}

async function checkForUpdates(): Promise<void> {
  updateStatus.value = await bridge().app.checkForUpdates();
}

const updateStatusSummary = computed(() => {
  if (!updateStatus.value) return "-";
  const details = [
    updateStateText(updateStatus.value.state),
    updateStatus.value.version ? `v${updateStatus.value.version}` : "",
    typeof updateStatus.value.percent === "number" ? `${updateStatus.value.percent}%` : "",
  ].filter(Boolean);
  return details.join(" · ");
});

const updateTechnicalDetail = computed(() => {
  if (!updateStatus.value) return "";
  const details = [
    updateStatus.value.message,
    updateStatus.value.error,
    updateStatus.value.checkedAt ? `${settingsStore.t("settings.diagnosticsUpdatedAt")}: ${updateStatus.value.checkedAt}` : "",
  ].filter(Boolean);
  return details.join(" · ");
});

function formatImportFailureMessage(error: BackupImportError): string {
  switch (error.code) {
    case "file_too_large":
      return localizeText("备份文件过大，请导入较小的 TaskBridge 备份。", "The backup file is too large. Import a smaller TaskBridge backup.");
    case "invalid_json":
      return localizeText("文件不是有效 JSON，请重新选择 TaskBridge 导出的备份文件。", "The file is not valid JSON. Choose a backup exported by TaskBridge.");
    case "unsupported_format":
      return localizeText("备份格式不受支持，请导入 TaskBridge 本地备份文件。", "This backup format is not supported. Import a TaskBridge local backup file.");
    case "missing_tasks":
      return localizeText("备份中没有可导入的有效任务，请确认文件未损坏。", "No valid tasks were found. Check that the backup file is not corrupted.");
    case "too_many_tasks":
      return localizeText("备份中的任务数量超过当前导入上限，请拆分后再导入。", "The backup contains more tasks than the import limit. Split it before importing.");
    default:
      return localizeText("请确认文件来自 TaskBridge 备份并重试。", "Check that the file is a TaskBridge backup and try again.");
  }
}

function updateStateText(state: UpdateState): string {
  switch (state) {
    case "disabled":
      return localizeText("当前运行环境不支持自动更新", "Auto update is unavailable in this runtime");
    case "idle":
      return localizeText("尚未检查更新", "Not checked yet");
    case "checking":
      return localizeText("正在检查更新", "Checking for updates");
    case "available":
      return localizeText("发现可用更新", "Update available");
    case "not-available":
      return localizeText("已是最新版本", "Up to date");
    case "downloading":
      return localizeText("正在下载更新", "Downloading update");
    case "downloaded":
      return localizeText("更新已下载，退出后安装", "Update downloaded; installs on quit");
    case "error":
      return localizeText("更新检查失败，请稍后重试", "Update check failed. Try again later");
    default:
      return localizeText("更新状态未知", "Update status unknown");
  }
}

function metadataRenameAffectedCount(field: "project" | "tag", oldValue: string): number {
  const normalizedOld = oldValue.trim();
  if (!normalizedOld) return 0;
  return taskStore.activeTasks.filter((task) => task[field] === normalizedOld).length;
}

async function confirmRenameTaskMeta(field: "project" | "tag", oldValue: string, newValue: string): Promise<boolean> {
  const affectedCount = metadataRenameAffectedCount(field, oldValue);
  if (affectedCount <= 0) return false;
  return requestConfirmation({
    message: settingsStore.t("settings.confirmMetadataRename").replace("{count}", String(affectedCount)),
    confirmText: field === "project" ? settingsStore.t("settings.renameProject") : settingsStore.t("settings.renameTag"),
    danger: !newValue.trim(),
  });
}

async function renameProject(): Promise<void> {
  if (!(await confirmRenameTaskMeta("project", metaEdit.projectFrom, metaEdit.projectTo))) return;
  await taskStore.renameProject(metaEdit.projectFrom, metaEdit.projectTo);
  exportNote.value = settingsStore.t("settings.projectRenamed");
}

async function renameTag(): Promise<void> {
  if (!(await confirmRenameTaskMeta("tag", metaEdit.tagFrom, metaEdit.tagTo))) return;
  await taskStore.renameTag(metaEdit.tagFrom, metaEdit.tagTo);
  exportNote.value = settingsStore.t("settings.tagRenamed");
}

function updateLanguage(language: AppLanguage): void {
  settings.language = language;
  void settingsStore.setLanguage(settings.language);
  showAutoSaveFeedback();
}

async function updateDisplayTimeZone(timeZone: string): Promise<void> {
  settings.displayTimeZone = timeZone;
  await settingsStore.setDisplayTimeZone(settings.displayTimeZone);
  settings.displayTimeZone = settingsStore.displayTimeZone;
  showAutoSaveFeedback();
}

function updateDesktopTheme(theme: DesktopThemeId): void {
  settings.desktopTheme = theme;
  void settingsStore.setDesktopTheme(theme);
  showAutoSaveFeedback();
}

async function updateAutoStart(enabled: boolean): Promise<void> {
  settings.autoStart = enabled;
  Object.assign(settings, await bridge().app.setAutoStart(settings.autoStart));
  showAutoSaveFeedback();
}

async function updateFloatingVisibleOnStart(enabled: boolean): Promise<void> {
  settings.floatingVisibleOnStart = enabled;
  Object.assign(settings, await bridge().app.setSetting("floatingVisibleOnStart", enabled));
  showAutoSaveFeedback();
}

async function refreshDiagnostics(): Promise<void> {
  Object.assign(settings, await bridge().app.getSettings());
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  await refreshLastImportUndoSummary();
  await syncStore.refreshDiagnostics();
}

async function retryExhaustedQueue(): Promise<void> {
  syncRecoveryNote.value = "";
  await syncStore.retryExhaustedQueue();
  syncRecoveryNote.value = settingsStore.t("settings.retryExhaustedDone");
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
  <section class="view-shell settings-view">
    <header class="view-header">
      <div>
        <p class="eyebrow">{{ settingsStore.t("settings.title") }}</p>
        <h1>{{ settingsStore.t("settings.subtitle") }}</h1>
        <p class="settings-save-hint">{{ settingsStore.t("settings.autoSaveHint") }}</p>
      </div>
      <p class="save-note" v-if="saved">{{ settingsStore.t("settings.autoSaved") }}</p>
    </header>

    <nav class="settings-section-nav" :aria-label="settingsStore.t('settings.title')">
      <div v-for="group in settingsNavGroups" :key="group.label" class="settings-nav-group">
        <span class="settings-nav-group-label">{{ group.label }}</span>
        <div class="settings-nav-group-actions">
          <button
            v-for="item in group.items"
            :key="item.sectionId"
            class="secondary-button"
            type="button"
            @click="scrollToSettingsSection(item.sectionId)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
    </nav>

    <div class="settings-layout">
      <SettingsAccountDisplayPanel
        id="settings-account-display"
        class="theme-picker-surface"
        :language="settings.language"
        :display-time-zone="settings.displayTimeZone"
        :desktop-theme="settings.desktopTheme"
        :auto-start="settings.autoStart"
        :time-zone-options="timeZoneOptions"
        :theme-options="DESKTOP_THEME_OPTIONS"
        @language-change="updateLanguage"
        @display-time-zone-change="updateDisplayTimeZone"
        @desktop-theme-change="updateDesktopTheme"
        @auto-start-change="updateAutoStart"
      />

      <SettingsConnectionPanel
        id="settings-connection"
        v-model:server-url-draft="serverUrlDraft"
        v-model:base-url="settings.baseUrl"
        v-model:ws-url="settings.wsUrl"
        :connection-testing="connectionTesting"
        :connection-note="connectionNote"
        :connection-note-tone="connectionNoteTone"
        :advanced-connection-open="advancedConnectionOpen"
        :show-advanced-connection-entry="showAdvancedConnectionEntry"
        @apply-server-url="applyServerUrl"
        @check-and-save-connection="checkAndSaveConnection"
        @advanced-connection-toggle="setAdvancedConnectionOpen"
        @show-advanced-connection="showAdvancedConnection"
        @sync-server-url-from-advanced="syncServerUrlFromAdvanced"
        @mark-advanced-endpoint-edited="markAdvancedEndpointEdited"
        @reset-generated-connection-endpoints="resetGeneratedConnectionEndpoints"
        @save-advanced-connection="saveAdvancedConnection"
      />

      <div class="settings-row">
        <SettingsWindowPanel
          id="settings-window"
          v-model:floating-visible-on-start="settings.floatingVisibleOnStart"
          v-model:floating-opacity="settings.floatingOpacity"
          @apply-floating-opacity="applyFloatingOpacity"
          @update:floating-visible-on-start="updateFloatingVisibleOnStart"
        />

        <span id="settings-data" class="settings-anchor" aria-hidden="true"></span>
        <section class="settings-section settings-data">
          <SettingsDataSessionPanel
            :last-sync-time="settings.lastSyncTime"
            :last-imported-backup-local-ids="lastImportedBackupLocalIds"
            :update-status-summary="updateStatusSummary"
            :saved="saved"
            :export-note="exportNote"
            :clear-local-data-blocked="clearLocalDataBlocked"
            :clear-local-data-blocked-message="settingsStore.t('settings.clearLocalDataBlocked')"
            @export-backup="exportBackup"
            @import-backup="importBackup"
            @undo-last-backup-import="undoLastBackupImport"
            @clear-local-device-data="clearLocalDeviceData"
            @check-for-updates="checkForUpdates"
          />

          <span id="settings-sync-recovery" class="settings-anchor" aria-hidden="true"></span>
          <div class="settings-diagnostics-section">
            <details class="settings-advanced-details" :open="syncDiagnosticsOpen" @toggle="handleSyncDiagnosticsToggle">
              <summary>{{ settingsStore.t("settings.syncDiagnostics") }}</summary>
              <div class="sync-diagnostics">
                <dl class="settings-device-list">
                  <div>
                    <dt>{{ settingsStore.t("settings.deviceId") }}</dt>
                    <dd>{{ settings.deviceId || "-" }}</dd>
                  </div>
                  <div>
                    <dt>{{ settingsStore.t("settings.pendingQueueCount") }}</dt>
                    <dd>{{ syncStore.diagnostics.pendingQueueCount }}</dd>
                  </div>
                  <div>
                    <dt>{{ settingsStore.t("settings.exhaustedQueueCount") }}</dt>
                    <dd>{{ syncStore.diagnostics.exhaustedQueueCount }}</dd>
                  </div>
                  <div>
                    <dt>{{ settingsStore.t("settings.failedTaskCount") }}</dt>
                    <dd>{{ syncStore.diagnostics.failedCount }}</dd>
                  </div>
                  <div>
                    <dt>{{ settingsStore.t("settings.conflictCount") }}</dt>
                    <dd>{{ syncStore.diagnostics.conflictCount }}</dd>
                  </div>
                  <div>
                    <dt>{{ settingsStore.t("settings.diagnosticsUpdatedAt") }}</dt>
                    <dd>{{ syncStore.diagnostics.updatedAt || "-" }}</dd>
                  </div>
                </dl>
                <div class="form-actions settings-actions">
                  <button class="secondary-button" type="button" @click="refreshDiagnostics">
                    {{ settingsStore.t("settings.refreshDiagnostics") }}
                  </button>
                </div>
                <div class="sync-recovery-center">
                  <div class="settings-section-heading-row">
                    <h3>{{ settingsStore.t("settings.syncRecoveryCenter") }}</h3>
                    <button
                      class="secondary-button"
                      type="button"
                      :disabled="syncStore.diagnostics.recoverableSyncIssueCount === 0"
                      @click="retryExhaustedQueue"
                    >
                      {{ settingsStore.t("settings.retryExhaustedQueue") }}
                    </button>
                  </div>
                  <p v-if="syncStore.diagnostics.recoverableSyncIssueCount > 0" class="settings-sensitive-note">
                    {{ settingsStore.t("settings.pendingOrFailedSyncRetryAvailable") }}
                  </p>
                  <p v-if="syncRecoveryNote" class="form-message form-message-success">{{ syncRecoveryNote }}</p>
                  <p v-if="syncStore.diagnostics.exhaustedQueueItems.length === 0" class="settings-sensitive-note">
                    {{ settingsStore.t("settings.noExhaustedQueueItems") }}
                  </p>
                  <ul v-else class="sync-issue-list">
                  <li v-for="issue in syncStore.diagnostics.exhaustedQueueItems" :key="issue.id">
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
                </div>
              </div>
            </details>

            <details class="settings-advanced-details settings-support-tools">
              <summary>{{ settingsStore.t("settings.diagnosticsSupportTools") }}</summary>
              <div class="sync-diagnostics">
                <p class="settings-sensitive-note">{{ settingsStore.t("settings.diagnosticsSensitiveHint") }}</p>
                <div class="form-actions settings-actions">
                  <button class="secondary-button" type="button" @click="exportDiagnostics">
                    {{ settingsStore.t("settings.exportDiagnostics") }}
                  </button>
                </div>
                <details v-if="updateTechnicalDetail" class="settings-technical-details">
                  <summary>{{ settingsStore.t("settings.updateTechnicalDetails") }}</summary>
                  <p>{{ updateTechnicalDetail }}</p>
                </details>
              </div>
            </details>
          </div>
        </section>
      </div>

      <SettingsMetadataPanel
        id="settings-metadata"
        v-model:project-from="metaEdit.projectFrom"
        v-model:project-to="metaEdit.projectTo"
        v-model:tag-from="metaEdit.tagFrom"
        v-model:tag-to="metaEdit.tagTo"
        :projects="taskStore.projects"
        :tags="taskStore.tags"
        @rename-project="renameProject"
        @rename-tag="renameTag"
      />
    </div>

    <ConfirmDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText"
      :cancel-text="confirmDialog.cancelText"
      :danger="confirmDialog.danger"
      @confirm="confirmRequestedAction"
      @cancel="cancelRequestedAction"
    />
  </section>
</template>
