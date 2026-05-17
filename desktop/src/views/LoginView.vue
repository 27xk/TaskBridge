<script setup lang="ts">
import { ref } from "vue";

import { useAuthStore } from "../stores/auth";

const emit = defineEmits<{
  authenticated: [];
}>();

const auth = useAuthStore();
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
</script>

<template>
  <main class="login-shell">
    <section class="login-panel">
      <div class="brand-block">
        <span class="brand-mark">TB</span>
        <div>
          <h1>TaskBridge</h1>
          <p>Windows desktop sync client</p>
        </div>
      </div>

      <div class="segment-control" role="tablist" aria-label="Auth mode">
        <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">
          Login
        </button>
        <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'">
          Register
        </button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <label v-if="mode === 'register'">
          <span>Username</span>
          <input v-model="username" type="text" required minlength="3" autocomplete="username" />
        </label>
        <label>
          <span>{{ mode === "login" ? "Username or email" : "Email" }}</span>
          <input v-model="email" type="text" required autocomplete="email" />
        </label>
        <label>
          <span>Password</span>
          <input v-model="password" type="password" required minlength="8" autocomplete="current-password" />
        </label>

        <p v-if="auth.error" class="form-error">{{ auth.error }}</p>
        <button class="primary-button" type="submit" :disabled="auth.loading">
          {{ auth.loading ? "Working..." : mode === "login" ? "Login" : "Create account" }}
        </button>
      </form>
    </section>
  </main>
</template>
