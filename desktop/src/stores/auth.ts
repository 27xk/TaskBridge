import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  getMe,
  getRegistrationStatus,
  login as loginApi,
  register as registerApi,
  type UserDto,
} from "../api/auth";
import { bridge } from "../db/sqlite";
import { tryCreateWorkspaceKey } from "../../shared/workspace";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<UserDto | null>(null);
  const authenticated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const registrationEnabled = ref(false);
  const registrationStatusKnown = ref(false);
  const sessionExpired = ref(false);
  const sessionExpiredReason = ref<"refresh-rejected" | "server-changed" | null>(null);
  const workspaceKey = ref<string | null>(null);

  const isAuthenticated = computed(() => authenticated.value);

  async function loadSession(): Promise<void> {
    const settings = await bridge().app.getSettings();
    if (!settings.baseUrl.trim() || !settings.wsUrl.trim()) {
      authenticated.value = false;
      user.value = null;
      workspaceKey.value = null;
      sessionExpired.value = false;
      sessionExpiredReason.value = null;
      return;
    }
    const cachedWorkspaceKey = tryCreateWorkspaceKey(settings.baseUrl, settings.currentUserId);
    authenticated.value = await bridge().auth.hasTokens();
    if (!authenticated.value) {
      user.value = null;
      if (cachedWorkspaceKey) {
        sessionExpired.value = true;
        sessionExpiredReason.value = "refresh-rejected";
        workspaceKey.value = cachedWorkspaceKey;
      } else {
        sessionExpired.value = false;
        sessionExpiredReason.value = null;
        workspaceKey.value = null;
      }
      return;
    }
    workspaceKey.value = cachedWorkspaceKey;
    if (!workspaceKey.value) {
      await bridge().auth.clearTokens();
      authenticated.value = false;
      user.value = null;
      return;
    }
    sessionExpired.value = false;
    sessionExpiredReason.value = null;
    try {
      user.value = await getMe();
    } catch {
      authenticated.value = await bridge().auth.hasTokens();
      if (!authenticated.value) {
        sessionExpired.value = true;
        sessionExpiredReason.value = "refresh-rejected";
        workspaceKey.value = cachedWorkspaceKey;
      }
    }
  }

  async function login(usernameOrEmail: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const deviceId = await currentDeviceId();
      const response = await loginApi({
        username_or_email: usernameOrEmail,
        password,
        device_id: deviceId,
      });
      workspaceKey.value = await resolveWorkspaceKey(response.user.id);
      user.value = response.user;
      authenticated.value = true;
      sessionExpired.value = false;
      sessionExpiredReason.value = null;
    } catch (err) {
      error.value = normalizeAuthErrorMessage(err, "登录失败");
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function register(username: string, email: string, password: string): Promise<void> {
    if (!registrationStatusKnown.value) {
      error.value = "registration unknown";
      throw new Error("registration unknown");
    }
    if (!registrationEnabled.value) {
      error.value = "registration disabled";
      throw new Error("registration disabled");
    }
    loading.value = true;
    error.value = null;
    try {
      const deviceId = await currentDeviceId();
      const response = await registerApi({ username, email, password, device_id: deviceId });
      workspaceKey.value = await resolveWorkspaceKey(response.user.id);
      user.value = response.user;
      authenticated.value = true;
      sessionExpired.value = false;
      sessionExpiredReason.value = null;
    } catch (err) {
      error.value = normalizeAuthErrorMessage(err, "注册失败");
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function currentDeviceId(): Promise<string> {
    const settings = await bridge().app.getSettings();
    return settings.deviceId;
  }

  async function resolveWorkspaceKey(userId: number): Promise<string> {
    const settings = await bridge().app.getSettings();
    const key = tryCreateWorkspaceKey(settings.baseUrl, userId);
    if (!key) {
      await bridge().auth.clearTokens();
      throw new Error("Authenticated workspace is unavailable");
    }
    return key;
  }

  async function logout(): Promise<void> {
    authenticated.value = false;
    user.value = null;
    sessionExpired.value = false;
    sessionExpiredReason.value = null;
    workspaceKey.value = null;
    await bridge().auth.clearTokens();
  }

  function expireSession(reason: "refresh-rejected" | "server-changed"): void {
    authenticated.value = false;
    loading.value = false;
    error.value = null;
    sessionExpired.value = true;
    sessionExpiredReason.value = reason;
  }

  async function loadRegistrationStatus(): Promise<void> {
    try {
      const status = await getRegistrationStatus();
      registrationEnabled.value = status.registration_enabled;
      registrationStatusKnown.value = true;
    } catch {
      registrationEnabled.value = false;
      registrationStatusKnown.value = false;
    }
  }

  return {
    user,
    loading,
    error,
    registrationEnabled,
    registrationStatusKnown,
    sessionExpired,
    sessionExpiredReason,
    workspaceKey,
    isAuthenticated,
    loadSession,
    loadRegistrationStatus,
    login,
    register,
    logout,
    expireSession,
  };
});

function normalizeAuthErrorMessage(error: unknown, fallback: "登录失败" | "注册失败"): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (normalized.includes("registration disabled") || normalized.includes("open registration is disabled")) {
    return "registration disabled";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound") ||
    normalized.includes("timeout") ||
    normalized.includes("socket") ||
    normalized.includes("connect")
  ) {
    return "network_error";
  }
  if (
    normalized.includes("500") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("internal server error") ||
    normalized.includes("server error")
  ) {
    return "server_error";
  }
  return fallback;
}
