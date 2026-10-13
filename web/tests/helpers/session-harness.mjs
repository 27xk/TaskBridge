import { buildOfflineDatabaseName } from "../../offline-core.js";
import { createAppHarness } from "./app-harness.mjs";

export function jsonResponse(data, status = 200) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(data) };
}

export function sessionTokens(id) {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    user: { id, username: `User ${id}`, email: `user${id}@taskbridge.test` },
  };
}

export function createSessionHarness(options = {}) {
  const harness = createAppHarness(options);
  const { context, run, state } = harness;
  const databases = new Map();
  const requests = [];
  const effects = { busy: [], renders: [], drafts: [], writes: [], statuses: [] };
  const controls = { cookieUserId: 1, respond: null, read: null };
  let createdId = 1000;
  const database = (name) => {
    if (databases.has(name)) return databases.get(name);
    const stores = new Map([
      ["tasks", new Map()],
      ["offline_mutations", new Map()],
      ["meta", new Map([["cache_ready", { key: "cache_ready", value: true }]])],
    ]);
    const db = {
      stores,
      close() {},
      transaction() {
        let pending = 0;
        const tx = {
          objectStore(storeName) {
            const store = stores.get(storeName);
            const makeRequest = (method, result) => {
              const request = {};
              pending += 1;
              const response = controls.read?.({ name, storeName, method, result });
              Promise.resolve(response === undefined ? result : response).then((value) => {
                request.result = structuredClone(value);
                request.onsuccess?.();
                pending -= 1;
                if (!pending) queueMicrotask(() => tx.oncomplete?.());
              }, (error) => {
                request.error = error;
                request.onerror?.();
                tx.error = error;
                tx.onerror?.();
              });
              return request;
            };
            const keyFor = (record) => record.id ?? record.offline_queue_id ?? record.key;
            return {
              getAll: () => makeRequest("getAll", [...store.values()]),
              get: (key) => makeRequest("get", store.get(key)),
              count: () => makeRequest("count", store.size),
              put(record) {
                effects.writes.push({ name, storeName, method: "put", record: structuredClone(record) });
                store.set(keyFor(record), structuredClone(record));
                return makeRequest("put", keyFor(record));
              },
              delete(key) {
                effects.writes.push({ name, storeName, method: "delete", key });
                store.delete(key);
                return makeRequest("delete", undefined);
              },
              clear() {
                effects.writes.push({ name, storeName, method: "clear" });
                store.clear();
                return makeRequest("clear", undefined);
              },
            };
          },
        };
        queueMicrotask(() => { if (!pending) tx.oncomplete?.(); });
        return tx;
      },
    };
    databases.set(name, db);
    return db;
  };
  const workspaceName = (id, apiBaseUrl = state.apiBaseUrl) => buildOfflineDatabaseName("taskbridge.web.v1", apiBaseUrl, id);
  const workspace = (id, apiBaseUrl) => database(workspaceName(id, apiBaseUrl)).stores;
  const defaultResponse = (request) => {
    if (request.path === "/auth/me") {
      return request.userId ? jsonResponse(sessionTokens(request.userId).user) : jsonResponse({ detail: "Not authenticated" }, 401);
    }
    if (request.path === "/auth/refresh") {
      const id = Number(request.body?.refresh_token?.match(/^refresh-(\d+)/)?.[1]) || controls.cookieUserId;
      return jsonResponse(sessionTokens(id));
    }
    if (request.path === "/auth/login" || request.path === "/auth/register") return jsonResponse(sessionTokens(2));
    if (request.path === "/tasks/meta") return jsonResponse({ projects: [], tags: [], counts: {}, owner: request.userId });
    if (request.path === "/tasks" && request.method === "GET") return jsonResponse([]);
    if (request.path === "/tasks" && request.method === "POST") {
      return jsonResponse({ ...request.body, id: createdId++, version: 1, status: "open", is_deleted: false });
    }
    if (request.path === "/sync/status") return jsonResponse({ status: "ready", server: request.url.origin });
    throw new Error(`Unexpected request: ${request.method} ${request.path}`);
  };
  context.fetch = async (url, options) => {
    const parsed = new URL(url);
    const request = {
      url: parsed,
      path: parsed.pathname.replace(/^\/api\/v1/, ""),
      method: options.method,
      authorization: options.headers.Authorization ?? "",
      userId: Number(options.headers.Authorization?.match(/access-(\d+)/)?.[1]) || 0,
      body: options.body === undefined ? undefined : JSON.parse(options.body),
    };
    requests.push(request);
    const response = controls.respond?.(request);
    return response === undefined ? defaultResponse(request) : response;
  };
  context.indexedDB = {};
  context.window.indexedDB = context.indexedDB;
  context.testDatabase = database;
  context.effects = effects;
  context.navigator.locks = { request: async (_name, callback) => callback() };
  context.window.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
  run(`
    openOfflineDatabase = async (name) => testDatabase(name);
    render = () => effects.renders.push({ userId: getCurrentUserId(), apiBaseUrl: state.apiBaseUrl });
    setBusy = (busy) => { state.loading = busy; effects.busy.push({ busy, userId: getCurrentUserId() }); };
    setStatus = (node, message) => { node.textContent = message; effects.statuses.push(message); };
    clearAuthenticationInputs = () => {};
    resetAccountScopedTaskForm = () => {};
    clearTaskNotificationTimers = () => {};
    scheduleTaskNotifications = async () => {};
    updateAuthMode = () => {};
    updateConnectionBadge = () => {};
    renderSyncStatus = () => {};
    renderTaskSyncHealthBar = () => {};
    renderMeta = () => {};
    renderSummary = () => {};
    restoreTaskDraft = () => { effects.drafts.push(getCurrentUserId()); return true; };
    persistTaskDraft = () => {};
  `);
  return {
    ...harness, controls, requests, effects, workspace, workspaceName,
    signIn(id, { invalidate = true } = {}) {
      context.incomingTokens = sessionTokens(id);
      if (invalidate) run("invalidateSessionRefreshes()");
      run("persistTokens(incomingTokens)");
    },
    addQueuedTask(id, title, apiBaseUrl) {
      const stores = workspace(id, apiBaseUrl);
      stores.get("offline_mutations").set(1, {
        offline_queue_id: 1,
        action: "create",
        task_id: -1,
        user_id: id,
        payload: { title, client_request_id: `stable-${id}` },
        offline_status: "pending",
      });
      stores.get("tasks").set(-1, { id: -1, title, status: "open", offline_status: "pending:create" });
    },
  };
}
