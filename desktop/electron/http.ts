import { clearTokens, getSettings, getTokens, setTokens } from "./state";

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

export async function performApiRequest<T = unknown>(
  payload: ApiRequestPayload,
): Promise<ApiEnvelope<T>> {
  const safePath = normalizeApiPath(payload.url);
  let tokens = getTokens();

  try {
    return await sendApiRequest<T>(payload, safePath, tokens?.accessToken);
  } catch (error) {
    if (!(error instanceof ApiHttpError) || error.status !== 401 || !tokens?.refreshToken) {
      throw error;
    }
  }

  try {
    const refreshed = await refreshToken(tokens.refreshToken);
    setTokens({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
    });
    tokens = getTokens();
    return await sendApiRequest<T>(payload, safePath, tokens?.accessToken);
  } catch (refreshError) {
    clearTokens();
    throw refreshError;
  }
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

async function refreshToken(refreshTokenValue: string): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const settings = getSettings();
  const response = await requestJson<{ access_token: string; refresh_token: string }>(
    settings.baseUrl,
    "/auth/refresh",
    {
      method: "POST",
      data: { refresh_token: refreshTokenValue },
    },
  );
  return response.data;
}

function normalizeApiPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Only relative API paths are allowed");
  }
  return path;
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
