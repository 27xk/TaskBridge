import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLatestRequestGate } from "../offline-core.js";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");

function extractTestConnectionSource() {
  const start = appSource.indexOf("async function testConnection()");
  const end = appSource.indexOf("\nfunction persistTokens", start);
  assert.ok(start >= 0 && end > start, "testConnection source must be extractable");
  return appSource.slice(start, end);
}

function extractLoadRegistrationStatusSource() {
  const start = appSource.indexOf("async function loadRegistrationStatus()");
  const end = appSource.indexOf("\nfunction render()", start);
  assert.ok(start >= 0 && end > start, "loadRegistrationStatus source must be extractable");
  return appSource.slice(start, end);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createTestConnectionHarness() {
  const effects = {
    authModeRenders: 0,
    badgeRenders: 0,
    busy: [],
    feedback: [],
    healthRenders: 0,
    registrationLoads: 0,
    registrationRequests: 0,
    reveals: 0,
    statusMessages: [],
    syncRenders: 0,
    toasts: [],
  };
  const state = {
    registrationEnabled: false,
    registrationStatusKnown: false,
    syncStatus: null,
  };
  const controls = {
    applyServerBaseUrlToApi() {},
    async apiRequest() {
      return { status: "ready" };
    },
    savePreferenceInputs() {},
  };
  const dependencies = {
    applyServerBaseUrlToApi: (...args) => controls.applyServerBaseUrlToApi(...args),
    savePreferenceInputs: (...args) => controls.savePreferenceInputs(...args),
    connectionRequestGate: createLatestRequestGate(),
    registrationRequestGate: createLatestRequestGate(),
    setBusy: (isBusy) => effects.busy.push(isBusy),
    setStatus: (_node, message) => effects.statusMessages.push(message),
    nodes: { authMessage: {} },
    t: (key) => key,
    apiRequest: (...args) => {
      if (args[0] === "/auth/registration") {
        effects.registrationLoads += 1;
        effects.registrationRequests += 1;
      }
      return controls.apiRequest(...args);
    },
    state,
    updateAuthMode: () => {
      effects.authModeRenders += 1;
    },
    renderSyncStatus: () => {
      effects.syncRenders += 1;
    },
    renderTaskSyncHealthBar: () => {
      effects.healthRenders += 1;
    },
    updateConnectionBadge: () => {
      effects.badgeRenders += 1;
    },
    hasSession: () => false,
    registrationDisabledHelp: () => "registration disabled",
    toast: (message) => effects.toasts.push(message),
    showSyncStatusFeedback: (...args) => effects.feedback.push(args[0] ?? null),
    isConnectionReadyForAuth: () => state.syncStatus?.status === "ready",
    revealAdvancedConnectionSettings: () => {
      effects.reveals += 1;
    },
  };
  const dependencyNames = Object.keys(dependencies);
  const factory = Function(
    ...dependencyNames,
    `"use strict";
let activeConnectionRequestSequence = null;
${extractLoadRegistrationStatusSource()}
${extractTestConnectionSource()}
return { testConnection };`,
  );
  const { testConnection } = factory(...Object.values(dependencies));
  return { controls, effects, state, testConnection };
}

test("a newer preflight error owns connection UI and blocks an older delayed result", async () => {
  const harness = createTestConnectionHarness();
  const delayedResponse = createDeferred();
  const preflightError = new Error("invalid replacement endpoint");
  let preflightCalls = 0;

  harness.controls.applyServerBaseUrlToApi = () => {
    preflightCalls += 1;
    if (preflightCalls === 2) throw preflightError;
  };
  harness.controls.apiRequest = () => delayedResponse.promise;

  const olderRequest = harness.testConnection();
  const newerResult = await harness.testConnection();

  assert.equal(newerResult, false);
  assert.deepEqual(harness.effects.busy, [true, false]);
  assert.deepEqual(harness.effects.feedback, [preflightError]);
  assert.equal(harness.effects.badgeRenders, 1);
  assert.equal(harness.effects.registrationLoads, 0);
  assert.deepEqual(harness.effects.toasts, []);
  assert.equal(harness.state.syncStatus, null);
  assert.equal(harness.state.registrationStatusKnown, false);

  delayedResponse.resolve({ source: "old-endpoint", status: "ready" });
  const olderResult = await olderRequest;

  assert.equal(olderResult, false);
  assert.deepEqual(harness.effects.busy, [true, false]);
  assert.deepEqual(harness.effects.feedback, [preflightError]);
  assert.equal(harness.effects.badgeRenders, 1);
  assert.equal(harness.effects.registrationLoads, 0);
  assert.deepEqual(harness.effects.toasts, []);
  assert.equal(harness.state.syncStatus, null);
  assert.equal(harness.state.registrationStatusKnown, false);
});

test("an older delayed failure cannot overwrite newer preflight feedback", async () => {
  const harness = createTestConnectionHarness();
  const delayedResponse = createDeferred();
  const preflightError = new Error("invalid replacement endpoint");
  let preflightCalls = 0;

  harness.controls.applyServerBaseUrlToApi = () => {
    preflightCalls += 1;
    if (preflightCalls === 2) throw preflightError;
  };
  harness.controls.apiRequest = () => delayedResponse.promise;

  const olderRequest = harness.testConnection();
  const newerResult = await harness.testConnection();
  delayedResponse.reject(new Error("old endpoint failed late"));
  const olderResult = await olderRequest;

  assert.equal(newerResult, false);
  assert.equal(olderResult, false);
  assert.deepEqual(harness.effects.busy, [true, false]);
  assert.deepEqual(harness.effects.feedback, [preflightError]);
  assert.equal(harness.effects.badgeRenders, 1);
  assert.equal(harness.effects.registrationLoads, 0);
  assert.deepEqual(harness.effects.toasts, []);
  assert.equal(harness.state.syncStatus, null);
  assert.equal(harness.state.registrationStatusKnown, false);
});

test("a newer preflight error invalidates an older delayed registration result", async () => {
  const harness = createTestConnectionHarness();
  const registrationStarted = createDeferred();
  const delayedRegistration = createDeferred();
  const preflightError = new Error("invalid replacement endpoint");
  let preflightCalls = 0;

  harness.controls.applyServerBaseUrlToApi = () => {
    preflightCalls += 1;
    if (preflightCalls === 2) throw preflightError;
  };
  harness.controls.apiRequest = (path) => {
    if (path === "/sync/status") {
      return Promise.resolve({ source: "old-endpoint", status: "ready" });
    }
    if (path === "/auth/registration") {
      registrationStarted.resolve();
      return delayedRegistration.promise;
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const olderRequest = harness.testConnection();
  await registrationStarted.promise;
  const newerResult = await harness.testConnection();

  assert.equal(newerResult, false);
  assert.equal(harness.state.syncStatus, null);
  assert.equal(harness.state.registrationStatusKnown, false);
  assert.equal(harness.state.registrationEnabled, false);

  delayedRegistration.resolve({ registration_enabled: true });
  const olderResult = await olderRequest;

  assert.equal(olderResult, false);
  assert.deepEqual(harness.effects.busy, [true, false]);
  assert.deepEqual(harness.effects.feedback, [preflightError]);
  assert.equal(harness.effects.badgeRenders, 1);
  assert.equal(harness.effects.registrationRequests, 1);
  assert.equal(harness.effects.authModeRenders, 0);
  assert.deepEqual(harness.effects.toasts, []);
  assert.equal(harness.state.syncStatus, null);
  assert.equal(harness.state.registrationStatusKnown, false);
  assert.equal(harness.state.registrationEnabled, false);
});
