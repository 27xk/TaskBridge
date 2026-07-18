export interface ConnectionEndpoints {
  serverUrl: string;
  baseUrl: string;
  wsUrl: string;
}

export function normalizeServerUrl(value: string): string {
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

export function deriveConnectionEndpoints(serverUrl: string): ConnectionEndpoints {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const url = new URL(normalizedServerUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    serverUrl: normalizedServerUrl,
    baseUrl: `${normalizedServerUrl}/api/v1`,
    wsUrl: `${wsProtocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}/ws/sync`,
  };
}

export function inferServerUrlFromApi(apiUrl: string): string {
  try {
    return normalizeServerUrl(apiUrl);
  } catch {
    return "";
  }
}

export function hasCustomConnectionEndpoints(serverUrl: string, baseUrl: string, wsUrl: string): boolean {
  if (!baseUrl.trim() && !wsUrl.trim()) return false;
  try {
    const generated = deriveConnectionEndpoints(serverUrl);
    return !sameEndpoint(generated.baseUrl, baseUrl) || !sameEndpoint(generated.wsUrl, wsUrl);
  } catch {
    return true;
  }
}

export function isLoopbackServerUrl(value: string): boolean {
  try {
    const url = new URL(normalizeServerUrl(value));
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function sameEndpoint(left: string, right: string): boolean {
  return left.trim().replace(/\/+$/, "") === right.trim().replace(/\/+$/, "");
}
