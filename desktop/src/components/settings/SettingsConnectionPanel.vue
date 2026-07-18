<script setup lang="ts">
import { useSettingsStore } from "../../stores/settings";

defineProps<{
  serverUrlDraft: string;
  baseUrl: string;
  wsUrl: string;
  connectionTesting: boolean;
  connectionNote: string;
  connectionNoteTone: "success" | "error" | null;
  advancedConnectionOpen: boolean;
  showAdvancedConnectionEntry: boolean;
}>();

const emit = defineEmits<{
  "update:serverUrlDraft": [value: string];
  "update:baseUrl": [value: string];
  "update:wsUrl": [value: string];
  applyServerUrl: [];
  checkAndSaveConnection: [];
  advancedConnectionToggle: [event: Event];
  showAdvancedConnection: [];
  syncServerUrlFromAdvanced: [];
  markAdvancedEndpointEdited: [];
  resetGeneratedConnectionEndpoints: [];
  saveAdvancedConnection: [];
}>();

const settingsStore = useSettingsStore();

function onServerUrlInput(event: Event): void {
  emit("update:serverUrlDraft", (event.target as HTMLInputElement).value);
}

function onBaseUrlInput(event: Event): void {
  emit("update:baseUrl", (event.target as HTMLInputElement).value);
}

function onWsUrlInput(event: Event): void {
  emit("update:wsUrl", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="settings-section settings-connection">
    <h2>{{ settingsStore.t("settings.connection") }}</h2>
    <div class="settings-grid">
      <label>
        <span>{{ settingsStore.t("settings.serverUrl") }}</span>
        <input
          :value="serverUrlDraft"
          type="text"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          @input="onServerUrlInput"
          @change="$emit('applyServerUrl')"
        />
        <small>{{ settingsStore.t("settings.serverUrlHint") }}</small>
      </label>
    </div>
    <div class="form-actions settings-actions">
      <button class="primary-button" type="button" :disabled="connectionTesting" @click="$emit('checkAndSaveConnection')">
        {{ connectionTesting ? settingsStore.t("settings.connectionTesting") : settingsStore.t("settings.checkAndSaveConnection") }}
      </button>
    </div>
    <button v-if="!showAdvancedConnectionEntry" class="text-button" type="button" @click="$emit('showAdvancedConnection')">
      {{ settingsStore.t("settings.showAdvancedConnection") }}
    </button>
    <details
      v-if="showAdvancedConnectionEntry"
      :open="advancedConnectionOpen"
      class="settings-advanced-details"
      @toggle="$emit('advancedConnectionToggle', $event)"
    >
      <summary>{{ settingsStore.t("settings.advancedEndpoints") }}</summary>
      <div class="settings-grid">
        <label>
          <span>{{ settingsStore.t("settings.baseUrl") }}</span>
          <input
            :value="baseUrl"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            @input="onBaseUrlInput"
            @change="$emit('syncServerUrlFromAdvanced')"
          />
          <small>{{ settingsStore.t("settings.baseUrlHint") }}</small>
        </label>
        <label>
          <span>{{ settingsStore.t("settings.wsUrl") }}</span>
          <input
            :value="wsUrl"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            @input="onWsUrlInput"
            @change="$emit('markAdvancedEndpointEdited')"
          />
          <small>{{ settingsStore.t("settings.wsUrlHint") }}</small>
        </label>
      </div>
      <div class="form-actions settings-actions">
        <button class="secondary-button" type="button" @click="$emit('resetGeneratedConnectionEndpoints')">
          {{ settingsStore.t("settings.resetGeneratedEndpoints") }}
        </button>
        <button class="secondary-button" type="button" :disabled="connectionTesting" @click="$emit('saveAdvancedConnection')">
          {{ connectionTesting ? settingsStore.t("settings.connectionTesting") : settingsStore.t("settings.checkAndSaveAdvancedConnection") }}
        </button>
      </div>
    </details>
    <p
      v-if="connectionNote"
      :class="['form-message', connectionNoteTone === 'success' ? 'form-message-success' : 'form-message-error']"
    >
      {{ connectionNote }}
    </p>
  </section>
</template>
