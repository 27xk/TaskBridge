<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import { bridge } from "../db/sqlite";
import type { AppLanguage } from "../i18n";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { formatConnectionFailureMessage } from "../../shared/user-facing-errors";
import {
  deriveConnectionEndpoints,
  hasCustomConnectionEndpoints,
  inferServerUrlFromApi,
  isLoopbackServerUrl,
} from "../../shared/connection-endpoints";

const props = defineProps<{
  canContinueOffline: boolean;
  cachedTaskCount: number;
}>();

const emit = defineEmits<{
  authenticated: [];
  continueOffline: [];
}>();

const auth = useAuthStore();
const settingsStore = useSettingsStore();
const mode = ref<"login" | "register">("login");
const username = ref("");
const email = ref(auth.user?.username ?? "");
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
const submitting = ref(false);
const advancedConnectionOpen = ref(false);
const advancedEndpointsEdited = ref(false);
const advancedConnectionManuallyRequested = ref(false);
const deployDocsCopied = ref(false);
const deployDocsCopyFailed = ref(false);
const guideReferenceKind = ref<"localTrial" | "selfHost">("localTrial");
const localTrialGuideUrl =
  "https://github.com/27xk/TaskBridge/blob/main/docs/user-quick-start.md#%E6%B2%A1%E6%9C%89%E6%9C%8D%E5%8A%A1%E5%99%A8%E5%9C%B0%E5%9D%80";
const selfHostGuideUrl = "https://github.com/27xk/TaskBridge/blob/main/deploy/README.md";
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
const registrationConnectionHint = computed(() => settingsStore.t("auth.registrationConnectionHint"));
const guideReferenceCopiedMessage = computed(() =>
  settingsStore.t(guideReferenceKind.value === "selfHost" ? "auth.selfHostReferenceCopied" : "auth.localTrialReferenceCopied"),
);
const guideReferenceCopyFailedMessage = computed(() =>
  settingsStore.t(guideReferenceKind.value === "selfHost" ? "auth.selfHostReferenceCopyFailed" : "auth.localTrialReferenceCopyFailed"),
);
const cachedWorkspaceSummary = computed(() =>
  settingsStore
    .t(props.cachedTaskCount > 0 ? "auth.cachedWorkspaceSummary" : "auth.cachedWorkspaceEmpty")
    .replace("{count}", String(props.cachedTaskCount)),
);
onMounted(async () => {
  Object.assign(settings, await bridge().app.getSettings());
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  const hasCustomEndpoints = hasCustomConnectionEndpoints(
    serverUrlDraft.value,
    settings.baseUrl,
    settings.wsUrl,
  );
  advancedEndpointsEdited.value = hasCustomEndpoints;
  advancedConnectionManuallyRequested.value = hasCustomEndpoints;
  advancedConnectionOpen.value = hasCustomEndpoints;
  await auth.loadRegistrationStatus();
  if (registrationBlocked.value) {
    mode.value = "login";
  }
});

async function submit(): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const connectionReady = await testConnection();
    if (!connectionReady) return;
    if (mode.value === "login") {
      await auth.login(email.value || username.value, password.value);
    } else {
      await auth.register(username.value, email.value, password.value);
    }
    emit("authenticated");
  } catch {
    // The auth store exposes the user-facing error in the form.
  } finally {
    submitting.value = false;
  }
}

function updateLanguage(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as AppLanguage;
  void settingsStore.setLanguage(value);
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
  Object.assign(settings, await bridge().app.setConnection(baseUrl.trim(), wsUrl.trim()));
  serverUrlDraft.value = inferServerUrlFromApi(settings.baseUrl);
  advancedEndpointsEdited.value = hasCustomConnectionEndpoints(
    serverUrlDraft.value,
    settings.baseUrl,
    settings.wsUrl,
  );
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
  await copyGuideReference(localTrialReferenceText(), "localTrial");
}

async function copySelfHostDocsReference(): Promise<void> {
  await copyGuideReference(selfHostReferenceText(), "selfHost");
}

async function copyGuideReference(reference: string, kind: "localTrial" | "selfHost"): Promise<void> {
  guideReferenceKind.value = kind;
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

async function openSelfHostGuide(): Promise<void> {
  deployDocsCopied.value = false;
  deployDocsCopyFailed.value = false;
  try {
    await bridge().app.openExternal(selfHostGuideUrl);
  } catch {
    await copySelfHostDocsReference();
  }
}

function localTrialReferenceText(): string {
  if (settingsStore.language === "en-US") {
    return [
      "TaskBridge local trial",
      "If you are using someone else's TaskBridge service, ask the administrator or deployer for the server address first.",
      "Prepare the TaskBridge source or deployment package on the backend computer.",
      "Start the service from the deployment guide, then use http://127.0.0.1:8080 on the same computer.",
      "From a phone or another computer, use port 8080 on the server computer's LAN IP.",
    ].join("\n");
  }
  return [
    "TaskBridge 本机试用",
    "如果你只是使用别人部署好的 TaskBridge，请先向管理员或部署者索取服务器地址。",
    "在后端电脑准备 TaskBridge 源码/部署包。",
    "按部署说明启动服务后，同一台电脑填写 http://127.0.0.1:8080。",
    "手机或另一台电脑访问时，填写服务电脑的局域网 IP 和 8080 端口。",
  ].join("\n");
}

function selfHostReferenceText(): string {
  if (settingsStore.language === "en-US") {
    return [
      "TaskBridge self-hosting",
      "Use this only if you are the person deploying the TaskBridge service.",
      "Open the deployment guide: https://github.com/27xk/TaskBridge/blob/main/deploy/README.md",
      "Prepare a server address, strong secrets, and the allowed Web origin before signing in from clients.",
    ].join("\n");
  }
  return [
    "TaskBridge 自托管",
    "只有你负责部署 TaskBridge 服务时才需要阅读这部分。",
    "打开部署说明：https://github.com/27xk/TaskBridge/blob/main/deploy/README.md",
    "请先准备服务器地址、强密码和允许访问的 Web 来源，再回到客户端登录。",
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
    connectionNote.value = settingsStore.t("settings.apiConnectionReady");
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

function continueOffline(): void {
  emit("continueOffline");
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

      <form class="auth-form auth-main-form" @submit.prevent="submit">
        <p v-if="auth.sessionExpired" class="form-error" role="alert" aria-live="assertive">
          {{ settingsStore.t(auth.sessionExpiredReason === "server-changed" ? "auth.serverChangedRelogin" : "auth.sessionExpired") }}
        </p>
        <section v-if="canContinueOffline" class="cached-workspace-choice" aria-labelledby="cached-workspace-title">
          <div>
            <strong id="cached-workspace-title">{{ settingsStore.t("auth.cachedWorkspaceTitle") }}</strong>
            <p>{{ cachedWorkspaceSummary }}</p>
          </div>
          <button class="secondary-button" type="button" @click="continueOffline">
            {{ settingsStore.t("auth.continueOffline") }}
          </button>
        </section>
        <label>
          <span>{{ settingsStore.t("settings.serverUrl") }}</span>
          <input
            v-model.trim="serverUrlDraft"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            @change="applyServerUrl"
          />
          <small>{{ settingsStore.t("settings.serverUrlHint") }}</small>
          <small v-if="serverLocalhostHint" class="form-message form-message-info">{{ serverLocalhostHint }}</small>
        </label>
        <p class="form-message form-message-info">{{ registrationConnectionHint }}</p>

        <div class="segment-control" role="group" :aria-label="settingsStore.t('auth.mode')">
          <button
            type="button"
            :aria-pressed="mode === 'login'"
            :class="{ active: mode === 'login' }"
            @click="selectAuthMode('login')"
          >
            {{ settingsStore.t("auth.login") }}
          </button>
          <button
            type="button"
            :aria-pressed="mode === 'register'"
            :class="{ active: mode === 'register' }"
            :disabled="registrationBlocked"
            :title="registrationBlocked || !auth.registrationStatusKnown ? registrationUnavailableText : ''"
            @click="selectAuthMode('register')"
          >
            {{ settingsStore.t("auth.register") }}
          </button>
        </div>
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

        <p v-if="auth.error" class="form-error" role="alert" aria-live="assertive">{{ authErrorText(auth.error) }}</p>
        <button class="primary-button" type="submit" :disabled="submitting || auth.loading">
          {{ submitting || auth.loading ? settingsStore.t("auth.processing") : mode === "login" ? settingsStore.t("auth.login") : settingsStore.t("auth.createAccount") }}
        </button>
        <div class="connection-secondary-actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="submitting || connectionTesting"
            @click="checkAndSaveConnection"
          >
            {{ connectionTesting ? settingsStore.t("settings.connectionTesting") : settingsStore.t("settings.checkAndSaveConnection") }}
          </button>
          <small>{{ settingsStore.t("settings.loginAutoChecksConnection") }}</small>
          <p
            v-if="connectionNote"
            :class="['form-message', connectionNoteTone === 'success' ? 'form-message-success' : 'form-message-error']"
            :role="connectionNoteTone === 'error' ? 'alert' : 'status'"
            :aria-live="connectionNoteTone === 'error' ? 'assertive' : 'polite'"
          >
            {{ connectionNote }}
          </p>
          <button v-if="!showAdvancedConnectionEntry" class="text-button" type="button" @click="showAdvancedConnection">
            {{ settingsStore.t("settings.showAdvancedConnection") }}
          </button>
          <details v-if="showAdvancedConnectionEntry" :open="advancedConnectionOpen" class="first-use-details" @toggle="setAdvancedConnectionOpen">
            <summary>{{ settingsStore.t("settings.advancedEndpoints") }}</summary>
            <label>
              <span>{{ settingsStore.t("settings.baseUrl") }}</span>
              <input
                v-model.trim="settings.baseUrl"
                type="text"
                inputmode="url"
                autocomplete="off"
                spellcheck="false"
                @change="syncServerUrlFromAdvanced"
              />
              <small>{{ settingsStore.t("settings.baseUrlHint") }}</small>
            </label>
            <label>
              <span>{{ settingsStore.t("settings.wsUrl") }}</span>
              <input
                v-model.trim="settings.wsUrl"
                type="text"
                inputmode="url"
                autocomplete="off"
                spellcheck="false"
                @change="markAdvancedEndpointEdited"
              />
              <small>{{ settingsStore.t("settings.wsUrlHint") }}</small>
            </label>
            <button class="secondary-button" type="button" @click="resetGeneratedConnectionEndpoints">
              {{ settingsStore.t("settings.resetGeneratedEndpoints") }}
            </button>
          </details>
        </div>
      </form>

      <details class="first-use-guide first-use-guide-collapsed">
        <summary>{{ settingsStore.t("auth.noServerHelpSummary") }}</summary>
        <div class="first-use-guide-body" :aria-label="settingsStore.t('auth.firstUseTitle')">
          <strong>{{ settingsStore.t("auth.firstUseTitle") }}</strong>
          <span>{{ settingsStore.t("auth.firstUseHint") }}</span>
          <span>{{ settingsStore.t("auth.noServerHelpBody") }}</span>
          <div class="first-use-guide-actions">
            <button class="secondary-button" type="button" @click="openLocalTrialGuide">
              {{ settingsStore.t("auth.openLocalTrialGuide") }}
            </button>
            <button class="text-button" type="button" @click="openSelfHostGuide">
              {{ settingsStore.t("auth.openSelfHostGuide") }}
            </button>
            <button class="text-button deploy-docs-copy-button" type="button" @click="copyDeployDocsReference">
              {{ settingsStore.t("auth.copyLocalTrialReference") }}
            </button>
          </div>
          <small v-if="deployDocsCopied" class="form-message form-message-success">
            {{ guideReferenceCopiedMessage }}
          </small>
          <small v-if="deployDocsCopyFailed" class="form-message form-message-error">
            {{ guideReferenceCopyFailedMessage }}
          </small>
        </div>
      </details>
    </section>
  </main>
</template>
