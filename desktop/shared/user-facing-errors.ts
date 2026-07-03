import type { AppLanguage } from "../src/i18n";

export function getUserFacingConnectionErrorDetail(error: unknown, language: AppLanguage = "zh-CN"): string {
  const normalized = normalizeErrorText(error);
  if (!normalized) {
    return genericConnectionFailure(language);
  }
  if (isServerUrlRequiredError(normalized)) {
    return language === "en-US"
      ? "Enter the server address."
      : "请输入服务器地址。";
  }
  if (isServerUrlFormatError(normalized)) {
    return language === "en-US"
      ? "The server address format is invalid. Use an address that starts with http:// or https://."
      : "服务器地址格式不正确，请填写以 http:// 或 https:// 开头的地址。";
  }
  if (isServerUnavailableError(normalized)) {
    return language === "en-US"
      ? "The server is temporarily unavailable. Try again later."
      : "服务器暂时不可用，请稍后重试。";
  }
  if (isNetworkConnectionError(normalized)) {
    return language === "en-US"
      ? "Cannot connect to the server. Check the server address, network, or whether the service is running."
      : "无法连接服务器，请检查服务器地址、网络或服务是否已启动。";
  }
  return genericConnectionFailure(language);
}

export function formatConnectionFailureMessage(
  error: unknown,
  prefix: string,
  language: AppLanguage = "zh-CN",
): string {
  return `${prefix}${getUserFacingConnectionErrorDetail(error, language)}`;
}

function normalizeErrorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim().toLowerCase();
  return String(error ?? "").trim().toLowerCase();
}

function isServerUrlFormatError(message: string): boolean {
  return message.includes("server url must start") || message.includes("invalid url") || message.includes("invalid server url");
}

function isServerUrlRequiredError(message: string): boolean {
  return message.includes("server_url_required") || message.includes("server url required");
}

function isServerUnavailableError(message: string): boolean {
  return /\b(500|502|503|504)\b/.test(message) || message.includes("server error") || message.includes("internal server error");
}

function isNetworkConnectionError(message: string): boolean {
  return [
    "aborterror",
    "aborted",
    "connection refused",
    "connection reset",
    "could not connect",
    "econnrefused",
    "enotfound",
    "etimedout",
    "failed to fetch",
    "fetch failed",
    "network",
    "timeout",
  ].some((fragment) => message.includes(fragment));
}

function genericConnectionFailure(language: AppLanguage): string {
  return language === "en-US"
    ? "Connection check failed. Check the server address or contact the server administrator."
    : "连接检查失败，请检查服务器地址，或联系服务器管理员。";
}
