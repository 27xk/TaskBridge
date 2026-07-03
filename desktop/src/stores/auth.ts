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

export const useAuthStore = defineStore("auth", () => {
  const user = ref<UserDto | null>(null);
  const authenticated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const registrationEnabled = ref(false);
  const registrationStatusKnown = ref(false);

  const isAuthenticated = computed(() => authenticated.value);

  async function loadSession(): Promise<void> {
    authenticated.value = await bridge().auth.hasTokens();
    if (!authenticated.value) {
      user.value = null;
      return;
    }
    try {
      user.value = await getMe();
    } catch {
      authenticated.value = await bridge().auth.hasTokens();
      if (!authenticated.value) {
        user.value = null;
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
      authenticated.value = true;
      user.value = response.user;
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
      authenticated.value = true;
      user.value = response.user;
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

  async function logout(): Promise<void> {
    authenticated.value = false;
    user.value = null;
    await bridge().auth.clearTokens();
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
    isAuthenticated,
    loadSession,
    loadRegistrationStatus,
    login,
    register,
    logout,
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
