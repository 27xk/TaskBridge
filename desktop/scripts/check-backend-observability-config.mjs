import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [
  mainSource,
  configSource,
  observabilitySource,
  redisSource,
  rateLimitSource,
  syncApiSource,
  syncSchemaSource,
  observabilityApiSource,
  observabilitySchemaSource,
  backendEnvSource,
  backendDockerEnvSource,
  deployEnvSource,
  dockerfileSource,
  apiDocsSource,
  securityDocsSource,
  deployDocsSource,
] = await Promise.all([
  readFile(resolve(repoRoot, "backend/app/main.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/core/config.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/core/observability.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/core/redis.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/core/rate_limit.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/sync.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/schemas/sync.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/api/v1/observability.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/app/schemas/observability.py"), "utf8"),
  readFile(resolve(repoRoot, "backend/.env.example"), "utf8"),
  readFile(resolve(repoRoot, "backend/.env.docker.example"), "utf8"),
  readFile(resolve(repoRoot, "deploy/.env.example"), "utf8"),
  readFile(resolve(repoRoot, "backend/Dockerfile"), "utf8"),
  readFile(resolve(repoRoot, "docs/api-design.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/security.md"), "utf8"),
  readFile(resolve(repoRoot, "deploy/README.md"), "utf8"),
]);

assert.match(
  mainSource,
  /install_observability\(application\)/,
  "FastAPI app must install observability middleware",
);
assert.match(mainSource, /@application\.get\("\/ready"/, "backend must expose a readiness endpoint");
assert.match(mainSource, /db\.execute\(text\("SELECT 1"\)\)/, "readiness endpoint must verify database access");
assert.match(mainSource, /redis_health_status\(\)/, "readiness endpoint must verify Redis access");
assert.match(mainSource, /"redis": redis_status/, "readiness endpoint must expose Redis health");
assert.match(mainSource, /status_code=200 if status_payload\["status"\] == "ready" else 503/, "readiness endpoint must fail closed with 503 when dependencies are degraded");
assert.match(mainSource, /@application\.get\("\/status"/, "backend must expose a non-gating status endpoint");
assert.match(mainSource, /def read_status\(db: Session = Depends\(get_db\)\)/, "status endpoint must reuse dependency health checks");
assert.match(mainSource, /@application\.get\("\/metrics"/, "backend must expose a metrics endpoint");
assert.match(mainSource, /render_prometheus_metrics\(\)/, "metrics endpoint must render Prometheus text metrics");
assert.match(mainSource, /authorize_metrics_request\(request\)/, "metrics endpoint must authorize requests before rendering metrics");
assert.match(mainSource, /compare_digest/, "metrics token validation must use constant-time comparison");
assert.match(configSource, /metrics_enabled:\s*bool\s*=\s*True/, "settings must expose METRICS_ENABLED");
assert.match(configSource, /metrics_token:\s*str\s*=\s*""/, "settings must expose METRICS_TOKEN");
assert.match(configSource, /trusted_proxy_ips:\s*str\s*=\s*""/, "settings must expose TRUSTED_PROXY_IPS");
assert.match(configSource, /METRICS_TOKEN must be configured/, "production runtime security must require METRICS_TOKEN when metrics are enabled");
assert.match(observabilitySource, /REQUEST_ID_HEADER\s*=\s*"X-Request-ID"/, "middleware must define X-Request-ID");
assert.match(observabilitySource, /taskbridge_http_requests_total/, "observability must expose HTTP request counters");
assert.match(observabilitySource, /taskbridge_http_error_responses_total/, "observability must expose HTTP error counters");
assert.match(observabilitySource, /taskbridge_http_request_duration_ms_sum/, "observability must expose request duration counters");
assert.match(observabilitySource, /taskbridge_http_request_duration_ms_bucket/, "observability must expose request duration histogram buckets");
assert.match(observabilitySource, /taskbridge_client_error_reports_total/, "observability must expose client error report counters");
assert.match(observabilitySource, /record_client_error_report/, "observability must count accepted client error reports");
assert.match(observabilitySource, /HTTP_REQUEST_DURATION_MS_BUCKETS/, "observability must define bounded histogram buckets");
assert.match(observabilitySource, /HTTP_METHOD_ALLOWLIST/, "observability must cap HTTP method label cardinality");
assert.match(observabilitySource, /__unmatched__/, "observability must group unmatched routes into one low-cardinality path");
assert.match(redisSource, /def redis_health_status/, "Redis helper must expose health status");
assert.match(redisSource, /\.ping\(\)/, "Redis health status must use PING");
assert.match(redisSource, /return "degraded"/, "Redis health status must degrade instead of hiding Redis failures");
assert.match(configSource, /_invalid_trusted_proxy_entries/, "settings must validate TRUSTED_PROXY_IPS entries in production");
assert.match(configSource, /network\.prefixlen == 0/, "production runtime security must reject open trusted proxy ranges");
assert.match(rateLimitSource, /def _redis_retry_after_seconds/, "rate limiting must compute Redis Retry-After from TTL");
assert.match(rateLimitSource, /ttl == 0[\s\S]*return 1/, "rate limiting must not extend expiring Redis buckets");
assert.match(syncApiSource, /@router\.get\("\/status"/, "sync router must expose module status");
assert.match(syncApiSource, /db\.execute\(text\("SELECT 1"\)\)/, "sync status must verify database access");
assert.match(syncApiSource, /redis_health_status\(\)/, "sync status must verify Redis access");
assert.match(syncApiSource, /"redis": redis_status/, "sync status must expose Redis health");
assert.match(syncApiSource, /"websocket": "enabled"/, "sync status must report websocket capability");
assert.match(syncApiSource, /"degraded"/, "sync status must report degraded WebSocket capability when Redis is unavailable");
assert.match(observabilityApiSource, /\/client-error/, "backend must expose a client error report endpoint");
assert.match(observabilityApiSource, /get_current_user/, "client error reports must require authentication");
assert.match(observabilityApiSource, /record_client_error_report/, "client error reports must update metrics");
assert.match(observabilityApiSource, /"request_id": request_id/, "client error reports must return request_id for correlation");
assert.match(observabilityApiSource, /"trace_id": payload\.trace_id/, "client error logs must include the client trace id");
assert.match(observabilitySchemaSource, /ClientErrorReport/, "backend must validate client error report payloads");
assert.match(observabilitySchemaSource, /max_length=4000/, "client error stack traces must be bounded");
assert.match(observabilitySchemaSource, /trace_id/, "client error reports must accept client-side trace ids");

for (const constant of ["SYNC_PUSH_MAX_CHANGES", "SYNC_PULL_DEFAULT_LIMIT", "SYNC_PULL_MAX_LIMIT"]) {
  assert.ok(syncSchemaSource.includes(constant), `sync schema must define ${constant}`);
  assert.ok(syncApiSource.includes(constant), `sync status and route config must reuse ${constant}`);
}

for (const header of [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
]) {
  assert.ok(observabilitySource.includes(header), `middleware must set ${header}`);
}

assert.match(
  dockerfileSource,
  /HEALTHCHECK[\s\S]*\/ready/,
  "backend Docker healthcheck must use /ready instead of the shallow /health endpoint",
);
assert.match(apiDocsSource, /GET \/ready/, "API docs must document the readiness endpoint");
assert.match(apiDocsSource, /GET \/metrics/, "API docs must document the metrics endpoint");
assert.match(apiDocsSource, /Authorization: Bearer <token>/, "API docs must document metrics token authentication");
assert.match(apiDocsSource, /`redis`/, "API docs must document Redis health status");
assert.match(apiDocsSource, /degraded/, "API docs must document degraded Redis status");
assert.match(apiDocsSource, /同步限额 `limits`/, "API docs must document sync status capabilities");
assert.match(securityDocsSource, /X-Request-ID/, "security docs must mention request trace headers");
assert.match(securityDocsSource, /Prometheus/, "security docs must mention metrics collection");
assert.match(securityDocsSource, /METRICS_TOKEN/, "security docs must mention metrics token protection");
assert.match(securityDocsSource, /TRUSTED_PROXY_IPS/, "security docs must mention trusted proxy configuration");
assert.match(deployDocsSource, /\/ready/, "deploy docs must explain the readiness endpoint");
assert.match(deployDocsSource, /Redis/, "deploy docs must explain Redis readiness behavior");
assert.match(deployDocsSource, /degraded/, "deploy docs must document degraded readiness status");
assert.match(deployDocsSource, /\/metrics/, "deploy docs must explain the metrics endpoint");
assert.match(deployDocsSource, /Authorization: Bearer <METRICS_TOKEN>/, "deploy docs must show metrics bearer token usage");

for (const [name, source] of [
  ["backend .env.example", backendEnvSource],
  ["backend .env.docker.example", backendDockerEnvSource],
  ["deploy .env.example", deployEnvSource],
]) {
  assert.match(source, /METRICS_ENABLED=/, `${name} must include METRICS_ENABLED`);
  assert.match(source, /METRICS_TOKEN=/, `${name} must include METRICS_TOKEN`);
  assert.match(source, /TRUSTED_PROXY_IPS=/, `${name} must include TRUSTED_PROXY_IPS`);
}

console.log("backend observability config check passed");
