import { broadcastSessionExpired, expireTokens, getSettings, getTokens, setTokens } from "./state";
import { setTraySyncStatus } from "./tray";
import {
  canInvalidateAuthSession,
  captureAuthSession,
  classifyRefreshCommit,
  type CapturedAuthSession,
} from "../shared/auth-session";

export interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface ApiRequestPayload {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  data?: unknown;
  params?: Record<string, unknown>;
}

class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

type TokenRefreshResponse = {
  access_token: string;
  refresh_token: string;
};

const ALLOWED_API_PATH_PREFIXES = [
  "/auth/",
  "/devices",
  "/devices/",
  "/tasks",
  "/tasks/",
  "/sync/",
] as const;

const refreshFlights = new Map<string, Promise<TokenRefreshResponse>>();

class StaleAuthSessionError extends Error {
  constructor() {
    super("Authentication session changed while refreshing");
    this.name = "StaleAuthSessionError";
  }
}

function isInvalidRefreshTokenError(error: unknown): boolean {
  return error instanceof ApiHttpError && (error.status === 401 || error.status === 403);
}

export async function performApiRequest<T = unknown>(
  payload: ApiRequestPayload,
): Promise<ApiEnvelope<T>> {
  const safePath = normalizeApiPath(payload.url);
  let tokens = getTokens();
  const initialSettings = getSettings();
  const refreshSession = tokens?.refreshToken
    ? captureAuthSession(initialSettings.baseUrl, tokens, initialSettings.deviceId)
    : null;

  try {
    const response = await sendApiRequest<T>(payload, safePath, tokens?.accessToken);
    persistAuthTokensFromResponse(safePath, response as ApiEnvelope<unknown>);
    return response;
  } catch (error) {
    if (!(error instanceof ApiHttpError) || error.status !== 401 || !tokens?.refreshToken) {
      throw error;
    }
  }

  try {
    if (!refreshSession) throw new StaleAuthSessionError();
    const refreshed = await refreshTokenOnce(refreshSession);
    commitRefreshResult(refreshSession, refreshed);
    tokens = getTokens();
    return await sendApiRequest<T>(payload, safePath, tokens?.accessToken);
  } catch (refreshError) {
    if (
      refreshSession &&
      isInvalidRefreshTokenError(refreshError) &&
      canInvalidateAuthSession(refreshSession, getSettings().baseUrl, getTokens())
    ) {
      expireTokens();
      setTraySyncStatus("signed-out");
      broadcastSessionExpired("refresh-rejected");
    }
    throw refreshError;
  }
}

function refreshTokenOnce(session: CapturedAuthSession): Promise<TokenRefreshResponse> {
  const existing = refreshFlights.get(session.key);
  if (existing) return existing;
  const request = refreshToken(session).finally(() => {
    if (refreshFlights.get(session.key) === request) {
      refreshFlights.delete(session.key);
    }
  });
  refreshFlights.set(session.key, request);
  return request;
}

function commitRefreshResult(
  session: CapturedAuthSession,
  refreshed: TokenRefreshResponse,
): void {
  const decision = classifyRefreshCommit(
    session,
    getSettings().baseUrl,
    getTokens(),
    refreshed,
  );
  if (decision === "stale") throw new StaleAuthSessionError();
  if (decision === "already-applied") return;
  setTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    userId: session.userId ?? undefined,
  });
}

function persistAuthTokensFromResponse(path: string, response: ApiEnvelope<unknown>): void {
  if (path !== "/auth/login" && path !== "/auth/register") return;
  const data = response.data;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid auth response");
  }
  const authData = data as {
    access_token?: unknown;
    refresh_token?: unknown;
    user?: { id?: unknown };
  };
  if (typeof authData.access_token !== "string" || typeof authData.refresh_token !== "string") {
    throw new Error("Invalid auth response");
  }
  const userId = typeof authData.user?.id === "number" && Number.isFinite(authData.user.id)
    ? authData.user.id
    : undefined;
  setTokens({
    accessToken: authData.access_token,
    refreshToken: authData.refresh_token,
    userId,
  });
}

async function sendApiRequest<T>(
  payload: ApiRequestPayload,
  safePath: string,
  accessToken?: string,
): Promise<ApiEnvelope<T>> {
  const settings = getSettings();
  return requestJson<T>(settings.baseUrl, safePath, {
    method: payload.method,
    data: payload.data,
    params: payload.params,
    accessToken,
  });
}

async function refreshToken(session: CapturedAuthSession): Promise<TokenRefreshResponse> {
  const response = await requestJson<{ access_token: string; refresh_token: string }>(
    session.serverOrigin,
    "/auth/refresh",
    {
      method: "POST",
      data: { refresh_token: session.refreshToken, device_id: session.deviceId },
    },
  );
  return response.data;
}

function normalizeApiPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Only relative API paths are allowed");
  }
  if (path.includes("?") || path.includes("#")) {
    throw new Error("API query strings must be passed via params");
  }
  assertAllowedApiPath(path);
  const normalizedPath = new URL(path, "https://taskbridge.local").pathname;
  if (normalizedPath !== path) {
    throw new Error("Invalid API path");
  }
  return normalizedPath;
}

function assertAllowedApiPath(path: string): void {
  const allowed = ALLOWED_API_PATH_PREFIXES.some((prefix) => {
    return prefix.endsWith("/")
      ? path.startsWith(prefix)
      : path === prefix || path.startsWith(`${prefix}/`);
  });
  if (!allowed) {
    throw new Error("API path is not allowed");
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: {
    method: ApiRequestPayload["method"];
    data?: unknown;
    params?: Record<string, unknown>;
    accessToken?: string;
  },
): Promise<ApiEnvelope<T>> {
  const url = buildUrl(baseUrl, path, options.params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: buildHeaders(options.accessToken, options.data),
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok) {
      throw new ApiHttpError(response.status, body?.message ?? `HTTP ${response.status}`);
    }
    if (!body || typeof body !== "object") {
      throw new Error("Invalid API response");
    }
    return body;
  } catch (error) {
    if (error instanceof ApiHttpError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`API request failed: ${url} (${reason})`);
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, unknown>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function buildHeaders(accessToken?: string, data?: unknown): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (data !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}
