import { bridge } from "../db/sqlite";

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface RequestConfig {
  params?: Record<string, unknown>;
}

type ApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export const request = {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<{ data: ApiEnvelope<T> }> {
    return send<T>("GET", url, undefined, config);
  },
  post<T = unknown>(url: string, data?: unknown): Promise<{ data: ApiEnvelope<T> }> {
    return send<T>("POST", url, data);
  },
  put<T = unknown>(url: string, data?: unknown): Promise<{ data: ApiEnvelope<T> }> {
    return send<T>("PUT", url, data);
  },
  delete<T = unknown>(url: string): Promise<{ data: ApiEnvelope<T> }> {
    return send<T>("DELETE", url);
  },
};

export async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  const response = await promise;
  if (response.data.code !== 0) {
    throw new Error(response.data.message || "Request failed");
  }
  return response.data.data;
}

async function send<T>(
  method: ApiMethod,
  url: string,
  data?: unknown,
  config?: RequestConfig,
): Promise<{ data: ApiEnvelope<T> }> {
  const envelope = await bridge().api.request<T>({
    method,
    url,
    data,
    params: config?.params,
  });
  return { data: envelope };
}
