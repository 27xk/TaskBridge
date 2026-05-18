<script setup lang="ts">
import { ref } from "vue";

import type { AppLanguage } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";

const emit = defineEmits<{
  authenticated: [];
}>();

const auth = useAuthStore();
const settingsStore = useSettingsStore();
const mode = ref<"login" | "register">("login");
const username = ref("");
const email = ref("");
const password = ref("");

async function submit(): Promise<void> {
  if (mode.value === "login") {
    await auth.login(email.value || username.value, password.value);
  } else {
    await auth.register(username.value, email.value, password.value);
  }
  emit("authenticated");
}

function updateLanguage(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as AppLanguage;
  void settingsStore.setLanguage(value);
}

function authErrorText(error: string): string {
  if (error === "登录失败") return settingsStore.t("auth.loginFailed");
  if (error === "注册失败") return settingsStore.t("auth.registerFailed");
  return error;
}
</script>

<template>
  <main class="login-shell">
    <section class="login-panel">
      <div class="brand-block">
        <span class="brand-mark">TB</span>
        <div>
          <h1>TaskBridge</h1>
          <p>{{ settingsStore.t("auth.subtitle") }}</p>
        </div>
      </div>

      <label class="language-select">
        <span>{{ settingsStore.t("settings.language") }}</span>
        <select :value="settingsStore.language" @change="updateLanguage">
          <option value="zh-CN">{{ settingsStore.t("settings.languageZh") }}</option>
          <option value="en-US">{{ settingsStore.t("settings.languageEn") }}</option>
        </select>
      </label>

      <div class="segment-control" role="tablist" :aria-label="settingsStore.t('auth.mode')">
        <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">
          {{ settingsStore.t("auth.login") }}
        </button>
        <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'">
          {{ settingsStore.t("auth.register") }}
        </button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label v-if="mode === 'register'">
          <span>{{ settingsStore.t("auth.username") }}</span>
          <input v-model="username" type="text" required minlength="3" autocomplete="username" />
        </label>
        <label>
          <span>{{ mode === "login" ? settingsStore.t("auth.usernameOrEmail") : settingsStore.t("auth.email") }}</span>
          <input v-model="email" type="text" required autocomplete="email" />
        </label>
        <label>
          <span>{{ settingsStore.t("auth.password") }}</span>
          <input v-model="password" type="password" required minlength="8" autocomplete="current-password" />
        </label>

        <p v-if="auth.error" class="form-error">{{ authErrorText(auth.error) }}</p>
        <button class="primary-button" type="submit" :disabled="auth.loading">
          {{ auth.loading ? settingsStore.t("auth.processing") : mode === "login" ? settingsStore.t("auth.login") : settingsStore.t("auth.createAccount") }}
        </button>
      </form>
    </section>
  </main>
</template>
