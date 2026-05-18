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
    if (!authenticated.value) return;
    try {
      user.value = await getMe();
    } catch {
      await logout();
    }
  }

  async function login(usernameOrEmail: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await loginApi({
        username_or_email: usernameOrEmail,
        password,
      });
      await persistTokens(response.access_token, response.refresh_token, response.user.id);
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
      const response = await registerApi({ username, email, password });
      await persistTokens(response.access_token, response.refresh_token, response.user.id);
      user.value = response.user;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "注册失败";
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function persistTokens(accessToken: string, refreshToken: string, userId?: number): Promise<void> {
    await bridge().auth.setTokens({ accessToken, refreshToken, userId });
    authenticated.value = true;
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
