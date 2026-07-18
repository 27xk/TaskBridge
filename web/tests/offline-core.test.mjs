import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOfflineDatabaseName,
  buildConflictOverwritePayload,
  buildTaskMetaLabels,
  buildLocalMeta,
  canResolveTaskConflict,
  compareCachedTasks,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  getTaskViewLabel,
  hasOfflineQueueId,
  makeOfflineTask,
  makeTaskFromTemplate,
  matchesTaskView,
  isOfflineProfileForApi,
  normalizeOfflineApiBaseUrl,
  normalizeOfflineProfile,
  reconcileCachedTaskSnapshot,
  resetEndpointScopedConnectionState,
  shouldConfirmTaskAction,
  shouldShowConnectionBadge,
} from "../offline-core.js";

const fixedNow = new Date("2026-06-05T10:00:00.000Z");

test("offline resume profiles retain only the identity needed to open the correct cache", () => {
  assert.deepEqual(
    normalizeOfflineProfile({
      id: 42,
      username: " owner ",
      email: "owner@example.com",
      api_base_url: "HTTPS://TaskBridge.Example.com:443/root/api/v1/",
      access_token: "must-not-persist",
      refresh_token: "must-not-persist",
      role: "admin",
    }),
    {
      id: 42,
      username: "owner",
      email: "owner@example.com",
      api_base_url: "https://taskbridge.example.com/root/api/v1",
    },
  );
});

test("offline resume rejects profiles without a positive user id", () => {
  const apiBaseUrl = "https://taskbridge.example.com/api/v1";
  assert.equal(normalizeOfflineProfile({ id: 0, username: "owner", api_base_url: apiBaseUrl }), null);
  assert.equal(normalizeOfflineProfile({ id: "not-a-number", username: "owner", api_base_url: apiBaseUrl }), null);
  assert.equal(normalizeOfflineProfile({ id: 1, username: "owner" }), null);
  assert.equal(normalizeOfflineProfile(null), null);
});

test("legacy offline profiles are bound to the saved API during migration", () => {
  assert.deepEqual(
    normalizeOfflineProfile(
      { id: 42, username: "owner", email: "owner@example.com" },
      "http://127.0.0.1:8000/api/v1",
    ),
    {
      id: 42,
      username: "owner",
      email: "owner@example.com",
      api_base_url: "http://127.0.0.1:8000/api/v1",
    },
  );
});

test("offline database names isolate equal user ids on different servers", () => {
  const first = buildOfflineDatabaseName(
    "taskbridge.web.v1",
    "https://one.example.com/api/v1",
    42,
  );
  const equivalent = buildOfflineDatabaseName(
    "taskbridge.web.v1",
    "HTTPS://ONE.EXAMPLE.COM:443/api/v1/",
    42,
  );
  const second = buildOfflineDatabaseName(
    "taskbridge.web.v1",
    "https://two.example.com/api/v1",
    42,
  );

  assert.equal(first, equivalent);
  assert.notEqual(first, second);
  assert.match(first, /\.offline\.server\..+\.user\.42$/);
  assert.equal(
    normalizeOfflineApiBaseUrl("https://one.example.com"),
    "https://one.example.com/api/v1",
  );
});

test("offline resume profiles only match their original API", () => {
  const profile = normalizeOfflineProfile({
    id: 42,
    username: "owner",
    api_base_url: "https://one.example.com/api/v1",
  });

  assert.equal(isOfflineProfileForApi(profile, "HTTPS://ONE.EXAMPLE.COM:443/api/v1/"), true);
  assert.equal(isOfflineProfileForApi(profile, "https://two.example.com/api/v1"), false);
});

test("cache reconciliation removes stale scoped records and preserves pending work", () => {
  const cached = [
    { id: 1, title: "Removed remotely", list_type: "inbox", status: "open" },
    {
      id: 2,
      title: "Local pending title",
      list_type: "inbox",
      status: "open",
      offline_status: "pending:update",
      offline_queue_id: 7,
    },
    { id: 3, title: "Other view", list_type: "later", status: "open" },
    {
      id: 4,
      title: "Old remote title",
      list_type: "inbox",
      status: "open",
      offline_status: null,
      offline_queue_id: null,
    },
  ];
  const remote = [
    { id: 2, title: "Server title", list_type: "inbox", status: "open" },
    { id: 4, title: "Fresh remote title", list_type: "inbox", status: "open" },
    { id: 5, title: "New remote task", list_type: "inbox", status: "open" },
  ];

  const reconciled = reconcileCachedTaskSnapshot(cached, remote, { view: "inbox", search: "" });

  assert.deepEqual(reconciled.map((task) => task.id), [2, 3, 4, 5]);
  assert.equal(reconciled.find((task) => task.id === 2)?.title, "Local pending title");
  assert.equal(reconciled.find((task) => task.id === 4)?.title, "Fresh remote title");
  assert.equal(reconciled.find((task) => task.id === 4)?.offline_status, null);
});

test("offline queue ids accept only positive integer IndexedDB keys", () => {
  for (const value of [1, 42, Number.MAX_SAFE_INTEGER]) {
    assert.equal(hasOfflineQueueId(value), true, `${String(value)} should be accepted`);
  }
  for (const value of [
    null,
    undefined,
    "",
    "1",
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    [1],
    { valueOf: () => 1 },
  ]) {
    assert.equal(hasOfflineQueueId(value), false, `${String(value)} should be rejected`);
  }
});

test("connection badge visibility follows local workspace and connection check state", () => {
  assert.equal(shouldShowConnectionBadge(false, null), false);
  assert.equal(shouldShowConnectionBadge(true, null), true);
  assert.equal(shouldShowConnectionBadge(false, { status: "ready" }), true);
  assert.equal(shouldShowConnectionBadge(false, { status: "degraded" }), true);
});

test("endpoint changes clear only endpoint-scoped connection state", () => {
  const user = { id: 42, username: "owner" };
  const tasks = [{ id: 1, title: "Keep me" }];
  const offlineQueue = [{ offline_queue_id: 7 }];
  const state = {
    serverBaseUrl: "https://one.example.com",
    apiBaseUrl: "https://one.example.com/api/v1",
    registrationStatusKnown: true,
    registrationEnabled: true,
    syncStatus: { status: "ready" },
    user,
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tasks,
    offlineQueue,
  };

  assert.equal(
    resetEndpointScopedConnectionState(
      state,
      "https://one.example.com",
      "https://one.example.com/api/v1",
    ),
    false,
  );
  assert.equal(state.registrationStatusKnown, true);
  assert.equal(state.registrationEnabled, true);
  assert.deepEqual(state.syncStatus, { status: "ready" });

  assert.equal(
    resetEndpointScopedConnectionState(
      state,
      "https://one.example.com",
      "https://one.example.com/custom-api/v1",
    ),
    true,
  );
  assert.equal(state.registrationStatusKnown, false);
  assert.equal(state.registrationEnabled, false);
  assert.equal(state.syncStatus, null);
  assert.equal(state.user, user);
  assert.equal(state.accessToken, "access-token");
  assert.equal(state.refreshToken, "refresh-token");
  assert.equal(state.tasks, tasks);
  assert.equal(state.offlineQueue, offlineQueue);
});

test("offline-created tasks preserve the full task payload used by sync", () => {
  const task = makeOfflineTask(
    {
      title: "Review offline payload",
      content: "Do not silently drop task fields",
      project: "quality",
      tag: "web",
      priority: 3,
      list_type: "today",
      planned_date: "2026-06-05",
      due_time: "2026-06-05T12:00:00.000Z",
      remind_time: "2026-06-05T11:45:00.000Z",
      repeat_rule: "daily",
      snoozed_until: "2026-06-05T13:00:00.000Z",
      parent_task_id: 42,
      checklist: [{ id: "check-1", title: "verify", done: false }],
      is_template: true,
      template_name: "Review",
      sort_order: 9,
    },
    {
      now: fixedNow,
      nowMs: () => fixedNow.getTime(),
      random: () => 0,
    },
  );

  assert.equal(task.remind_time, "2026-06-05T11:45:00.000Z");
  assert.equal(task.repeat_rule, "daily");
  assert.equal(task.snoozed_until, "2026-06-05T13:00:00.000Z");
  assert.equal(task.parent_task_id, 42);
  assert.deepEqual(task.checklist, [{ id: "check-1", title: "verify", done: false }]);
  assert.equal(task.is_template, true);
  assert.equal(task.template_name, "Review");
  assert.equal(task.sort_order, 9);
});

test("offline-created backup imports preserve completion and deletion state", () => {
  const task = makeOfflineTask(
    {
      title: "Already archived",
      status: "completed",
      completed_at: "2026-06-05T14:00:00.000Z",
      is_deleted: true,
    },
    {
      now: fixedNow,
      nowMs: () => fixedNow.getTime(),
      random: () => 0.2,
    },
  );

  assert.equal(task.status, "completed");
  assert.equal(task.completed_at, "2026-06-05T14:00:00.000Z");
  assert.equal(task.is_deleted, true);
});

test("cached task ordering keeps urgent overdue work ahead of stale future work", () => {
  const overdue = {
    id: 1,
    title: "Past due",
    status: "open",
    is_deleted: false,
    due_time: "2026-06-04T09:00:00.000Z",
    planned_date: null,
    updated_at: "2026-06-04T09:00:00.000Z",
    created_at: "2026-06-04T08:00:00.000Z",
    offline_status: null,
  };
  const future = {
    id: 2,
    title: "Future but freshly edited",
    status: "open",
    is_deleted: false,
    due_time: "2026-06-10T09:00:00.000Z",
    planned_date: null,
    updated_at: "2026-06-05T09:59:00.000Z",
    created_at: "2026-06-05T09:00:00.000Z",
    offline_status: null,
  };

  const sorted = [future, overdue].sort((left, right) =>
    compareCachedTasks(left, right, { now: fixedNow }),
  );

  assert.deepEqual(
    sorted.map((task) => task.id),
    [1, 2],
  );
});

test("cached task ordering demotes future snoozed work below actionable work", () => {
  const actionable = {
    id: 1,
    title: "Do now",
    status: "open",
    is_deleted: false,
    due_time: "2026-06-05T12:00:00",
    planned_date: null,
    snoozed_until: null,
    updated_at: "2026-06-05T08:00:00.000Z",
    created_at: "2026-06-05T08:00:00.000Z",
    offline_status: null,
  };
  const snoozed = {
    id: 2,
    title: "Snoozed for later",
    status: "open",
    is_deleted: false,
    due_time: "2026-06-05T12:00:00",
    planned_date: null,
    snoozed_until: "2026-06-05T11:00:00.000Z",
    updated_at: "2026-06-05T09:59:00.000Z",
    created_at: "2026-06-05T09:00:00.000Z",
    offline_status: null,
  };

  const sorted = [snoozed, actionable].sort((left, right) =>
    compareCachedTasks(left, right, { now: fixedNow }),
  );

  assert.deepEqual(
    sorted.map((task) => task.id),
    [1, 2],
  );
});

test("local meta counts preserved offline reminders and templates without mutating tasks", () => {
  const template = makeOfflineTask(
    {
      title: "Template",
      is_template: true,
      checklist: [{ id: "1", title: "step", done: true }],
      planned_date: "2026-06-05",
    },
    { now: fixedNow },
  );

  const before = structuredClone(template);
  const meta = buildLocalMeta([template], fixedNow);

  assert.equal(meta.counts.today, 1);
  assert.deepEqual(template, before);
});

test("today view treats the explicit today list as today work", () => {
  const todayListTask = {
    id: 12,
    title: "Review today's inbox",
    status: "open",
    is_deleted: false,
    list_type: "today",
    planned_date: null,
    due_time: null,
    updated_at: "2026-06-05T08:00:00.000Z",
    created_at: "2026-06-05T08:00:00.000Z",
    offline_status: null,
  };

  assert.equal(
    matchesTaskView(todayListTask, {
      view: "today",
      search: "",
      now: fixedNow,
      timeZone: "Asia/Shanghai",
    }),
    true,
  );
  assert.equal(buildLocalMeta([todayListTask], fixedNow, { timeZone: "Asia/Shanghai" }).counts.today, 1);
});

test("offline template instantiation creates a pending regular task with reset checklist", () => {
  const task = makeTaskFromTemplate(
    {
      id: 42,
      title: "Daily review",
      content: "Use the template offline",
      project: "ops",
      tag: "routine",
      priority: 3,
      list_type: "today",
      planned_date: "2026-06-05",
      due_time: "2026-06-05T12:00:00.000Z",
      remind_time: "2026-06-05T11:45:00.000Z",
      repeat_rule: "daily",
      snoozed_until: "2026-06-05T13:00:00.000Z",
      checklist: [
        { id: "step-1", title: "Read", done: true },
        { id: "step-2", title: "Send", done: false },
      ],
      is_template: true,
      template_name: "Review",
      sort_order: 9,
    },
    {
      now: fixedNow,
      nowMs: () => fixedNow.getTime(),
      random: () => 0,
    },
  );

  assert.equal(task.title, "Daily review");
  assert.equal(task.content, "Use the template offline");
  assert.equal(task.project, "ops");
  assert.equal(task.tag, "routine");
  assert.equal(task.priority, 3);
  assert.equal(task.list_type, "inbox");
  assert.equal(task.planned_date, "2026-06-05");
  assert.equal(task.due_time, "2026-06-05T12:00:00.000Z");
  assert.equal(task.remind_time, "2026-06-05T11:45:00.000Z");
  assert.equal(task.repeat_rule, "daily");
  assert.equal(task.snoozed_until, null);
  assert.equal(task.parent_task_id, 42);
  assert.equal(task.is_template, false);
  assert.equal(task.template_name, null);
  assert.equal(task.status, "open");
  assert.equal(task.completed_at, null);
  assert.equal(task.is_deleted, false);
  assert.equal(task.offline_status, "pending:create");
  assert.deepEqual(task.checklist, [
    { id: "step-1", title: "Read", done: false },
    { id: "step-2", title: "Send", done: false },
  ]);
});

test("today and overdue views use the user's display time zone", () => {
  const chinaMidnight = new Date("2026-06-05T16:30:00.000Z");
  const todayInShanghai = {
    id: 101,
    title: "China local day",
    status: "open",
    is_deleted: false,
    due_time: "2026-06-05T16:30:00.000Z",
    planned_date: null,
    updated_at: "2026-06-05T16:00:00.000Z",
    created_at: "2026-06-05T16:00:00.000Z",
    offline_status: null,
  };
  const plannedYesterdayInShanghai = {
    ...todayInShanghai,
    id: 102,
    title: "Yesterday in China",
    due_time: null,
    planned_date: "2026-06-05",
  };

  assert.equal(
    matchesTaskView(todayInShanghai, {
      view: "today",
      search: "",
      now: chinaMidnight,
      timeZone: "Asia/Shanghai",
    }),
    true,
  );
  assert.equal(
    matchesTaskView(plannedYesterdayInShanghai, {
      view: "overdue",
      search: "",
      now: chinaMidnight,
      timeZone: "Asia/Shanghai",
    }),
    true,
  );
  assert.equal(buildLocalMeta([todayInShanghai], chinaMidnight, { timeZone: "Asia/Shanghai" }).counts.today, 1);
});

test("web task labels hide internal priority, sync queue, and version details from users", () => {
  const task = {
    title: "Readable task",
    status: "open",
    is_deleted: false,
    due_time: "2026-06-05T12:00:00",
    planned_date: "2026-06-05",
    priority: 3,
    list_type: "inbox",
    version: 9,
    offline_status: "pending:update",
    offline_queue_id: 42,
    offline_error: null,
    checklist: [
      { id: "step-1", title: "Check copy", done: true },
      { id: "step-2", title: "Ship", done: false },
    ],
  };

  assert.equal(getTaskViewLabel("trash"), "回收站");
  assert.equal(getTaskPriorityLabel(3), "高优先级");
  assert.equal(getTaskStatusLabel(task), "待同步");
  assert.deepEqual(buildTaskMetaLabels(task), [
    "收件箱",
    "高优先级",
    "计划 2026-06-05",
    "截止 2026/06/05 12:00",
    "清单 2 项",
    "待同步",
  ]);
});

test("web conflict resolution only sends user task fields when overwriting server", () => {
  const task = {
    id: 88,
    title: "Keep local copy",
    content: "Edited offline",
    status: "open",
    priority: 4,
    tag: "sync",
    project: "quality",
    list_type: "today",
    due_time: "2026-06-05T12:00:00.000Z",
    remind_time: "2026-06-05T11:45:00.000Z",
    repeat_rule: "weekly",
    planned_date: "2026-06-05",
    completed_at: null,
    snoozed_until: null,
    parent_task_id: null,
    checklist: [{ id: "step-1", title: "Review", done: false }],
    is_template: false,
    template_name: null,
    sort_order: 7,
    version: 9,
    offline_status: "conflict",
    offline_queue_id: 42,
    offline_error: "version conflict",
  };

  assert.equal(canResolveTaskConflict(task), true);
  assert.deepEqual(buildConflictOverwritePayload(task), {
    title: "Keep local copy",
    content: "Edited offline",
    status: "open",
    priority: 4,
    tag: "sync",
    project: "quality",
    list_type: "today",
    due_time: "2026-06-05T12:00:00.000Z",
    remind_time: "2026-06-05T11:45:00.000Z",
    repeat_rule: "weekly",
    planned_date: "2026-06-05",
    completed_at: null,
    snoozed_until: null,
    parent_task_id: null,
    checklist: [{ id: "step-1", title: "Review", done: false }],
    is_template: false,
    template_name: null,
    sort_order: 7,
  });
});

test("destructive task actions require a user confirmation", () => {
  assert.equal(shouldConfirmTaskAction("delete"), true);
  assert.equal(shouldConfirmTaskAction("restore"), false);
  assert.equal(shouldConfirmTaskAction("complete"), false);
});
