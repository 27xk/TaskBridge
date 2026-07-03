# API 设计

本文档说明 TaskBridge 后端主要 HTTP API 和 WebSocket 入口。除注册、登录、刷新 Token 和健康检查外，业务接口默认需要 Bearer Token。

## 统一响应

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误响应：

```json
{
  "code": 40001,
  "message": "错误原因",
  "data": null
}
```

## OpenAPI 契约

后端运行时 OpenAPI 快照提交在 `shared/openapi.taskbridge.v1.json`。它不是手写文档，来源是 `app.main.create_app().openapi()`，用于让桌面端、Android、Web 和后端在同一个 API 契约上对齐。

修改路由、Schema、响应模型或鉴权声明后，在 `backend/` 运行：

```powershell
python -m tools.openapi_contract --write
python -m tools.openapi_contract --check
```

`scripts/check-local.ps1` 会自动检查快照是否和当前运行时 schema 一致。

## 认证接口

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
POST /api/v1/auth/sessions/revoke-other-devices
DELETE /api/v1/auth/sessions/{session_id}
POST /api/v1/auth/ws-ticket
```

当 `REGISTRATION_ENABLED=false` 时，`POST /api/v1/auth/register` 返回 403，用于关闭公开注册入口。

说明：

- Access Token 使用 JWT，并携带签发时的 `device_id` 和 Refresh Token 会话 ID；会话治理接口会校验该会话仍然活跃。
- Refresh Token 保存在服务端，并绑定 `device_id`。
- 删除设备会撤销该设备关联的 Refresh Token。
- 用户可以查看当前账号的活跃 Refresh Token 会话，撤销单个会话，或按当前 `device_id` 一键撤销其他设备会话。
- `POST /api/v1/auth/refresh` 建议传入当前设备的 `device_id`，旧 Token 首次刷新时会补齐设备绑定。
- WebSocket 建议使用短期 Ticket 建连，避免在 URL 中暴露长期 Access Token。

注册请求示例：

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "password123",
  "device_id": "android-001"
}
```

刷新 Token 请求示例：

```json
{
  "refresh_token": "<refresh_token>",
  "device_id": "android-001"
}
```

## 设备接口

```text
POST   /api/v1/devices/register
GET    /api/v1/devices
DELETE /api/v1/devices/{device_id}
```

客户端登录后应注册稳定的 `device_id`。同步和 WebSocket 都使用 `device_id` 判断变更来源，避免把自己发起的变更再次通知给自己。

## 任务接口

基础任务：

```text
GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/{task_id}
PUT    /api/v1/tasks/{task_id}
DELETE /api/v1/tasks/{task_id}
```

任务状态：

```text
POST /api/v1/tasks/{task_id}/complete
POST /api/v1/tasks/{task_id}/undo-complete
POST /api/v1/tasks/{task_id}/restore
POST /api/v1/tasks/{task_id}/postpone
POST /api/v1/tasks/{task_id}/snooze
POST /api/v1/tasks/{task_id}/plan
```

直接写接口支持 `expected_version` 乐观锁；如果客户端带着旧版本提交，服务端返回 `409 version conflict`，避免浏览器或其他直连客户端静默覆盖新改动。`/sync/push` 仍然保留既有的 `version` 字段协议，不与直接写接口混用。

高级能力：

```text
POST /api/v1/tasks/{task_id}/next-occurrence
GET  /api/v1/tasks/{task_id}/history?offset=0&limit=200
POST /api/v1/tasks/{task_id}/resolve-conflict
```

批量和数据管理：

```text
GET    /api/v1/tasks/meta
GET    /api/v1/tasks/export?format=json
GET    /api/v1/tasks/export?format=csv
POST   /api/v1/tasks/import
POST   /api/v1/tasks/import/preview
POST   /api/v1/tasks/batch
POST   /api/v1/tasks/projects/rename
POST   /api/v1/tasks/tags/rename
GET    /api/v1/tasks/trash?offset=0&limit=100
DELETE /api/v1/tasks/{task_id}/purge
```

常用查询参数：

| 参数 | 说明 |
| --- | --- |
| `q` | 标题、内容、项目或标签关键词；多个空白分隔词按 AND 匹配，`%` 和 `_` 按普通字符处理 |
| `view` | 任务视图，例如 `today`、`inbox`、`overdue`、`week`、`high`、`completed`、`pending`、`conflict` |
| `status` | 任务状态 |
| `tag` | 标签 |
| `project` | 项目 |
| `list_type` | 清单类型 |
| `planned_date` | 计划日期 |
| `include_deleted` | 是否包含软删除任务 |
| `templates_only` | 是否只查询模板 |
| `offset` / `limit` | 分页参数 |
| `cursor_id` / `cursor_updated_at` | 任务列表游标分页参数；必须成对传入，且不能和 `offset` 混用 |

`GET /api/v1/tasks` 保持原有数组响应，客户端需要下一页时使用上一页最后一条任务的 `id` 和 `updated_at` 作为 `cursor_id` / `cursor_updated_at`，并沿用同一组过滤参数和 `now`。服务端按任务时间线排序元组做 keyset 翻页；如果 cursor 已被其他设备更新或不属于当前用户，会返回 `400 invalid task cursor`，客户端应重新拉取第一页。

任务删除默认使用软删除，确保离线设备重新上线后也能收到删除变更。

CSV 导出会对 `=`, `+`, `-`, `@` 等表格公式前缀做转义，降低用 Excel 等表格软件打开时的公式注入风险。

## 同步接口

```text
GET  /api/v1/sync/pull?last_sync_time=2026-05-17T12:00:00Z
POST /api/v1/sync/push
GET  /api/v1/sync/status
```

说明：

- `pull` 根据 `last_sync_time` 返回之后发生变化的任务，并通过 `limit`、`cursor_updated_at`、`cursor_id` 支持分页拉取。客户端应在 `has_more=false` 后再保存新的 `server_time`。
- `push` 接收客户端离线期间产生的变更。
- `status` 会执行数据库和 Redis 探测，并返回 `database`、`redis`、`websocket`、`server_time` 和同步限额 `limits`，用于客户端诊断同步模块是否真实可用。Redis 不可用时 `status` 和 `websocket` 会报告 `degraded`。
- 每次成功修改任务，服务端更新 `updated_at` 并递增 `version`。
- 冲突时返回服务端任务快照，客户端本地状态标记为 `conflict`。

## WebSocket

推荐连接方式：

```text
POST /api/v1/auth/ws-ticket
WS   /ws/sync?ticket=<short_lived_ticket>&device_id=<device_id>
```

WebSocket 只发送通知，不同步完整任务内容。客户端收到 `task_changed` 后，应主动调用 `GET /api/v1/sync/pull`。

连接时服务端会同时校验 Ticket 或 Access Token，以及 `device_id` 是否属于当前用户。

通知示例：

```json
{
  "event": "task_changed",
  "action": "updated",
  "task_id": 123,
  "version": 5,
  "server_time": "2026-05-17T12:00:00Z"
}
```

## 健康检查

```text
GET /health
GET /ready
GET /status
GET /metrics
GET /api/v1/sync/status
POST /api/v1/analytics/events
GET /api/v1/analytics/summary?days=30
```

`/health` 用于基础存活检查，`/ready` 用于数据库和 Redis 就绪检查；Redis 降级时 `/ready` 返回 503，适合作为容器 readiness。`/status` 返回同样的依赖状态但保持 200，适合监控面板读取降级详情。`/metrics` 用于 Prometheus 文本指标采集并暴露请求耗时直方图，`/api/v1/sync/status` 用于同步模块状态和限额检查。配置 `METRICS_TOKEN` 后，请求 `/metrics` 必须携带 `Authorization: Bearer <token>`。

`/api/v1/analytics/events` 接收已登录客户端的产品行为事件，事件名使用小写下划线格式，例如 `task_created`、`task_completed`。`/api/v1/analytics/summary` 返回当前用户在指定天数内按事件名和客户端来源聚合的汇总，用于判断功能是否真的被使用，而不是只看服务是否存活。
