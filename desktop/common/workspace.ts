export const EPOCH_SYNC_TIME = "1970-01-01T00:00:00Z";

export interface WorkspaceCursorMigration {
  cursors: Record<string, string>;
  legacyWorkspaceKey: string;
  current: string;
}

export function normalizeServerOrigin(baseUrl: string): string {
  const value = baseUrl.trim();
  if (!value) throw new Error("Server URL is required");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use HTTP or HTTPS");
  }
  return url.origin;
}

export function createWorkspaceKey(baseUrl: string, userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Invalid workspace user ID");
  }
  return `${normalizeServerOrigin(baseUrl)}::user:${userId}`;
}

export function tryCreateWorkspaceKey(baseUrl: string, userId: number | null | undefined): string | null {
  if (typeof userId !== "number") return null;
  try {
    return createWorkspaceKey(baseUrl, userId);
  } catch {
    return null;
  }
}

export function workspaceDatabaseFileName(baseUrl: string, userId: number): string {
  const workspaceKey = createWorkspaceKey(baseUrl, userId);
  return `taskbridge-workspace-user-${userId}-${fnv1a64(workspaceKey)}.sqlite`;
}

export function migrateLegacyWorkspaceCursor(
  existingCursors: Readonly<Record<string, string>>,
  legacyCursor: string,
  legacyWorkspaceKey: string | undefined,
  workspaceKey: string,
): WorkspaceCursorMigration {
  const cursors = { ...existingCursors };
  const claimedWorkspaceKey = legacyWorkspaceKey?.trim() ?? "";
  if (isLegacyWorkspaceOwner(claimedWorkspaceKey, workspaceKey) && !cursors[workspaceKey]) {
    cursors[workspaceKey] = normalizeCursor(legacyCursor);
  }
  return {
    cursors,
    legacyWorkspaceKey: claimedWorkspaceKey,
    current: normalizeCursor(cursors[workspaceKey]),
  };
}

export function isLegacyWorkspaceOwner(
  claimedWorkspaceKey: string | null | undefined,
  workspaceKey: string,
): boolean {
  return Boolean(claimedWorkspaceKey?.trim()) && claimedWorkspaceKey?.trim() === workspaceKey;
}

export function shouldPreserveWorkspaceState(
  previousWorkspaceKey: string | null | undefined,
  nextWorkspaceKey: string | null | undefined,
): boolean {
  return Boolean(previousWorkspaceKey) && previousWorkspaceKey === nextWorkspaceKey;
}

function normalizeCursor(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : EPOCH_SYNC_TIME;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
