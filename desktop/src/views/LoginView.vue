<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import { bridge } from "../db/sqlite";
import type { AppLanguage } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { formatConnectionFailureMessage } from "../../shared/user-facing-errors";

const emit = defineEmits<{
  authenticated: [];
}>();

const auth = useAuthStore();
const settingsStore = useSettingsStore();
const mode = ref<"login" | "register">("login");
const username = ref("");
const email = ref("");
const password = ref("");
const passwordVisible = ref(false);
const serverUrlDraft = ref("");
const settings = reactive({
  baseUrl: "",
  wsUrl: "",
});
const connectionNote = ref("");
const connectionNoteTone = ref<"success" | "error" | null>(null);
const connectionTesting = ref(false);
const advancedConnectionOpen = ref(false);
const advancedEndpointsEdited = ref(false);
const advancedConnectionManuallyRequested = ref(false);
const deployDocsCopied = ref(false);
const deployDocsCopyFailed = ref(false);
const localTrialGuideUrl =
  "https://github.com/27xk/TaskBridge#%E6%99%AE%E9%80%9A%E7%94%A8%E6%88%B7%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B";
const serverLocalhostHint = computed(() => (isLoopbackServerUrl(serverUrlDraft.value) ? settingsStore.t("settings.localhostHint") : ""));
const showAdvancedConnectionEntry = computed(
  () => advancedConnectionManuallyRequested.value || advancedConnectionOpen.value || advancedEndpointsEdited.value || connectionNoteTone.value === "error",
);
const registrationBlocked = computed(() => auth.registrationStatusKnown && !auth.registrationEnabled);
const passwordInputType = computed(() => (passwordVisible.value ? "text" : "password"));
const passwordToggleLabel = computed(() =>
  settingsStore.t(passwordVisible.value ? "auth.hidePassword" : "auth.showPassword"),
);
const registrationUnavailableText = computed(() =>
  registrationBlocked.value ? settingsStore.t("auth.registrationClosed") : settingsStore.t("auth.registrationUnknown"),
);
onMounted(async () => {
  Object.assign(settings, await bridge().app.getSettings());
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  await auth.loadRegistrationStatus();
  if (registrationBlocked.value) {
    mode.value = "login";
  }
});

async function submit(): Promise<void> {
  const connectionReady = await testConnection();
  if (!connectionReady) return;
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

function deriveConnectionEndpoints(serverUrl: string): { serverUrl: string; baseUrl: string; wsUrl: string } {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const url = new URL(normalizedServerUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    serverUrl: normalizedServerUrl,
    baseUrl: `${normalizedServerUrl}/api/v1`,
    wsUrl: `${wsProtocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}/ws/sync`,
  };
}

async function saveConnection(): Promise<void> {
  let baseUrl = settings.baseUrl;
  let wsUrl = settings.wsUrl;
  if (!advancedEndpointsEdited.value) {
    const endpoints = deriveConnectionEndpoints(serverUrlDraft.value);
    serverUrlDraft.value = endpoints.serverUrl;
    baseUrl = endpoints.baseUrl;
    wsUrl = endpoints.wsUrl;
  }
  Object.assign(settings, await bridge().app.setSetting("baseUrl", baseUrl.trim()));
  Object.assign(settings, await bridge().app.setSetting("wsUrl", wsUrl.trim()));
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  advancedEndpointsEdited.value = false;
}

function applyServerUrl(): boolean {
  try {
    const endpoints = deriveConnectionEndpoints(serverUrlDraft.value);
    serverUrlDraft.value = endpoints.serverUrl;
    settings.baseUrl = endpoints.baseUrl;
    settings.wsUrl = endpoints.wsUrl;
    advancedEndpointsEdited.value = false;
    connectionNote.value = "";
    connectionNoteTone.value = null;
    return true;
  } catch (error) {
    connectionNote.value = formatConnectionFailureMessage(
      error,
      settingsStore.t("settings.connectionFailed"),
      settingsStore.language,
    );
    connectionNoteTone.value = "error";
    return false;
  }
}

function syncServerUrlFromAdvanced(): void {
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  markAdvancedEndpointEdited();
}

function markAdvancedEndpointEdited(): void {
  advancedConnectionManuallyRequested.value = true;
  advancedEndpointsEdited.value = true;
  connectionNote.value = "";
  connectionNoteTone.value = null;
}

function resetGeneratedConnectionEndpoints(): void {
  void applyServerUrl();
}

function setAdvancedConnectionOpen(event: Event): void {
  advancedConnectionOpen.value = (event.currentTarget as HTMLDetailsElement).open;
  if (advancedConnectionOpen.value) {
    advancedConnectionManuallyRequested.value = true;
  }
}

function showAdvancedConnection(): void {
  advancedConnectionManuallyRequested.value = true;
  advancedConnectionOpen.value = true;
}

async function copyDeployDocsReference(): Promise<void> {
  const reference = localTrialReferenceText();
  deployDocsCopied.value = false;
  deployDocsCopyFailed.value = false;
  try {
    await navigator.clipboard.writeText(reference);
    deployDocsCopied.value = true;
    window.setTimeout(() => {
      deployDocsCopied.value = false;
    }, 1800);
  } catch {
    deployDocsCopyFailed.value = true;
  }
}

async function openLocalTrialGuide(): Promise<void> {
  deployDocsCopied.value = false;
  deployDocsCopyFailed.value = false;
  try {
    await bridge().app.openExternal(localTrialGuideUrl);
  } catch {
    await copyDeployDocsReference();
  }
}

function localTrialReferenceText(): string {
  if (settingsStore.language === "en-US") {
    return [
      "TaskBridge local trial",
      "Prepare the TaskBridge source or deployment package on the backend computer.",
      "Start the backend from the deployment guide, then keep http://127.0.0.1:8000 on the same computer.",
      "From a phone or another computer, use the backend computer's LAN IP instead.",
    ].join("\n");
  }
  return [
    "TaskBridge 本机试用",
    "在后端电脑准备 TaskBridge 源码/部署包。",
    "按部署说明启动后端后，同一台电脑保持 http://127.0.0.1:8000。",
    "手机或另一台电脑访问时，填写后端电脑的局域网 IP。",
  ].join("\n");
}

async function testConnection(): Promise<boolean> {
  connectionTesting.value = true;
  connectionNote.value = "";
  connectionNoteTone.value = null;
  try {
    await saveConnection();
    await bridge().api.request({ method: "GET", url: "/sync/status" });
    await auth.loadRegistrationStatus();
    if (registrationBlocked.value) {
      mode.value = "login";
    }
    connectionNote.value = settingsStore.t("settings.connectionReady");
    connectionNoteTone.value = "success";
    return true;
  } catch (error) {
    connectionNote.value = formatConnectionFailureMessage(
      error,
      settingsStore.t("settings.connectionFailed"),
      settingsStore.language,
    );
    connectionNoteTone.value = "error";
    return false;
  } finally {
    connectionTesting.value = false;
  }
}

async function checkAndSaveConnection(): Promise<void> {
  await testConnection();
}

async function ensureRegistrationModeAvailable(): Promise<boolean> {
  if (auth.registrationStatusKnown && auth.registrationEnabled) {
    return true;
  }
  if (registrationBlocked.value) {
    return false;
  }
  await testConnection();
  return auth.registrationStatusKnown && auth.registrationEnabled;
}

async function selectAuthMode(nextMode: "login" | "register"): Promise<void> {
  if (nextMode === "register" && !(await ensureRegistrationModeAvailable())) {
    return;
  }
  mode.value = nextMode;
  passwordVisible.value = false;
}

function togglePasswordVisibility(): void {
  passwordVisible.value = !passwordVisible.value;
}

function normalizeServerUrl(value: string): string {
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

function inferServerUrlFromApi(apiUrl: string): string {
  try {
    return normalizeServerUrl(apiUrl);
  } catch {
    return "http://127.0.0.1:8000";
  }
}

function isLoopbackServerUrl(value: string): boolean {
  try {
    const url = new URL(normalizeServerUrl(value));
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function authErrorText(error: string): string {
  if (error === "登录失败") return settingsStore.t("auth.loginFailed");
  if (error === "注册失败") return settingsStore.t("auth.registerFailed");
  if (error === "network_error") return settingsStore.t("auth.networkError");
  if (error === "server_error") return settingsStore.t("auth.serverError");
  if (error === "registration unknown") return settingsStore.t("auth.registrationUnknown");
  if (error === "registration disabled") return settingsStore.t("auth.registrationClosed");
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

      <div class="first-use-guide" :aria-label="settingsStore.t('auth.firstUseTitle')">
        <strong>{{ settingsStore.t("auth.firstUseTitle") }}</strong>
        <span>{{ settingsStore.t("auth.firstUseHint") }}</span>
        <details class="first-use-details">
          <summary>{{ settingsStore.t("auth.noServerHelpSummary") }}</summary>
          <span>{{ settingsStore.t("auth.noServerHelpBody") }}</span>
          <button class="primary-button" type="button" @click="openLocalTrialGuide">
            {{ settingsStore.t("auth.openLocalTrialGuide") }}
          </button>
          <button class="text-button deploy-docs-copy-button" type="button" @click="copyDeployDocsReference">
            {{ settingsStore.t("auth.copyLocalTrialReference") }}
          </button>
          <small v-if="deployDocsCopied" class="form-message form-message-success">
            {{ settingsStore.t("auth.localTrialReferenceCopied") }}
          </small>
          <small v-if="deployDocsCopyFailed" class="form-message form-message-error">
            {{ settingsStore.t("auth.localTrialReferenceCopyFailed") }}
          </small>
        </details>
      </div>

      <div class="auth-form login-connection">
        <label>
          <span>{{ settingsStore.t("settings.serverUrl") }}</span>
          <input v-model.trim="serverUrlDraft" type="url" autocomplete="off" spellcheck="false" @change="applyServerUrl" />
          <small>{{ settingsStore.t("settings.serverUrlHint") }}</small>
          <small v-if="serverLocalhostHint" class="form-message form-message-info">{{ serverLocalhostHint }}</small>
        </label>
        <button v-if="!showAdvancedConnectionEntry" class="text-button" type="button" @click="showAdvancedConnection">
          {{ settingsStore.t("settings.showAdvancedConnection") }}
        </button>
        <details v-if="showAdvancedConnectionEntry" :open="advancedConnectionOpen" class="first-use-details" @toggle="setAdvancedConnectionOpen">
          <summary>{{ settingsStore.t("settings.advancedEndpoints") }}</summary>
          <label>
            <span>{{ settingsStore.t("settings.baseUrl") }}</span>
            <input v-model.trim="settings.baseUrl" type="url" autocomplete="off" spellcheck="false" @change="syncServerUrlFromAdvanced" />
            <small>{{ settingsStore.t("settings.baseUrlHint") }}</small>
          </label>
          <label>
            <span>{{ settingsStore.t("settings.wsUrl") }}</span>
            <input v-model.trim="settings.wsUrl" type="url" autocomplete="off" spellcheck="false" @change="markAdvancedEndpointEdited" />
            <small>{{ settingsStore.t("settings.wsUrlHint") }}</small>
          </label>
          <button class="secondary-button" type="button" @click="resetGeneratedConnectionEndpoints">
            {{ settingsStore.t("settings.resetGeneratedEndpoints") }}
          </button>
        </details>
        <button
          class="secondary-button"
          type="button"
          :disabled="connectionTesting"
          @click="checkAndSaveConnection"
        >
          {{ connectionTesting ? settingsStore.t("settings.connectionTesting") : settingsStore.t("settings.checkAndSaveConnection") }}
        </button>
        <small>{{ settingsStore.t("settings.loginAutoChecksConnection") }}</small>
        <p
          v-if="connectionNote"
          :class="['form-message', connectionNoteTone === 'success' ? 'form-message-success' : 'form-message-error']"
        >
          {{ connectionNote }}
        </p>
      </div>

      <div class="segment-control" role="tablist" :aria-label="settingsStore.t('auth.mode')">
        <button type="button" :class="{ active: mode === 'login' }" @click="selectAuthMode('login')">
          {{ settingsStore.t("auth.login") }}
        </button>
        <button
          type="button"
          :class="{ active: mode === 'register' }"
          :disabled="registrationBlocked"
          :title="registrationBlocked || !auth.registrationStatusKnown ? registrationUnavailableText : ''"
          @click="selectAuthMode('register')"
        >
          {{ settingsStore.t("auth.register") }}
        </button>
      </div>
      <p v-if="registrationBlocked || !auth.registrationStatusKnown" class="form-error">{{ registrationUnavailableText }}</p>

      <form class="auth-form" @submit.prevent="submit">
        <label v-if="mode === 'register'">
          <span>{{ settingsStore.t("auth.username") }}</span>
          <input v-model="username" type="text" required minlength="3" autocomplete="username" />
        </label>
        <label>
          <span>{{ mode === "login" ? settingsStore.t("auth.usernameOrEmail") : settingsStore.t("auth.email") }}</span>
          <input v-model="email" :type="mode === 'register' ? 'email' : 'text'" required autocomplete="email" />
        </label>
        <label>
          <span>{{ settingsStore.t("auth.password") }}</span>
          <div class="password-field">
            <input
              v-model="password"
              :type="passwordInputType"
              required
              :minlength="mode === 'register' ? 8 : 1"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            />
            <button
              class="password-toggle-button text-button"
              type="button"
              :aria-label="passwordToggleLabel"
              :aria-pressed="passwordVisible"
              @click="togglePasswordVisibility"
            >
              {{ passwordToggleLabel }}
            </button>
          </div>
        </label>

        <p v-if="auth.error" class="form-error">{{ authErrorText(auth.error) }}</p>
        <button class="primary-button" type="submit" :disabled="auth.loading">
          {{ auth.loading ? settingsStore.t("auth.processing") : mode === "login" ? settingsStore.t("auth.login") : settingsStore.t("auth.createAccount") }}
        </button>
      </form>
    </section>
  </main>
</template>
