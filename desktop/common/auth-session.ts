export interface AuthSessionTokens {
  accessToken: string;
  refreshToken: string;
  userId?: number;
}

export interface CapturedAuthSession {
  serverOrigin: string;
  refreshToken: string;
  userId: number | null;
  deviceId: string;
  key: string;
}

export interface TokenRefreshResult {
  access_token: string;
  refresh_token: string;
}

export type RefreshCommitDecision = "commit" | "already-applied" | "stale";

export function captureAuthSession(
  baseUrl: string,
  tokens: AuthSessionTokens,
  deviceId: string,
): CapturedAuthSession {
  const serverOrigin = normalizeHttpOrigin(baseUrl);
  const userId = normalizeUserId(tokens.userId);
  return {
    serverOrigin,
    refreshToken: tokens.refreshToken,
    userId,
    deviceId,
    key: `${serverOrigin}::user:${userId ?? "unknown"}::refresh:${tokens.refreshToken}`,
  };
}

export function classifyRefreshCommit(
  session: CapturedAuthSession,
  currentBaseUrl: string,
  currentTokens: AuthSessionTokens | null,
  result: TokenRefreshResult,
): RefreshCommitDecision {
  if (!sameServerAndUser(session, currentBaseUrl, currentTokens)) return "stale";
  if (currentTokens?.refreshToken === session.refreshToken) return "commit";
  if (
    currentTokens?.accessToken === result.access_token &&
    currentTokens.refreshToken === result.refresh_token
  ) {
    return "already-applied";
  }
  return "stale";
}

export function canInvalidateAuthSession(
  session: CapturedAuthSession,
  currentBaseUrl: string,
  currentTokens: AuthSessionTokens | null,
): boolean {
  return (
    sameServerAndUser(session, currentBaseUrl, currentTokens) &&
    currentTokens?.refreshToken === session.refreshToken
  );
}

function sameServerAndUser(
  session: CapturedAuthSession,
  currentBaseUrl: string,
  currentTokens: AuthSessionTokens | null,
): boolean {
  if (!currentTokens) return false;
  try {
    return (
      normalizeHttpOrigin(currentBaseUrl) === session.serverOrigin &&
      normalizeUserId(currentTokens.userId) === session.userId
    );
  } catch {
    return false;
  }
}

function normalizeHttpOrigin(baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use HTTP or HTTPS");
  }
  return url.origin;
}

function normalizeUserId(value: number | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}
