<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from "vue";
import { Cable, Database, Monitor, RefreshCw, ShieldCheck, Tags, UserRound } from "lucide-vue-next";

import ConfirmDialog from "../components/ConfirmDialog.vue";
import SettingsAccountDisplayPanel from "../components/settings/SettingsAccountDisplayPanel.vue";
import SettingsAccountSecurityPanel from "../components/settings/SettingsAccountSecurityPanel.vue";
import SettingsConnectionPanel from "../components/settings/SettingsConnectionPanel.vue";
import SettingsDataSessionPanel from "../components/settings/SettingsDataSessionPanel.vue";
import SettingsMetadataPanel from "../components/settings/SettingsMetadataPanel.vue";
import SettingsSyncRecoveryPanel from "../components/settings/SettingsSyncRecoveryPanel.vue";
import SettingsWindowPanel from "../components/settings/SettingsWindowPanel.vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { bridge } from "../db/sqlite";
import type { AppLanguage } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { useSyncStore } from "../stores/sync";
import { useTaskStore } from "../stores/task";
import { fetchTaskMeta, type TaskMetaDto } from "../api/task";
import { DESKTOP_THEME_OPTIONS, type DesktopThemeId } from "../../shared/desktop-theme";
import {
  getBackupImportUndoConfirmationMessage,
  getBackupImportUndoResultMessage,
} from "../../shared/backup-import-policy";
import { formatConnectionFailureMessage } from "../../shared/user-facing-errors";
import {
  deriveConnectionEndpoints,
  hasCustomConnectionEndpoints,
  inferServerUrlFromApi,
} from "../../shared/connection-endpoints";

const props = defineProps<{
  sectionRequest?: { sectionId: string; nonce: number } | null;
}>();

const emit = defineEmits<{
  connectionDirtyChange: [dirty: boolean];
}>();

type SettingsSectionId =
  | "account-display"
  | "account-security"
  | "connection"
  | "window"
  | "data"
  | "sync-recovery"
  | "metadata";

type SettingsNavItem = {
  sectionId: SettingsSectionId;
  label: string;
  icon: Component;
};

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
const metadataNote = ref("");
const diagnosticsExportNote = ref("");
const syncRecoveryNote = ref("");
const serverUrlDraft = ref("");
const connectionNote = ref("");
const connectionNoteTone = ref<"success" | "error" | null>(null);
const connectionTesting = ref(false);
const advancedConnectionOpen = ref(false);
const advancedEndpointsEdited = ref(false);
const advancedConnectionManuallyRequested = ref(false);
const syncDiagnosticsOpen = ref(false);
const metadataOpen = ref(false);
const activeSettingsSection = ref<SettingsSectionId>("account-display");
const serverTaskMeta = ref<TaskMetaDto | null>(null);
const updateStatus = ref<UpdateStatus | null>(null);
const pendingBackupImport = ref<BackupImportPreview | null>(null);
const confirmBackupImport = ref(false);
const lastImportedBackupLocalIds = ref<string[]>([]);
let unsubscribeUpdateStatus: (() => void) | null = null;
let autoSaveTimer: number | undefined;
const savedConnection = reactive({
  serverUrl: "",
  baseUrl: "",
  wsUrl: "",
});
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
const connectionDraftDirty = computed(
  () =>
    normalizedConnectionValue(serverUrlDraft.value) !== savedConnection.serverUrl ||
    normalizedConnectionValue(settings.baseUrl) !== savedConnection.baseUrl ||
    normalizedConnectionValue(settings.wsUrl) !== savedConnection.wsUrl,
);
const clearLocalDataBlocked = computed(
  () =>
    syncStore.diagnostics.pendingQueueCount > 0 ||
    syncStore.diagnostics.exhaustedQueueCount > 0 ||
    syncStore.diagnostics.failedCount > 0 ||
    syncStore.diagnostics.conflictCount > 0,
);
const settingsNavItems = computed<SettingsNavItem[]>(() => [
  { sectionId: "account-display", label: settingsStore.t("settings.accountDisplay"), icon: UserRound },
  { sectionId: "account-security", label: settingsStore.t("settings.accountSecurity"), icon: ShieldCheck },
  { sectionId: "connection", label: settingsStore.t("settings.connection"), icon: Cable },
  { sectionId: "window", label: settingsStore.t("settings.window"), icon: Monitor },
  { sectionId: "data", label: settingsStore.t("settings.dataSession"), icon: Database },
  { sectionId: "sync-recovery", label: settingsStore.t("settings.syncRecoveryCenter"), icon: RefreshCw },
  { sectionId: "metadata", label: settingsStore.t("settings.metadata"), icon: Tags },
]);

function localizeText(zh: string, en: string): string {
  return settingsStore.language === "zh-CN" ? zh : en;
}

function showSettingsSection(sectionId: string): void {
  const target = settingsNavItems.value.find((item) => item.sectionId === sectionId);
  if (!target) return;
  activeSettingsSection.value = target.sectionId;
  if (target.sectionId === "metadata") metadataOpen.value = false;
}

watch(
  () => props.sectionRequest,
  (request) => {
    if (!request) return;
    showSettingsSection(request.sectionId);
    if (request.sectionId === "sync-recovery") syncDiagnosticsOpen.value = true;
  },
  { immediate: true },
);

watch(
  connectionDraftDirty,
  (dirty) => emit("connectionDirtyChange", dirty),
  { immediate: true },
);

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
  markConnectionSaved();
  const hasCustomEndpoints = hasCustomConnectionEndpoints(
    serverUrlDraft.value,
    settings.baseUrl,
    settings.wsUrl,
  );
  advancedEndpointsEdited.value = hasCustomEndpoints;
  advancedConnectionManuallyRequested.value = hasCustomEndpoints;
  advancedConnectionOpen.value = hasCustomEndpoints;
  updateStatus.value = await bridge().app.getUpdateStatus();
  unsubscribeUpdateStatus = bridge().app.onUpdateStatus((status) => {
    updateStatus.value = status;
  });
  await refreshLastImportUndoSummary();
  await syncStore.refreshDiagnostics();
  await refreshServerTaskMeta();
});

onBeforeUnmount(() => {
  emit("connectionDirtyChange", false);
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
  if (normalizedConnectionOrigin(baseUrl) !== normalizedConnectionOrigin(savedConnection.baseUrl)) {
    syncStore.stop();
  }
  Object.assign(settings, await bridge().app.setConnection(baseUrl.trim(), wsUrl.trim()));
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  markConnectionSaved();
  advancedEndpointsEdited.value = hasCustomConnectionEndpoints(
    serverUrlDraft.value,
    settings.baseUrl,
    settings.wsUrl,
  );
}

async function saveConnection(): Promise<void> {
  if (!applyServerUrl()) return;
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
    advancedEndpointsEdited.value = hasCustomConnectionEndpoints(
      serverUrlDraft.value,
      settings.baseUrl,
      settings.wsUrl,
    );
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
    advancedEndpointsEdited.value = hasCustomConnectionEndpoints(
      serverUrlDraft.value,
      settings.baseUrl,
      settings.wsUrl,
    );
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

function markConnectionSaved(): void {
  savedConnection.serverUrl = normalizedConnectionValue(serverUrlDraft.value);
  savedConnection.baseUrl = normalizedConnectionValue(settings.baseUrl);
  savedConnection.wsUrl = normalizedConnectionValue(settings.wsUrl);
}

function normalizedConnectionValue(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizedConnectionOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
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
  diagnosticsExportNote.value = "";
  if (!(await confirmDiagnosticsExport())) {
    diagnosticsExportNote.value = settingsStore.t("settings.diagnosticsExportCanceled");
    return;
  }
  const result = await bridge().task.exportDiagnostics();
  diagnosticsExportNote.value = result.canceled
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
  metadataNote.value = "";
  if (!(await confirmRenameTaskMeta("project", metaEdit.projectFrom, metaEdit.projectTo))) return;
  await taskStore.renameProject(metaEdit.projectFrom, metaEdit.projectTo);
  metadataNote.value = settingsStore.t("settings.projectRenamed");
}

async function renameTag(): Promise<void> {
  metadataNote.value = "";
  if (!(await confirmRenameTaskMeta("tag", metaEdit.tagFrom, metaEdit.tagTo))) return;
  await taskStore.renameTag(metaEdit.tagFrom, metaEdit.tagTo);
  metadataNote.value = settingsStore.t("settings.tagRenamed");
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
  await taskStore.load();
  await refreshServerTaskMeta();
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
  const connectionDraft = {
    serverUrl: serverUrlDraft.value,
    baseUrl: settings.baseUrl,
    wsUrl: settings.wsUrl,
  };
  const preserveConnectionDraft = connectionDraftDirty.value;
  Object.assign(settings, await bridge().app.getSettings());
  if (preserveConnectionDraft) {
    serverUrlDraft.value = connectionDraft.serverUrl;
    settings.baseUrl = connectionDraft.baseUrl;
    settings.wsUrl = connectionDraft.wsUrl;
  } else {
    serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
    markConnectionSaved();
  }
  await refreshLastImportUndoSummary();
  await syncStore.refreshDiagnostics();
  await refreshServerTaskMeta();
}

async function refreshServerTaskMeta(): Promise<void> {
  try {
    serverTaskMeta.value = await fetchTaskMeta(settings.displayTimeZone);
  } catch {
    serverTaskMeta.value = null;
  }
}

async function retryExhaustedQueue(): Promise<void> {
  syncRecoveryNote.value = "";
  await syncStore.retryExhaustedQueue();
  syncRecoveryNote.value = settingsStore.t("settings.retryExhaustedDone");
}
</script>

<template>
  <section class="view-shell settings-view">
    <header class="view-header">
      <div>
        <h1>{{ settingsStore.t("settings.title") }}</h1>
      </div>
      <p v-if="saved" class="save-note">{{ settingsStore.t("settings.autoSaved") }}</p>
    </header>

    <div class="settings-workspace">
      <nav class="settings-category-nav" :aria-label="settingsStore.t('settings.title')">
        <button
          v-for="item in settingsNavItems"
          :key="item.sectionId"
          type="button"
          :class="{ active: activeSettingsSection === item.sectionId }"
          :aria-current="activeSettingsSection === item.sectionId ? 'page' : undefined"
          @click="showSettingsSection(item.sectionId)"
        >
          <component :is="item.icon" :size="17" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="settings-content">
        <SettingsAccountDisplayPanel
          v-show="activeSettingsSection === 'account-display'"
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

        <SettingsAccountSecurityPanel
          v-show="activeSettingsSection === 'account-security'"
          id="settings-account-security"
          :current-device-id="settings.deviceId"
          :display-time-zone="settings.displayTimeZone"
        />

        <SettingsConnectionPanel
          v-show="activeSettingsSection === 'connection'"
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

        <SettingsWindowPanel
          v-show="activeSettingsSection === 'window'"
          id="settings-window"
          v-model:floating-visible-on-start="settings.floatingVisibleOnStart"
          v-model:floating-opacity="settings.floatingOpacity"
          @apply-floating-opacity="applyFloatingOpacity"
          @update:floating-visible-on-start="updateFloatingVisibleOnStart"
        />

        <section
          v-show="activeSettingsSection === 'data'"
          id="settings-data"
          class="settings-section settings-data"
        >
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
        </section>

        <SettingsSyncRecoveryPanel
          v-show="activeSettingsSection === 'sync-recovery'"
          id="settings-sync-recovery"
          v-model:diagnostics-open="syncDiagnosticsOpen"
          :device-id="settings.deviceId"
          :diagnostics="syncStore.diagnostics"
          :server-task-meta="serverTaskMeta"
          :note="syncRecoveryNote"
          :export-note="diagnosticsExportNote"
          :update-technical-detail="updateTechnicalDetail"
          @refresh="refreshDiagnostics"
          @retry="retryExhaustedQueue"
          @export-diagnostics="exportDiagnostics"
        />

        <SettingsMetadataPanel
          v-show="activeSettingsSection === 'metadata'"
          id="settings-metadata"
          v-model:open="metadataOpen"
          v-model:project-from="metaEdit.projectFrom"
          v-model:project-to="metaEdit.projectTo"
          v-model:tag-from="metaEdit.tagFrom"
          v-model:tag-to="metaEdit.tagTo"
          :projects="taskStore.projects"
          :tags="taskStore.tags"
          :note="metadataNote"
          @rename-project="renameProject"
          @rename-tag="renameTag"
        />
      </div>
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
