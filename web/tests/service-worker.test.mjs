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
    Request,
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
  return { listeners, self, shellAssets: vm.runInContext("SHELL_ASSETS", context) };
}

test("the offline shell includes every module in the application import graph", async () => {
  const { shellAssets } = loadServiceWorker();
  const cached = new Set(shellAssets);
  const visited = new Set();
  async function visit(asset) {
    if (visited.has(asset)) return;
    visited.add(asset);
    assert.ok(cached.has(asset), `${asset} must be available for offline startup`);
    const text = await readFile(new URL(`../${asset}`, import.meta.url), "utf8");
    for (const match of text.matchAll(/from\s+["'](\.\/[^"']+\.js\?v=[^"']+)["']/g)) await visit(match[1]);
  }
  await visit("./app.js?v=0.2.1");
});

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

test("stylesheets refresh online even when an installed shell has an older cached copy", async () => {
  const stale = { body: "old CSS" };
  const fresh = { body: "current CSS", clone() { return this; } };
  const writes = [];
  const requests = [];
  const { listeners } = loadServiceWorker({
    fetch: async (request, options) => { requests.push({ request, options }); return fresh; },
    caches: {
      open: async () => ({ put: async (...args) => writes.push(args) }),
      match: async () => stale,
    },
  });
  let work;
  listeners.get("fetch")({
    request: { method: "GET", mode: "cors", url: "https://tasks.example.com/web/styles.css" },
    respondWith(value) { work = value; },
  });
  assert.equal(await work, fresh);
  assert.equal(requests[0].options.cache, "no-cache");
  assert.equal(writes[0][0], "./styles.css");
});

test("the revised shell retires the old release cache without touching unrelated caches", async () => {
  const removed = [];
  const { listeners } = loadServiceWorker({ caches: {
    keys: async () => ["taskbridge-web-shell-v0.1.8", "unrelated-cache"],
    delete: async (key) => { removed.push(key); return true; },
  } });
  let work;
  listeners.get("activate")({ waitUntil(value) { work = value; } });
  await work;
  assert.deepEqual(removed, ["taskbridge-web-shell-v0.1.8"]);
});

test("installing a shell revision bypasses stale HTTP asset caches", async () => {
  let assets;
  const { listeners } = loadServiceWorker({ caches: {
    open: async () => ({ addAll: async (requests) => { assets = requests; } }),
  } });
  let work;
  listeners.get("install")({ waitUntil(value) { work = value; } });
  await work;
  assert.ok(assets.length > 0);
  assert.ok(assets.every((asset) => asset.cache === "reload"));
  assert.ok(assets.some((asset) => asset.url.endsWith("/styles.css")));
});

test("the new worker claims clients after old shell deletion has completed", async () => {
  let finishDeletion;
  const pendingDeletion = new Promise((resolve) => { finishDeletion = resolve; });
  let claims = 0;
  const { listeners } = loadServiceWorker({
    self: { clients: { claim: async () => { claims += 1; } } },
    caches: {
      keys: async () => ["taskbridge-web-shell-v0.1.8"],
      delete: async () => pendingDeletion,
    },
  });
  let work;
  listeners.get("activate")({ waitUntil(value) { work = value; } });
  await Promise.resolve();
  assert.equal(claims, 0);
  finishDeletion(true);
  await work;
  assert.equal(claims, 1);
});
