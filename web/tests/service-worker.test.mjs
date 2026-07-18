import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");

function loadServiceWorker(overrides = {}) {
  const listeners = new Map();
  const scope = "https://tasks.example.com/web/";
  const self = {
    location: new URL(scope),
    registration: { scope },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async () => null,
    },
    skipWaiting() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    ...overrides.self,
  };
  const context = vm.createContext({
    URL,
    Promise,
    self,
    fetch: overrides.fetch || (async () => ({ clone() { return this; } })),
    caches: overrides.caches || {
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
  });
  vm.runInContext(source, context, { filename: "sw.js" });
  return { listeners, self };
}

test("offline guide navigation serves the cached requested guide before the app shell", async () => {
  const guideResponse = { name: "local-trial" };
  const indexResponse = { name: "index" };
  const caches = {
    open: async () => ({ addAll: async () => {}, put: async () => {} }),
    keys: async () => [],
    delete: async () => true,
    match: async (request) => typeof request === "string" ? indexResponse : guideResponse,
  };
  const { listeners } = loadServiceWorker({
    fetch: async () => { throw new TypeError("offline"); },
    caches,
  });
  let responsePromise;
  listeners.get("fetch")({
    request: {
      method: "GET",
      mode: "navigate",
      url: "https://tasks.example.com/web/local-trial.html",
    },
    respondWith(value) {
      responsePromise = value;
    },
  });

  assert.equal(await responsePromise, guideResponse);
});

test("notification clicks focus an existing app window at the linked task", async () => {
  const navigated = [];
  let focused = 0;
  const client = {
    url: "https://tasks.example.com/web/",
    async navigate(url) { navigated.push(url); return this; },
    async focus() { focused += 1; return this; },
  };
  const { listeners } = loadServiceWorker({
    self: {
      clients: {
        claim: async () => {},
        matchAll: async () => [client],
        openWindow: async () => null,
      },
    },
  });
  const handler = listeners.get("notificationclick");
  assert.equal(typeof handler, "function", "notificationclick handler must be registered");

  let work;
  let closed = 0;
  handler({
    notification: {
      data: { url: "https://tasks.example.com/web/?task=42" },
      close() { closed += 1; },
    },
    waitUntil(value) { work = value; },
  });
  await work;

  assert.equal(closed, 1);
  assert.deepEqual(navigated, ["https://tasks.example.com/web/?task=42"]);
  assert.equal(focused, 1);
});
