export type SyncStatus =
  | "signed-out"
  | "offline"
  | "syncing"
  | "error"
  | "disconnected"
  | "connected"
  | "synced"
  | "unknown";

const STATUS_ALIASES: Record<string, SyncStatus> = {
  "signed-out": "signed-out",
  unauthenticated: "signed-out",
  "not signed in": "signed-out",
  未登录: "signed-out",
  offline: "offline",
  离线: "offline",
  syncing: "syncing",
  同步中: "syncing",
  error: "error",
  "sync error": "error",
  同步异常: "error",
  disconnected: "disconnected",
  waiting: "disconnected",
  等待连接: "disconnected",
  connected: "connected",
  实时连接: "connected",
  synced: "synced",
  idle: "synced",
  已同步: "synced",
};

const STATUS_LABELS: Record<Exclude<SyncStatus, "unknown">, [string, string]> = {
  "signed-out": ["未登录", "Not signed in"],
  offline: ["离线", "Offline"],
  syncing: ["同步中", "Syncing"],
  error: ["同步异常", "Sync error"],
  disconnected: ["等待连接", "Waiting"],
  connected: ["实时连接", "Connected"],
  synced: ["已同步", "Synced"],
};

export function normalizeSyncStatus(status: unknown): SyncStatus {
  if (typeof status !== "string") return "unknown";
  const token = status.trim().toLowerCase().replace(/^ws\s*:\s*/, "");
  return Object.hasOwn(STATUS_ALIASES, token) ? STATUS_ALIASES[token] : "unknown";
}

export function formatSyncStatus(status: unknown, language = "zh-CN"): string {
  const normalized = normalizeSyncStatus(status);
  if (normalized === "unknown") {
    return (typeof status === "string" && status.trim()) || (language === "en-US" ? "Unknown" : "状态未知");
  }
  return STATUS_LABELS[normalized][language === "en-US" ? 1 : 0];
}
