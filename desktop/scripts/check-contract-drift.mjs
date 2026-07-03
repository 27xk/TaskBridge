import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths, escapeRegExp } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  backendTaskSchema,
  backendSyncSchema,
  backendAuthRoutes,
  backendDeviceRoutes,
  backendSyncRoutes,
  backendTaskRoutes,
  backendAnalyticsRoutes,
  backendWebSocketRoutes,
  desktopTaskApi,
  desktopAuthApi,
  desktopDeviceApi,
  desktopSyncApi,
  desktopHttpSource,
  desktopTaskMapper,
  desktopEnvTypes,
  androidDtos,
  androidApiService,
  androidMappers,
] = await Promise.all([
  readFile(resolve(repoRoot, "backend/app/schemas/task.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/schemas/sync.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/auth.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/devices.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/sync.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/tasks.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/analytics.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/websocket.py"), "utf8"),
  readFile(resolve(desktopRoot, "src/api/task.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/api/auth.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/api/device.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/api/sync.ts"), "utf8"),
  readFile(resolve(desktopRoot, "electron/http.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/sync/task-mapper.ts"), "utf8"),
  readFile(resolve(desktopRoot, "src/env.d.ts"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/remote/dto/ApiDtos.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/remote/ApiService.kt"), "utf8"),
  readFile(resolve(repoRoot, "android/app/src/main/java/com/taskbridge/app/data/repository/Mappers.kt"), "utf8"),
]);

const serverTaskFields = [
  "id",
  "user_id",
  "title",
  "content",
  "status",
  "priority",
  "tag",
  "project",
  "list_type",
  "due_time",
  "remind_time",
  "repeat_rule",
  "planned_date",
  "completed_at",
  "snoozed_until",
  "parent_task_id",
  "checklist",
  "is_template",
  "template_name",
  "sort_order",
  "version",
  "is_deleted",
  "created_at",
  "updated_at",
  "deleted_at",
];

const syncChangeFields = [
  "local_id",
  "server_id",
  "action",
  "title",
  "content",
  "status",
  "priority",
  "tag",
  "project",
  "list_type",
  "due_time",
  "remind_time",
  "repeat_rule",
  "planned_date",
  "completed_at",
  "snoozed_until",
  "parent_task_id",
  "checklist",
  "is_template",
  "template_name",
  "sort_order",
  "version",
  "local_updated_at",
];

const localTaskFields = [
  "localId",
  "serverId",
  "title",
  "content",
  "status",
  "priority",
  "tag",
  "project",
  "listType",
  "dueTime",
  "remindTime",
  "repeatRule",
  "plannedDate",
  "completedAt",
  "snoozedUntil",
  "parentServerId",
  "checklistJson",
  "isTemplate",
  "templateName",
  "sortOrder",
  "version",
  "isDeleted",
  "syncStatus",
  "createdAt",
  "updatedAt",
  "lastSyncAt",
  "conflictServerJson",
  "conflictLocalJson",
];

const serverTaskKotlinFields = serverTaskFields.map(toCamelCase);
const syncChangeKotlinFields = syncChangeFields.map(toCamelCase);
const desktopServerTaskFields = serverTaskFields;
const desktopSyncChangeFields = syncChangeFields;

assertFields("backend TaskRead", classBlock(backendTaskSchema, "TaskRead"), serverTaskFields, pythonFieldPattern);
assertFields(
  "backend TaskUpdateWithVersion",
  classBlock(backendTaskSchema, "TaskUpdateWithVersion"),
  ["expected_version"],
  pythonFieldPattern,
);
assertFields("backend SyncChange", classBlock(backendSyncSchema, "SyncChange"), syncChangeFields, pythonFieldPattern);
assertFields("desktop ServerTaskDto", interfaceBlock(desktopTaskApi, "ServerTaskDto"), desktopServerTaskFields, typeScriptFieldPattern);
assert.match(
  interfaceBlock(desktopTaskApi, "TaskUpdatePayload"),
  /expected_version\s*\?:\s*number/,
  "desktop task api must support expected_version on direct updates",
);
assertFields("desktop SyncPushChange", interfaceBlock(desktopSyncApi, "SyncPushChange"), desktopSyncChangeFields, typeScriptFieldPattern);
assertFields("desktop TaskRecord", interfaceBlock(desktopEnvTypes, "TaskRecord"), localTaskFields, typeScriptFieldPattern);
assertFields("android TaskDto", dataClassBlock(androidDtos, "TaskDto"), serverTaskKotlinFields, kotlinFieldPattern);
assert.match(
  dataClassBlock(androidDtos, "TaskUpdateRequestDto"),
  /expected_version/,
  "android task dto must support expected_version on direct updates",
);
assertFields("android SyncChangeDto", dataClassBlock(androidDtos, "SyncChangeDto"), syncChangeKotlinFields, kotlinFieldPattern);

assertRouteCoverage("backend auth routes", backendAuthRoutes, [
  ["/auth/register", /@router\.post\("\/register"\)/],
  ["/auth/login", /@router\.post\("\/login"\)/],
  ["/auth/refresh", /@router\.post\("\/refresh"\)/],
  ["/auth/me", /@router\.get\("\/me"\)/],
  ["/auth/ws-ticket", /@router\.post\("\/ws-ticket"\)/],
  ["/auth/sessions", /@router\.get\("\/sessions"\)/],
  ["/auth/sessions/revoke-other-devices", /@router\.post\("\/sessions\/revoke-other-devices"\)/],
  ["/auth/sessions/{session_id}", /@router\.delete\("\/sessions\/\{session_id\}"\)/],
]);
assertRouteCoverage("backend device routes", backendDeviceRoutes, [
  ["/devices/register", /@router\.post\("\/register"\)/],
  ["/devices", /@router\.get\(""\)/],
  ["/devices/{device_id}", /@router\.delete\("\/\{device_id\}"\)/],
]);
assertRouteCoverage("backend sync routes", backendSyncRoutes, [
  ["/sync/status", /@router\.get\("\/status"\)/],
  ["/sync/pull", /@router\.get\("\/pull"\)/],
  ["/sync/push", /@router\.post\("\/push"\)/],
]);
assertRouteCoverage("backend analytics routes", backendAnalyticsRoutes, [
  ["/analytics/events", /@router\.post\("\/events"/],
  ["/analytics/summary", /@router\.get\("\/summary"\)/],
]);
assertRouteCoverage("backend task routes", backendTaskRoutes, [
  ["/tasks", /@router\.get\(""\)/],
  ["/tasks/meta", /@router\.get\("\/meta"\)/],
  ["/tasks/export", /@router\.get\("\/export"\)/],
  ["/tasks", /@router\.post\(""\)/],
  ["/tasks/batch", /@router\.post\("\/batch"\)/],
  ["/tasks/import", /@router\.post\("\/import"\)/],
  ["/tasks/import/preview", /@router\.post\("\/import\/preview"\)/],
  ["/tasks/projects/rename", /@router\.post\("\/projects\/rename"\)/],
  ["/tasks/tags/rename", /@router\.post\("\/tags\/rename"\)/],
  ["/tasks/trash", /@router\.get\("\/trash"\)/],
  ["/tasks/templates/{template_id}/instantiate", /@router\.post\("\/templates\/\{template_id\}\/instantiate"\)/],
  ["/tasks/{task_id}", /@router\.get\("\/\{task_id\}"\)/],
  ["/tasks/{task_id}/history", /@router\.get\("\/\{task_id\}\/history"\)/],
  ["/tasks/{task_id}/resolve-conflict", /@router\.post\("\/\{task_id\}\/resolve-conflict"\)/],
  ["/tasks/{task_id}", /@router\.put\("\/\{task_id\}"\)/],
  ["/tasks/{task_id}/checklist", /@router\.post\("\/\{task_id\}\/checklist"\)/],
  ["/tasks/{task_id}/checklist/{item_id}", /@router\.put\("\/\{task_id\}\/checklist\/\{item_id\}"\)/],
  ["/tasks/{task_id}/checklist/{item_id}", /@router\.delete\("\/\{task_id\}\/checklist\/\{item_id\}"\)/],
  ["/tasks/{task_id}", /@router\.delete\("\/\{task_id\}"\)/],
  ["/tasks/{task_id}/purge", /@router\.delete\("\/\{task_id\}\/purge"\)/],
  ["/tasks/{task_id}/complete", /@router\.post\("\/\{task_id\}\/complete"\)/],
  ["/tasks/{task_id}/next-occurrence", /@router\.post\("\/\{task_id\}\/next-occurrence"\)/],
  ["/tasks/{task_id}/undo-complete", /@router\.post\("\/\{task_id\}\/undo-complete"\)/],
  ["/tasks/{task_id}/postpone", /@router\.post\("\/\{task_id\}\/postpone"\)/],
  ["/tasks/{task_id}/snooze", /@router\.post\("\/\{task_id\}\/snooze"\)/],
  ["/tasks/{task_id}/plan", /@router\.post\("\/\{task_id\}\/plan"\)/],
  ["/tasks/{task_id}/restore", /@router\.post\("\/\{task_id\}\/restore"\)/],
]);
assert.match(
  backendTaskRoutes,
  /expected_version:\s*int \| None = Query\(default=None, ge=1\)/,
  "backend task routes must accept expected_version on direct write endpoints",
);
assert.match(
  backendTaskRoutes,
  /cursor_id:\s*int \| None = Query\(default=None, ge=1\)/,
  "backend task list must expose cursor_id for keyset pagination",
);
assert.match(
  backendTaskRoutes,
  /cursor_updated_at:\s*datetime \| None = None/,
  "backend task list must expose cursor_updated_at for keyset pagination",
);
assertRouteCoverage("backend websocket routes", backendWebSocketRoutes, [
  ["/ws/sync", /@router\.websocket\("\/ws\/sync"\)/],
]);
assertRouteCoverage("desktop auth api", desktopAuthApi, [
  ["/auth/register", /request\.post\("\/auth\/register"/],
  ["/auth/login", /request\.post\("\/auth\/login"/],
  ["/auth/me", /request\.get\("\/auth\/me"/],
  ["/auth/ws-ticket", /request\.post\("\/auth\/ws-ticket"/],
]);
assertRouteCoverage("desktop auth refresh path", desktopHttpSource, [
  ["/auth/refresh", /"\/auth\/refresh"/],
]);
assertRouteCoverage("desktop device api", desktopDeviceApi, [
  ["/devices/register", /request\.post\("\/devices\/register"/],
]);
assertRouteCoverage("desktop sync api", desktopSyncApi, [
  ["/sync/pull", /request\.get\("\/sync\/pull"/],
  ["/sync/push", /request\.post\("\/sync\/push"/],
]);
assertRouteCoverage("desktop task api", desktopTaskApi, [
  ["GET /tasks", /request\.get\(params \? `\/tasks\?\$\{params\}` : "\/tasks"\)/],
  ["POST /tasks", /request\.post\("\/tasks"/],
  ["GET /tasks/{task_id}", /request\.get\(`\/tasks\/\$\{taskId\}`/],
  ["PUT /tasks/{task_id}", /request\.put\(`\/tasks\/\$\{taskId\}`/],
  ["DELETE /tasks/{task_id}", /request\.delete\(`\/tasks\/\$\{taskId\}[^`]*`/],
  ["/tasks/{task_id}/history", /request\.get\(`\/tasks\/\$\{taskId\}\/history`/],
  ["/tasks/{task_id}/checklist", /request\.post\(`\/tasks\/\$\{taskId\}\/checklist`/],
  ["PUT /tasks/{task_id}/checklist/{item_id}", /request\.put\(`\/tasks\/\$\{taskId\}\/checklist\/\$\{itemId\}`/],
  ["DELETE /tasks/{task_id}/checklist/{item_id}", /request\.delete\(`\/tasks\/\$\{taskId\}\/checklist\/\$\{itemId\}`/],
  ["/tasks/{task_id}/complete", /request\.post\(`\/tasks\/\$\{taskId\}\/complete[^`]*`/],
  ["/tasks/{task_id}/restore", /request\.post\(`\/tasks\/\$\{taskId\}\/restore[^`]*`/],
  ["/tasks/{task_id}/next-occurrence", /request\.post\(`\/tasks\/\$\{taskId\}\/next-occurrence`/],
  ["/tasks/templates/{template_id}/instantiate", /request\.post\(`\/tasks\/templates\/\$\{templateId\}\/instantiate`/],
]);
assert.match(
  desktopTaskApi,
  /cursorId\?:\s*number/,
  "desktop task api must expose cursorId for task list pagination",
);
assert.match(
  desktopTaskApi,
  /cursorUpdatedAt\?:\s*string/,
  "desktop task api must expose cursorUpdatedAt for task list pagination",
);
assertRouteCoverage("android api service", androidApiService, [
  ["auth/register", /@POST\("auth\/register"\)/],
  ["auth/login", /@POST\("auth\/login"\)/],
  ["auth/refresh", /@POST\("auth\/refresh"\)/],
  ["auth/me", /@GET\("auth\/me"\)/],
  ["auth/ws-ticket", /@POST\("auth\/ws-ticket"\)/],
  ["tasks", /@GET\("tasks"\)/],
  ["tasks/{task_id}", /@GET\("tasks\/\{task_id\}"\)/],
  ["tasks/{task_id}/history", /@GET\("tasks\/\{task_id\}\/history"\)/],
  ["tasks", /@POST\("tasks"\)/],
  ["tasks/{task_id}", /@PUT\("tasks\/\{task_id\}"\)/],
  ["tasks/{task_id}", /@DELETE\("tasks\/\{task_id\}"\)/],
  ["tasks/{task_id}/purge", /@DELETE\("tasks\/\{task_id\}\/purge"\)/],
  ["tasks/{task_id}/checklist", /@POST\("tasks\/\{task_id\}\/checklist"\)/],
  ["tasks/{task_id}/checklist/{item_id}", /@PUT\("tasks\/\{task_id\}\/checklist\/\{item_id\}"\)/],
  ["tasks/{task_id}/checklist/{item_id}", /@DELETE\("tasks\/\{task_id\}\/checklist\/\{item_id\}"\)/],
  ["tasks/{task_id}/complete", /@POST\("tasks\/\{task_id\}\/complete"\)/],
  ["tasks/{task_id}/restore", /@POST\("tasks\/\{task_id\}\/restore"\)/],
  ["tasks/{task_id}/next-occurrence", /@POST\("tasks\/\{task_id\}\/next-occurrence"\)/],
  ["tasks/templates/{template_id}/instantiate", /@POST\("tasks\/templates\/\{template_id\}\/instantiate"\)/],
  ["devices/register", /@POST\("devices\/register"\)/],
  ["sync/pull", /@GET\("sync\/pull"\)/],
  ["sync/push", /@POST\("sync\/push"\)/],
]);
assert.match(
  androidApiService,
  /@Query\("cursor_id"\)\s+cursorId:\s*Int\?\s*=\s*null/,
  "android task api must expose cursor_id for task list pagination",
);
assert.match(
  androidApiService,
  /@Query\("cursor_updated_at"\)\s+cursorUpdatedAt:\s*String\?\s*=\s*null/,
  "android task api must expose cursor_updated_at for task list pagination",
);

for (const field of syncChangeFields) {
  assert.match(
    desktopTaskMapper,
    new RegExp(`\\b${escapeRegExp(field)}\\s*:`),
    `desktop toPushChange must map ${field}`,
  );
}

for (const field of localTaskFields.filter((field) => field !== "syncStatus" && field !== "lastSyncAt")) {
  assert.match(desktopTaskMapper, objectMappingPattern(field), `desktop serverTaskToLocal must map ${field}`);
}

for (const field of [
  "snoozedUntil",
  "parentTaskId",
  "isTemplate",
  "templateName",
  "sortOrder",
  "localUpdatedAt",
]) {
  assert.match(androidMappers, new RegExp(`\\b${field}\\b`), `android mapper must handle ${field}`);
}

console.log("contract drift check passed");

function assertFields(label, source, fields, patternBuilder) {
  for (const field of fields) {
    assert.match(source, patternBuilder(field), `${label} must include ${field}`);
  }
}

function assertRouteCoverage(label, source, entries) {
  for (const [routeLabel, pattern] of entries) {
    assert.match(source, pattern, `${label} must include ${routeLabel}`);
  }
}

function classBlock(source, className) {
  return blockUntilNextClass(source, `class ${className}`);
}

function interfaceBlock(source, interfaceName) {
  const marker = `interface ${interfaceName}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, `missing end of ${marker}`);
  return source.slice(start, end);
}

function dataClassBlock(source, className) {
  const marker = `data class ${className}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  const next = source.indexOf("\n\ndata class ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function blockUntilNextClass(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  const next = source.indexOf("\n\nclass ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function pythonFieldPattern(field) {
  return new RegExp(`^\\s{4}${escapeRegExp(field)}\\s*:`, "m");
}

function typeScriptFieldPattern(field) {
  return new RegExp(`\\b${escapeRegExp(field)}\\??\\s*:`);
}

function kotlinFieldPattern(field) {
  return new RegExp(`\\bval\\s+${escapeRegExp(field)}\\s*:`);
}

function objectMappingPattern(field) {
  return new RegExp(`\\b${escapeRegExp(field)}(?:\\s*:|\\s*[,}\\n])`);
}

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
