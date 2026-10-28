import {
  buildLocalMeta, compareCachedTasks, hasOfflineQueueId, matchesTaskView,
  normalizeRemoteTaskForOffline,
} from "./offline-core.js?v=0.2.1";

export function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("Offline database transaction failed"));
  });
}

function visitCursor(source, visitor, key) {
  return new Promise((resolve, reject) => {
    const request = source.openCursor(key);
    request.onerror = () => reject(request.error || new Error("Offline cursor failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      try {
        visitor(cursor.value, cursor);
        cursor.continue();
      } catch (error) { reject(error); }
    };
  });
}

function equalValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equalValue(left[key], right[key]));
}

// Keep only the best N tasks. Cursor scans never accumulate the complete database.
export function createTaskWindow({ viewContext, limit = 100, linkedTaskId = null, includeMeta = true }) {
  const heap = [];
  let total = 0;
  let sequence = 0;
  let linked = null;
  const meta = includeMeta ? buildLocalMeta([], viewContext.now, viewContext) : null;
  const projects = new Set();
  const tags = new Set();
  const compare = (left, right) => compareCachedTasks(left.task, right.task, viewContext) || left.sequence - right.sequence;
  const capacity = Math.max(1, Math.trunc(limit) || 100);
  function push(task) {
    heap.push(task);
    let child = heap.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (compare(heap[parent], heap[child]) >= 0) break;
      [heap[parent], heap[child]] = [heap[child], heap[parent]];
      child = parent;
    }
  }
  return {
    add(task) {
      if (meta) {
        const item = buildLocalMeta([task], viewContext.now, viewContext);
        for (const key of Object.keys(meta.counts)) meta.counts[key] += item.counts[key];
        item.projects.forEach((value) => projects.add(value));
        item.tags.forEach((value) => tags.add(value));
      }
      if (!matchesTaskView(task, viewContext)) return;
      total += 1;
      if (linkedTaskId !== null && Number(task.id) === Number(linkedTaskId)) linked = task;
      const entry = { task, sequence: sequence++ };
      if (heap.length < capacity) return push(entry);
      if (compare(entry, heap[0]) >= 0) return;
      heap[0] = entry;
      let parent = 0;
      while (true) {
        let worst = parent;
        const left = parent * 2 + 1;
        const right = left + 1;
        if (left < heap.length && compare(heap[left], heap[worst]) > 0) worst = left;
        if (right < heap.length && compare(heap[right], heap[worst]) > 0) worst = right;
        if (worst === parent) break;
        [heap[parent], heap[worst]] = [heap[worst], heap[parent]];
        parent = worst;
      }
    },
    result() {
      const tasks = heap.sort(compare).map((entry) => entry.task);
      if (linked && !tasks.includes(linked)) tasks.splice(Math.max(0, tasks.length - 1), 1, linked);
      if (meta) {
        meta.projects = [...projects].sort((a, b) => a.localeCompare(b));
        meta.tags = [...tags].sort((a, b) => a.localeCompare(b));
      }
      return { tasks, total, meta, retainedTaskCount: heap.length };
    },
  };
}

export function createOfflineRepository({ openDatabase, taskStore = "tasks", metaStore = "meta", cacheReadyKey = "cache_ready", now = () => new Date() }) {
  async function visitTasks(visitor, { index = null, key } = {}) {
    const db = await openDatabase();
    const transaction = db.transaction(taskStore, "readonly");
    const store = transaction.objectStore(taskStore);
    await visitCursor(index ? store.index(index) : store, visitor, key);
  }
  return {
    visitTasks,
    async readQueueHealth({ queueStore = "offline_mutations", lastSuccessAt = null } = {}) {
      const db = await openDatabase();
      const transaction = db.transaction([taskStore, queueStore], "readonly");
      const queue = transaction.objectStore(queueStore);
      const read = (request, transform = (value) => value) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(transform(request.result));
        request.onerror = () => reject(request.error || new Error("Offline health read failed"));
      });
      const [pendingCount, conflictCount, oldest] = await Promise.all([
        read(queue.count()),
        read(transaction.objectStore(taskStore).index("offline_status").count("conflict")),
        read(queue.index("created_at").openKeyCursor(), (cursor) => cursor?.key ?? null),
      ]);
      const age = (value) => {
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? Math.max(0, (now().getTime() - timestamp) / 1000) : null;
      };
      return { pending_count: pendingCount, conflict_count: conflictCount,
        oldest_pending_seconds: age(oldest) ?? 0, last_success_age_seconds: age(lastSuccessAt) };
    },
    async listTasks() {
      const tasks = [];
      await visitTasks((task) => tasks.push(task));
      return tasks;
    },
    async readView(options) {
      const window = createTaskWindow(options);
      // Metadata covers the whole workspace; otherwise narrow reads use existing indexes.
      const includeMeta = options.includeMeta !== false;
      const index = !includeMeta && options.viewContext.project ? "project"
        : !includeMeta && options.viewContext.tag ? "tag"
        : !includeMeta && options.viewContext.view === "conflict" ? "offline_status" : null;
      const key = index === "project" ? options.viewContext.project : index === "tag" ? options.viewContext.tag : index ? "conflict" : undefined;
      await visitTasks(window.add, { index, key });
      return window.result();
    },
    async reconcileSnapshot(tasks, viewContext, { isCurrent = () => true } = {}) {
      const remote = new Map(tasks.map((task) => [String(task.id), normalizeRemoteTaskForOffline(task)]));
      const db = await openDatabase();
      if (!isCurrent()) return false;
      const transaction = db.transaction([taskStore, metaStore], "readwrite");
      const done = transactionComplete(transaction);
      const store = transaction.objectStore(taskStore);
      let cancelled = false;
      try {
        await visitCursor(store, (cached, cursor) => {
          if (!isCurrent()) { cancelled = true; throw new Error("Snapshot superseded"); }
          const key = String(cached.id);
          const incoming = remote.get(key);
          remote.delete(key);
          if (cached.offline_status || hasOfflineQueueId(cached.offline_queue_id)) return;
          if (incoming) {
            if (!equalValue(cached, incoming)) cursor.update(incoming);
          } else if (matchesTaskView(cached, viewContext)) cursor.delete();
        });
      } catch (error) {
        try { transaction.abort(); } catch { /* The request may already have aborted the transaction. */ }
        await done.catch(() => {});
        if (cancelled) return false;
        throw error;
      }
      if (cancelled || !isCurrent()) {
        transaction.abort();
        await done.catch(() => {});
        return false;
      }
      // Queue the final writes inside the cursor success callback's microtask, while the transaction is active.
      for (const task of remote.values()) store.put(task);
      transaction.objectStore(metaStore).put({ key: cacheReadyKey, value: true, updated_at: now().toISOString() });
      await done;
      return isCurrent();
    },
  };
}

export function createOfflineDatabaseManager({ getName, openDatabase, isBlocked = () => false }) {
  let pending = null;
  let currentName = "";
  function close() {
    const previous = pending;
    pending = null;
    currentName = "";
    return previous ? previous.then((db) => db.close()).catch(() => {}) : Promise.resolve();
  }
  return {
    close,
    open() {
      if (isBlocked()) return Promise.reject(new Error("Local data clear is in progress"));
      const name = getName();
      if (pending && currentName === name) return pending;
      void close();
      currentName = name;
      const request = openDatabase(name);
      pending = request;
      void request.catch(() => { if (pending === request) { pending = null; currentName = ""; } });
      return request;
    },
  };
}
