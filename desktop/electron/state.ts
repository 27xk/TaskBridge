import { app, safeStorage, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSystemTimeZone, normalizeTimeZone } from "../shared/quick-add-parser";

declare const __TASKBRIDGE_BASE_URL__: string;
declare const __TASKBRIDGE_WS_URL__: string;

const FALLBACK_BASE_URL = "http://192.168.10.30:8000/api/v1";
const FALLBACK_WS_URL = "ws://192.168.10.30:8000/ws/sync";
const DEFAULT_BASE_URL = normalizeEndpointDefault(__TASKBRIDGE_BASE_URL__, FALLBACK_BASE_URL, isHttpUrl);
const DEFAULT_WS_URL = normalizeEndpointDefault(__TASKBRIDGE_WS_URL__, FALLBACK_WS_URL, isWebSocketUrl);
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

export interface AppSettings {
  baseUrl: string;
  wsUrl: string;
  language: "zh-CN" | "en-US";
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
  baseUrl: string;
  wsUrl: string;
  language: "zh-CN" | "en-US";
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
}

class JsonSettingsStore<T extends object> {
  private readonly filePath = join(app.getPath("userData"), "config.json");
  private readonly defaults: T;
  private data: Partial<T>;

  constructor(defaults: T) {
    this.defaults = defaults;
    this.data = this.read();
  }

  get<Key extends keyof T>(key: Key): T[Key] {
    return (this.data[key] ?? this.defaults[key]) as T[Key];
  }

  set<Key extends keyof T>(key: Key, value: T[Key]): void {
    this.data[key] = value;
    this.write();
  }

  delete<Key extends keyof T>(key: Key): void {
    delete this.data[key];
    this.write();
  }

  private read(): Partial<T> {
    if (!existsSync(this.filePath)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Partial<T>
        : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    mkdirSync(app.getPath("userData"), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.filePath);
  }
}

export const settingsStore = new JsonSettingsStore<StoreSchema>({
  baseUrl: DEFAULT_BASE_URL,
  wsUrl: DEFAULT_WS_URL,
  language: "zh-CN",
  displayTimeZone: getSystemTimeZone(),
  lastSyncTime: "1970-01-01T00:00:00Z",
  autoStart: false,
  floatingOpacity: 0.96,
  floatingVisibleOnStart: true,
  floatingWidth: 320,
  floatingHeight: 460,
});

migrateNetworkSettings();

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
    language: normalizeLanguage(settingsStore.get("language")),
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
  settingsStore.set("networkSettingsDefaultBaseUrl", DEFAULT_BASE_URL);
  settingsStore.set("networkSettingsDefaultWsUrl", DEFAULT_WS_URL);
  settingsStore.delete("networkSettingsMigrated");
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
  if (!stored.startsWith("safe:")) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(5), "base64"));
  } catch {
    settingsStore.delete(key);
    return undefined;
  }
}

function setSecret(key: "accessToken" | "refreshToken", value: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value).toString("base64");
    settingsStore.set(key, `safe:${encrypted}`);
    return;
  }
  settingsStore.set(key, value);
}
