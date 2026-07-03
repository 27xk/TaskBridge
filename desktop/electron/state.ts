import { app, safeStorage, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_DESKTOP_THEME,
  normalizeDesktopTheme,
  type DesktopThemeId,
} from "../shared/desktop-theme";
import { getSystemTimeZone, normalizeTimeZone } from "../shared/quick-add-parser";

declare const __TASKBRIDGE_BASE_URL__: string;
declare const __TASKBRIDGE_WS_URL__: string;

const FALLBACK_BASE_URL = "http://127.0.0.1:8000/api/v1";
const FALLBACK_WS_URL = "ws://127.0.0.1:8000/ws/sync";
const DEFAULT_BASE_URL = normalizeEndpointDefault(__TASKBRIDGE_BASE_URL__, FALLBACK_BASE_URL, isHttpUrl);
const DEFAULT_WS_URL = normalizeEndpointDefault(__TASKBRIDGE_WS_URL__, FALLBACK_WS_URL, isWebSocketUrl);
const CURRENT_SETTINGS_SCHEMA_VERSION = 2;
const LEGACY_BASE_URLS = new Set([
  FALLBACK_BASE_URL,
  `${FALLBACK_BASE_URL}/`,
  "http://127.0.0.1:8000/api/v1",
  "http://127.0.0.1:8000/api/v1/",
  "http://localhost:8000/api/v1",
  "http://localhost:8000/api/v1/",
  "http://10.0.2.2:8000/api/v1",
  "http://10.0.2.2:8000/api/v1/",
]);
const LEGACY_WS_URLS = new Set([
  FALLBACK_WS_URL,
  "ws://127.0.0.1:8000/ws/sync",
  "ws://localhost:8000/ws/sync",
  "ws://10.0.2.2:8000/ws/sync",
]);

export interface TokenState {
  accessToken: string;
  refreshToken: string;
  userId?: number;
}

export interface BackupImportUndoItem {
  localId: string;
  importedUpdatedAt: string;
}

export interface AppSettings {
  baseUrl: string;
  wsUrl: string;
  currentUserId: number | null;
  language: "zh-CN" | "en-US";
  desktopTheme: DesktopThemeId;
  displayTimeZone: string;
  deviceId: string;
  lastSyncTime: string;
  autoStart: boolean;
  floatingOpacity: number;
  floatingVisibleOnStart: boolean;
  floatingX: number | null;
  floatingY: number | null;
  floatingWidth: number;
  floatingHeight: number;
}

export interface StoreSchema {
  accessToken?: string;
  refreshToken?: string;
  currentUserId?: number;
  settingsSchemaVersion?: number;
  baseUrl: string;
  wsUrl: string;
  language: "zh-CN" | "en-US";
  desktopTheme: DesktopThemeId;
  displayTimeZone: string;
  displayTimeZoneByUser?: Record<string, string>;
  networkSettingsMigrated?: boolean;
  networkSettingsDefaultBaseUrl?: string;
  networkSettingsDefaultWsUrl?: string;
  deviceId?: string;
  lastSyncTime: string;
  autoStart: boolean;
  floatingOpacity: number;
  floatingVisibleOnStart: boolean;
  floatingX?: number;
  floatingY?: number;
  floatingWidth?: number;
  floatingHeight?: number;
  lastBackupImportUndoItems?: BackupImportUndoItem[];
}

class JsonSettingsStore<T extends object> {
  private readonly filePath = join(app.getPath("userData"), "config.json");
  private readonly defaults: T;
  private data: Partial<T>;
  private recoveryNotice: string | null = null;

  constructor(defaults: T) {
    this.defaults = defaults;
    this.data = this.read();
  }

  get<Key extends keyof T>(key: Key): T[Key] {
    return (this.data[key] ?? this.defaults[key]) as T[Key];
  }

  set<Key extends keyof T>(key: Key, value: T[Key]): void {
    if (sameSettingValue(this.get(key), value)) return;
    this.data[key] = value;
    this.write();
  }

  setMany(values: Partial<T>): void {
    let changed = false;
    const nextData = { ...this.data };
    for (const [key, value] of Object.entries(values) as Array<[keyof T, T[keyof T]]>) {
      if (sameSettingValue(this.get(key), value)) continue;
      nextData[key] = value;
      changed = true;
    }
    if (!changed) return;
    this.data = nextData;
    this.write();
  }

  delete<Key extends keyof T>(key: Key): void {
    if (!(key in this.data)) return;
    delete this.data[key];
    this.write();
  }

  private read(): Partial<T> {
    if (!existsSync(this.filePath)) return {};
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Partial<T>;
      }
      this.backupInvalidFile();
      return {};
    } catch {
      this.backupInvalidFile();
      return {};
    }
  }

  private write(): void {
    mkdirSync(app.getPath("userData"), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.filePath);
  }

  private backupInvalidFile(): void {
    if (!existsSync(this.filePath)) return;
    const backupPath = `${this.filePath}.invalid-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      copyFileSync(this.filePath, backupPath);
      this.recoveryNotice = backupPath;
    } catch {
      // Keep startup resilient even if the backup cannot be written.
    }
  }

  consumeRecoveryNotice(): string | null {
    const notice = this.recoveryNotice;
    this.recoveryNotice = null;
    return notice;
  }
}

export const settingsStore = new JsonSettingsStore<StoreSchema>({
  baseUrl: DEFAULT_BASE_URL,
  wsUrl: DEFAULT_WS_URL,
  language: "zh-CN",
  desktopTheme: DEFAULT_DESKTOP_THEME,
  displayTimeZone: getSystemTimeZone(),
  lastSyncTime: "1970-01-01T00:00:00Z",
  autoStart: false,
  floatingOpacity: 0.96,
  floatingVisibleOnStart: true,
  floatingWidth: 320,
  floatingHeight: 460,
});

migrateNetworkSettings();
normalizeStoredSettings();

export function getLastBackupImportUndoItems(): BackupImportUndoItem[] {
  return normalizeBackupImportUndoItems(settingsStore.get("lastBackupImportUndoItems") ?? []);
}

export function getLastBackupImportUndoSummary(): { count: number; localIds: string[] } {
  const items = getLastBackupImportUndoItems();
  return {
    count: items.length,
    localIds: items.map((item) => item.localId),
  };
}

export function setLastBackupImportUndoItems(items: BackupImportUndoItem[]): { count: number; localIds: string[] } {
  const normalizedItems = normalizeBackupImportUndoItems(items);
  if (normalizedItems.length === 0) {
    clearLastBackupImportUndoItems();
    return { count: 0, localIds: [] };
  }
  settingsStore.set("lastBackupImportUndoItems", normalizedItems);
  return {
    count: normalizedItems.length,
    localIds: normalizedItems.map((item) => item.localId),
  };
}

export function clearLastBackupImportUndoItems(): void {
  settingsStore.delete("lastBackupImportUndoItems");
}

export interface WindowRegistry {
  mainWindow: BrowserWindow | null;
  floatingWindow: BrowserWindow | null;
  isQuitting: boolean;
}

export const windows: WindowRegistry = {
  mainWindow: null,
  floatingWindow: null,
  isQuitting: false,
};

export function getTokens(): TokenState | null {
  const accessToken = getSecret("accessToken");
  const refreshToken = getSecret("refreshToken");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function hasTokens(): boolean {
  return getTokens() !== null;
}

export function setTokens(tokens: TokenState): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure token storage is unavailable");
  }
  setSecret("accessToken", tokens.accessToken);
  setSecret("refreshToken", tokens.refreshToken);
  if (typeof tokens.userId === "number" && Number.isFinite(tokens.userId)) {
    settingsStore.set("currentUserId", tokens.userId);
  }
}

export function clearTokens(): void {
  settingsStore.delete("accessToken");
  settingsStore.delete("refreshToken");
  settingsStore.delete("currentUserId");
}

export function getDeviceId(): string {
  let deviceId = settingsStore.get("deviceId");
  if (!deviceId) {
    deviceId = `windows-${randomUUID()}`;
    settingsStore.set("deviceId", deviceId);
  }
  return deviceId;
}

export function setSetting<Key extends keyof AppSettings>(
  key: Key,
  value: AppSettings[Key],
): AppSettings {
  if (key === "desktopTheme") {
    settingsStore.set("desktopTheme", normalizeDesktopTheme(value));
    return getSettings();
  }
  if (key === "displayTimeZone") {
    setDisplayTimeZone(value as string);
    return getSettings();
  }
  if (value === null) {
    settingsStore.delete(key as keyof StoreSchema);
  } else {
    const nextValue =
      typeof value === "string" && (key === "baseUrl" || key === "wsUrl")
        ? value.trim()
        : value;
    settingsStore.set(key as keyof StoreSchema, nextValue as StoreSchema[keyof StoreSchema]);
  }
  return getSettings();
}

export function getSettings(): AppSettings {
  const floatingX = settingsStore.get("floatingX");
  const floatingY = settingsStore.get("floatingY");
  const currentUserId = settingsStore.get("currentUserId");
  const userTimeZones = settingsStore.get("displayTimeZoneByUser") ?? {};
  const displayTimeZone =
    typeof currentUserId === "number"
      ? userTimeZones[String(currentUserId)] ?? settingsStore.get("displayTimeZone")
      : settingsStore.get("displayTimeZone");
  return {
    baseUrl: settingsStore.get("baseUrl"),
    wsUrl: settingsStore.get("wsUrl"),
    currentUserId: typeof currentUserId === "number" ? currentUserId : null,
    language: normalizeLanguage(settingsStore.get("language")),
    desktopTheme: normalizeDesktopTheme(settingsStore.get("desktopTheme")),
    displayTimeZone: normalizeTimeZone(displayTimeZone),
    deviceId: getDeviceId(),
    lastSyncTime: settingsStore.get("lastSyncTime"),
    autoStart: settingsStore.get("autoStart"),
    floatingOpacity: normalizeFloatingOpacity(settingsStore.get("floatingOpacity")),
    floatingVisibleOnStart: settingsStore.get("floatingVisibleOnStart"),
    floatingX: typeof floatingX === "number" ? floatingX : null,
    floatingY: typeof floatingY === "number" ? floatingY : null,
    floatingWidth: normalizeFloatingWidth(settingsStore.get("floatingWidth")),
    floatingHeight: normalizeFloatingHeight(settingsStore.get("floatingHeight")),
  };
}

export function consumeSettingsRecoveryNotice(): string | null {
  return settingsStore.consumeRecoveryNotice();
}

function setDisplayTimeZone(timeZoneId: string): void {
  const normalized = normalizeTimeZone(timeZoneId);
  const currentUserId = settingsStore.get("currentUserId");
  if (typeof currentUserId !== "number") {
    settingsStore.set("displayTimeZone", normalized);
    return;
  }
  settingsStore.set("displayTimeZoneByUser", {
    ...(settingsStore.get("displayTimeZoneByUser") ?? {}),
    [String(currentUserId)]: normalized,
  });
}

function normalizeBackupImportUndoItems(value: unknown): BackupImportUndoItem[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Map(
      value
        .map((item) => ({
          localId: typeof item?.localId === "string" ? item.localId.trim() : "",
          importedUpdatedAt: typeof item?.importedUpdatedAt === "string" ? item.importedUpdatedAt.trim() : "",
        }))
        .filter((item) => item.localId && item.importedUpdatedAt)
        .map((item) => [item.localId, item]),
    ).values(),
  );
}

function normalizeLanguage(language: unknown): "zh-CN" | "en-US" {
  return language === "en-US" ? "en-US" : "zh-CN";
}

function migrateNetworkSettings(): void {
  migrateStringSetting(
    "baseUrl",
    DEFAULT_BASE_URL,
    buildLegacyEndpointSet(LEGACY_BASE_URLS, settingsStore.get("networkSettingsDefaultBaseUrl")),
    isHttpUrl,
  );
  migrateStringSetting(
    "wsUrl",
    DEFAULT_WS_URL,
    buildLegacyEndpointSet(LEGACY_WS_URLS, settingsStore.get("networkSettingsDefaultWsUrl")),
    isWebSocketUrl,
  );
  settingsStore.setMany({
    networkSettingsDefaultBaseUrl: DEFAULT_BASE_URL,
    networkSettingsDefaultWsUrl: DEFAULT_WS_URL,
  });
  settingsStore.delete("networkSettingsMigrated");
}

function normalizeStoredSettings(): void {
  settingsStore.setMany({
    settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    language: normalizeLanguage(settingsStore.get("language")),
    desktopTheme: normalizeDesktopTheme(settingsStore.get("desktopTheme")),
    displayTimeZone: normalizeTimeZone(settingsStore.get("displayTimeZone")),
    floatingOpacity: normalizeFloatingOpacity(settingsStore.get("floatingOpacity")),
    floatingWidth: normalizeFloatingWidth(settingsStore.get("floatingWidth")),
    floatingHeight: normalizeFloatingHeight(settingsStore.get("floatingHeight")),
  });
}

function migrateStringSetting(
  key: "baseUrl" | "wsUrl",
  fallback: string,
  legacyValues: Set<string>,
  isValid: (value: string) => boolean,
): void {
  const stored = settingsStore.get(key);
  const normalized = typeof stored === "string" ? stored.trim() : "";
  if (!normalized || legacyValues.has(normalized) || !isValid(normalized)) {
    settingsStore.set(key, fallback);
    return;
  }
  if (normalized !== stored) {
    settingsStore.set(key, normalized);
  }
}

function normalizeEndpointDefault(
  value: unknown,
  fallback: string,
  isValid: (value: string) => boolean,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && isValid(normalized) ? normalized : fallback;
}

function buildLegacyEndpointSet(legacyValues: Set<string>, previousDefault: unknown): Set<string> {
  const values = new Set(legacyValues);
  if (typeof previousDefault !== "string") return values;
  const normalized = previousDefault.trim();
  if (!normalized) return values;
  values.add(normalized);
  values.add(normalized.replace(/\/+$/, ""));
  return values;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "ws:" || url.protocol === "wss:";
  } catch {
    return false;
  }
}

export function getFloatingOpacity(): number {
  return normalizeFloatingOpacity(settingsStore.get("floatingOpacity"));
}

export function setFloatingOpacity(opacity: number): number {
  const normalized = normalizeFloatingOpacity(opacity);
  settingsStore.set("floatingOpacity", normalized);
  return normalized;
}

export function getFloatingPosition(): { x: number | null; y: number | null } {
  const x = settingsStore.get("floatingX");
  const y = settingsStore.get("floatingY");
  return {
    x: typeof x === "number" ? x : null,
    y: typeof y === "number" ? y : null,
  };
}

export function saveFloatingPosition(x: number, y: number): void {
  settingsStore.set("floatingX", Math.round(x));
  settingsStore.set("floatingY", Math.round(y));
}

export function getFloatingSize(): { width: number; height: number } {
  return {
    width: normalizeFloatingWidth(settingsStore.get("floatingWidth")),
    height: normalizeFloatingHeight(settingsStore.get("floatingHeight")),
  };
}

export function saveFloatingSize(width: number, height: number): { width: number; height: number } {
  const next = {
    width: normalizeFloatingWidth(width),
    height: normalizeFloatingHeight(height),
  };
  settingsStore.set("floatingWidth", next.width);
  settingsStore.set("floatingHeight", next.height);
  return next;
}

function normalizeFloatingOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 0.96;
  return Math.min(1, Math.max(0.45, Number(opacity.toFixed(2))));
}

function normalizeFloatingWidth(width: unknown): number {
  return normalizeDimension(width, 320, 280, 520);
}

function normalizeFloatingHeight(height: unknown): number {
  return normalizeDimension(height, 460, 260, 720);
}

function normalizeDimension(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(max, Math.max(min, value)));
}

function getSecret(key: "accessToken" | "refreshToken"): string | undefined {
  const stored = settingsStore.get(key);
  if (!stored) return undefined;
  if (!stored.startsWith("safe:")) {
    return migrateLegacyPlaintextSecret(key, stored);
  }
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(5), "base64"));
  } catch {
    settingsStore.delete(key);
    return undefined;
  }
}

function migrateLegacyPlaintextSecret(
  key: "accessToken" | "refreshToken",
  value: string,
): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) {
    settingsStore.delete(key);
    return undefined;
  }
  try {
    setSecret(key, value);
    return value;
  } catch {
    settingsStore.delete(key);
    return undefined;
  }
}

function setSecret(key: "accessToken" | "refreshToken", value: string): void {
  const encrypted = safeStorage.encryptString(value).toString("base64");
  settingsStore.set(key, `safe:${encrypted}`);
}

function sameSettingValue(current: unknown, next: unknown): boolean {
  if (Object.is(current, next)) return true;
  if (isComparableObject(current) && isComparableObject(next)) {
    return JSON.stringify(current) === JSON.stringify(next);
  }
  return false;
}

function isComparableObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
