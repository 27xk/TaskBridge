import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { getMe, login as loginApi, register as registerApi, type UserDto } from "../api/auth";
import { bridge } from "../db/sqlite";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<UserDto | null>(null);
  const authenticated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

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
      error.value = err instanceof Error ? err.message : "登录失败";
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function register(username: string, email: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const deviceId = await currentDeviceId();
      const response = await registerApi({ username, email, password, device_id: deviceId });
      authenticated.value = true;
      user.value = response.user;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "注册失败";
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

  return {
    user,
    loading,
    error,
    isAuthenticated,
    loadSession,
    login,
    register,
    logout,
  };
});
