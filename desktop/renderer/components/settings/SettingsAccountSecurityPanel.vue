<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import {
  changePassword,
  listSessions,
  revokeOtherSessions as revokeOtherSessionsApi,
  revokeSession as revokeSessionApi,
  type RefreshSessionDto,
} from "../../api/auth";
import { useConfirmDialog } from "../../composables/useConfirmDialog";
import { useAuthStore } from "../../stores/auth";
import { useSettingsStore } from "../../stores/settings";
import ConfirmDialog from "../ConfirmDialog.vue";

const props = defineProps<{
  currentDeviceId: string;
  displayTimeZone: string;
}>();

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const sessions = ref<RefreshSessionDto[]>([]);
const loadingSessions = ref(false);
const sessionActionId = ref<number | "others" | null>(null);
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const changingPassword = ref(false);
const feedback = ref("");
const feedbackTone = ref<"success" | "error" | null>(null);
const {
  confirmDialog,
  requestConfirmation,
  confirmRequestedAction,
  cancelRequestedAction,
} = useConfirmDialog(() => settingsStore.language);

const canChangePassword = computed(
  () =>
    currentPassword.value.length > 0 &&
    newPassword.value.length >= 8 &&
    newPassword.value === confirmPassword.value &&
    !changingPassword.value,
);

onMounted(() => {
  void refreshSessions();
});

async function refreshSessions(): Promise<void> {
  if (loadingSessions.value) return;
  loadingSessions.value = true;
  try {
    sessions.value = await listSessions();
  } catch (error) {
    showError(error, "settings.sessionsLoadFailed");
  } finally {
    loadingSessions.value = false;
  }
}

async function submitPasswordChange(): Promise<void> {
  if (changingPassword.value) return;
  if (newPassword.value !== confirmPassword.value) {
    showMessage(settingsStore.t("settings.passwordMismatch"), "error");
    return;
  }
  if (!canChangePassword.value) return;
  changingPassword.value = true;
  clearFeedback();
  try {
    const result = await changePassword({
      current_password: currentPassword.value,
      new_password: newPassword.value,
    });
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
    showMessage(
      settingsStore.t("settings.passwordChanged").replace("{count}", String(result.revoked)),
      "success",
    );
    await refreshSessions();
  } catch (error) {
    showError(error, "settings.passwordChangeFailed");
  } finally {
    changingPassword.value = false;
  }
}

async function revokeSession(session: RefreshSessionDto): Promise<void> {
  if (sessionActionId.value !== null) return;
  const confirmed = await requestConfirmation({
    message: settingsStore.t("settings.revokeSessionConfirm"),
    confirmText: settingsStore.t("settings.revokeSession"),
    danger: true,
  });
  if (!confirmed) return;
  sessionActionId.value = session.id;
  clearFeedback();
  try {
    await revokeSessionApi(session.id);
    sessions.value = sessions.value.filter((item) => item.id !== session.id);
    showMessage(settingsStore.t("settings.sessionRevoked"), "success");
  } catch (error) {
    showError(error, "settings.sessionRevokeFailed");
  } finally {
    sessionActionId.value = null;
  }
}

async function revokeOtherSessions(): Promise<void> {
  if (sessionActionId.value !== null) return;
  const confirmed = await requestConfirmation({
    message: settingsStore.t("settings.revokeOtherSessionsConfirm"),
    confirmText: settingsStore.t("settings.revokeOtherSessions"),
    danger: true,
  });
  if (!confirmed) return;
  sessionActionId.value = "others";
  clearFeedback();
  try {
    const result = await revokeOtherSessionsApi(props.currentDeviceId);
    showMessage(
      settingsStore.t("settings.otherSessionsRevoked").replace("{count}", String(result.revoked)),
      "success",
    );
    await refreshSessions();
  } catch (error) {
    showError(error, "settings.sessionRevokeFailed");
  } finally {
    sessionActionId.value = null;
  }
}

function sessionDeviceLabel(session: RefreshSessionDto): string {
  if (!session.device_id) return settingsStore.t("settings.unknownDevice");
  if (session.device_id === props.currentDeviceId) {
    return `${settingsStore.t("settings.thisDevice")} (${maskDeviceId(session.device_id)})`;
  }
  return maskDeviceId(session.device_id);
}

function maskDeviceId(deviceId: string): string {
  if (deviceId.length <= 16) return deviceId;
  return `${deviceId.slice(0, 8)}...${deviceId.slice(-6)}`;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(settingsStore.language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: props.displayTimeZone,
    }).format(date);
  } catch {
    return date.toLocaleString(settingsStore.language);
  }
}

function showError(error: unknown, fallbackKey: Parameters<typeof settingsStore.t>[0]): void {
  const message = error instanceof Error ? error.message.trim() : "";
  showMessage(message || settingsStore.t(fallbackKey), "error");
}

function showMessage(message: string, tone: "success" | "error"): void {
  feedback.value = message;
  feedbackTone.value = tone;
}

function clearFeedback(): void {
  feedback.value = "";
  feedbackTone.value = null;
}
</script>

<template>
  <section class="settings-section settings-account-security">
    <div class="settings-section-heading-row">
      <div>
        <h2>{{ settingsStore.t("settings.accountSecurity") }}</h2>
        <p class="settings-sensitive-note">
          {{ authStore.user?.username }}<template v-if="authStore.user?.email"> · {{ authStore.user.email }}</template>
        </p>
      </div>
      <button class="secondary-button" type="button" :disabled="loadingSessions" @click="refreshSessions">
        {{ settingsStore.t("settings.refreshSessions") }}
      </button>
    </div>

    <form class="settings-password-form" @submit.prevent="submitPasswordChange">
      <h3>{{ settingsStore.t("settings.changePassword") }}</h3>
      <div class="settings-grid">
        <label>
          <span>{{ settingsStore.t("settings.currentPassword") }}</span>
          <input v-model="currentPassword" type="password" required autocomplete="current-password" maxlength="128" />
        </label>
        <label>
          <span>{{ settingsStore.t("settings.newPassword") }}</span>
          <input v-model="newPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password" />
        </label>
        <label>
          <span>{{ settingsStore.t("settings.confirmNewPassword") }}</span>
          <input v-model="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password" />
        </label>
      </div>
      <div class="form-actions settings-actions">
        <button class="primary-button" type="submit" :disabled="!canChangePassword">
          {{ changingPassword ? settingsStore.t("auth.processing") : settingsStore.t("settings.changePassword") }}
        </button>
      </div>
    </form>

    <details class="settings-advanced-details settings-session-list">
      <summary>{{ settingsStore.t("settings.activeSessions") }} ({{ sessions.length }})</summary>
      <div class="settings-session-toolbar">
        <p class="settings-sensitive-note">{{ settingsStore.t("settings.sessionSecurityHint") }}</p>
        <button
          class="secondary-button danger-outline-button"
          type="button"
          :disabled="sessionActionId !== null || loadingSessions"
          @click="revokeOtherSessions"
        >
          {{ settingsStore.t("settings.revokeOtherSessions") }}
        </button>
      </div>
      <p v-if="loadingSessions" class="settings-sensitive-note" role="status">
        {{ settingsStore.t("settings.loadingSessions") }}
      </p>
      <p v-else-if="sessions.length === 0" class="settings-sensitive-note">
        {{ settingsStore.t("settings.noActiveSessions") }}
      </p>
      <ul v-else class="settings-session-items">
        <li v-for="session in sessions" :key="session.id">
          <div>
            <strong>{{ sessionDeviceLabel(session) }}</strong>
            <span>{{ settingsStore.t("settings.sessionCreated") }}: {{ formatSessionTime(session.created_at) }}</span>
            <span>{{ settingsStore.t("settings.sessionExpires") }}: {{ formatSessionTime(session.expires_at) }}</span>
          </div>
          <button
            class="secondary-button danger-outline-button"
            type="button"
            :disabled="sessionActionId !== null"
            @click="revokeSession(session)"
          >
            {{ settingsStore.t("settings.revokeSession") }}
          </button>
        </li>
      </ul>
    </details>

    <p
      v-if="feedback"
      :class="['form-message', feedbackTone === 'error' ? 'form-message-error' : 'form-message-success']"
      :role="feedbackTone === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      {{ feedback }}
    </p>

    <ConfirmDialog
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :message="confirmDialog.message"
      :confirm-text="confirmDialog.confirmText"
      :cancel-text="confirmDialog.cancelText"
      :danger="confirmDialog.danger"
      @confirm="confirmRequestedAction"
      @cancel="cancelRequestedAction"
    />
  </section>
</template>
