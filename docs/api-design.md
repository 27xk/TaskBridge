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

## 认证接口

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
POST /api/v1/auth/ws-ticket
```

说明：

- Access Token 使用 JWT。
- Refresh Token 保存在服务端，并绑定 `device_id`。
- 删除设备会撤销该设备关联的 Refresh Token。
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
POST   /api/v1/tasks/batch
POST   /api/v1/tasks/projects/rename
POST   /api/v1/tasks/tags/rename
GET    /api/v1/tasks/trash?offset=0&limit=100
DELETE /api/v1/tasks/{task_id}/purge
```

常用查询参数：

| 参数 | 说明 |
| --- | --- |
| `q` | 标题、内容、项目或标签关键词 |
| `view` | 任务视图，例如 `today`、`inbox`、`overdue`、`week`、`high`、`completed`、`pending`、`conflict` |
| `status` | 任务状态 |
| `tag` | 标签 |
| `project` | 项目 |
| `list_type` | 清单类型 |
| `planned_date` | 计划日期 |
| `include_deleted` | 是否包含软删除任务 |
| `templates_only` | 是否只查询模板 |
| `offset` / `limit` | 分页参数 |

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
GET /api/v1/sync/status
```

`/health` 用于基础存活检查，`/api/v1/sync/status` 用于同步模块状态检查。
