import { safeStorage, type BrowserWindow } from "electron";
import Store from "electron-store";
import { randomUUID } from "node:crypto";

export interface TokenState {
  accessToken: string;
  refreshToken: string;
}

export interface AppSettings {
  baseUrl: string;
  wsUrl: string;
  deviceId: string;
  lastSyncTime: string;
  autoStart: boolean;
  floatingOpacity: number;
  floatingVisibleOnStart: boolean;
  floatingMiniMode: boolean;
  floatingX: number | null;
  floatingY: number | null;
}

export interface StoreSchema {
  accessToken?: string;
  refreshToken?: string;
  baseUrl: string;
  wsUrl: string;
  deviceId?: string;
  lastSyncTime: string;
  autoStart: boolean;
  floatingOpacity: number;
  floatingVisibleOnStart: boolean;
  floatingMiniMode: boolean;
  floatingX?: number;
  floatingY?: number;
}

export const settingsStore = new Store<StoreSchema>({
  defaults: {
    baseUrl: "http://127.0.0.1:8000/api/v1",
    wsUrl: "ws://127.0.0.1:8000/ws/sync",
    lastSyncTime: "1970-01-01T00:00:00Z",
    autoStart: false,
    floatingOpacity: 0.96,
    floatingVisibleOnStart: true,
    floatingMiniMode: false,
  },
});

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
}

export function clearTokens(): void {
  settingsStore.delete("accessToken");
  settingsStore.delete("refreshToken");
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
  if (value === null) {
    settingsStore.delete(key as keyof StoreSchema);
  } else {
    settingsStore.set(key as keyof StoreSchema, value as StoreSchema[keyof StoreSchema]);
  }
  return getSettings();
}

export function getSettings(): AppSettings {
  const floatingX = settingsStore.get("floatingX");
  const floatingY = settingsStore.get("floatingY");
  return {
    baseUrl: settingsStore.get("baseUrl"),
    wsUrl: settingsStore.get("wsUrl"),
    deviceId: getDeviceId(),
    lastSyncTime: settingsStore.get("lastSyncTime"),
    autoStart: settingsStore.get("autoStart"),
    floatingOpacity: normalizeFloatingOpacity(settingsStore.get("floatingOpacity")),
    floatingVisibleOnStart: settingsStore.get("floatingVisibleOnStart"),
    floatingMiniMode: settingsStore.get("floatingMiniMode"),
    floatingX: typeof floatingX === "number" ? floatingX : null,
    floatingY: typeof floatingY === "number" ? floatingY : null,
  };
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

function normalizeFloatingOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 0.96;
  return Math.min(1, Math.max(0.45, Number(opacity.toFixed(2))));
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
