# 同步接口示例

本文档给出 TaskBridge 同步接口的请求和响应示例。同步原则是：HTTP API 负责真实数据同步，WebSocket 只负责通知。

## 拉取增量变化

请求：

```http
GET /api/v1/sync/pull?last_sync_time=2026-05-17T12:00:00Z
Authorization: Bearer <access_token>
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "changed_tasks": [
      {
        "id": 123,
        "user_id": 1,
        "title": "准备发布版本",
        "content": "检查 Android 与 Windows 同步流程",
        "status": "todo",
        "priority": 2,
        "tag": "release",
        "project": "work",
        "list_type": "today",
        "due_time": null,
        "remind_time": null,
        "repeat_rule": null,
        "planned_date": "2026-05-17",
        "completed_at": null,
        "snoozed_until": null,
        "parent_task_id": null,
        "checklist": [],
        "is_template": false,
        "template_name": null,
        "sort_order": 0,
        "version": 4,
        "is_deleted": false,
        "created_at": "2026-05-17T10:00:00",
        "updated_at": "2026-05-17T12:05:00",
        "deleted_at": null
      }
    ],
    "deleted_tasks": [],
    "server_time": "2026-05-17T12:10:00Z",
    "has_more": false,
    "next_cursor_updated_at": null,
    "next_cursor_id": null
  }
}
```

客户端应保存 `server_time`，作为下一次拉取的 `last_sync_time`。如果 `has_more` 为 `true`，客户端需要保持同一个 `last_sync_time`，携带 `next_cursor_updated_at` 和 `next_cursor_id` 继续拉取下一页；只有最后一页合并成功后才保存新的 `server_time`。

## 上传离线变更

请求：

```http
POST /api/v1/sync/push
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "device_id": "android-001",
  "changes": [
    {
      "local_id": "local-uuid-1",
      "server_id": null,
      "action": "create",
      "title": "购买牛奶",
      "content": "两瓶",
      "status": "todo",
      "priority": 1,
      "tag": "home",
      "project": "life",
      "list_type": "today",
      "due_time": null,
      "remind_time": null,
      "repeat_rule": null,
      "planned_date": "2026-05-17",
      "completed_at": null,
      "snoozed_until": null,
      "parent_task_id": null,
      "checklist": [],
      "is_template": false,
      "template_name": null,
      "sort_order": 0,
      "version": 0,
      "local_updated_at": "2026-05-17T12:00:00Z"
    }
  ]
}
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "results": [
      {
        "local_id": "local-uuid-1",
        "server_id": 123,
        "action": "create",
        "status": "applied",
        "version": 1,
        "message": null,
        "task": {
          "id": 123,
          "user_id": 1,
          "title": "购买牛奶",
          "content": "两瓶",
          "status": "todo",
          "priority": 1,
          "tag": "home",
          "project": "life",
          "list_type": "today",
          "due_time": null,
          "remind_time": null,
          "repeat_rule": null,
          "planned_date": "2026-05-17",
          "completed_at": null,
          "snoozed_until": null,
          "parent_task_id": null,
          "checklist": [],
          "is_template": false,
          "template_name": null,
          "sort_order": 0,
          "version": 1,
          "is_deleted": false,
          "created_at": "2026-05-17T12:10:00",
          "updated_at": "2026-05-17T12:10:00",
          "deleted_at": null
        },
        "server_task": null
      }
    ],
    "server_time": "2026-05-17T12:10:00Z"
  }
}
```

客户端收到 `status: "applied"` 后，应把本地任务标记为 `synced`，并保存服务端返回的 `server_id` 和 `version`。

## 冲突响应

当客户端提交的 `version` 小于服务端当前版本时，服务端返回冲突项：

```json
{
  "local_id": "local-uuid-1",
  "server_id": 123,
  "action": "update",
  "status": "conflict",
  "version": 5,
  "message": "version conflict",
  "task": null,
  "server_task": {
    "id": 123,
    "user_id": 1,
    "title": "购买牛奶和面包",
    "content": "两瓶牛奶，一袋吐司",
    "status": "todo",
    "priority": 1,
    "tag": "home",
    "project": "life",
    "list_type": "today",
    "due_time": null,
    "remind_time": null,
    "repeat_rule": null,
    "planned_date": "2026-05-17",
    "completed_at": null,
    "snoozed_until": null,
    "parent_task_id": null,
    "checklist": [],
    "is_template": false,
    "template_name": null,
    "sort_order": 0,
    "version": 5,
    "is_deleted": false,
    "created_at": "2026-05-17T12:10:00",
    "updated_at": "2026-05-17T12:30:00",
    "deleted_at": null
  }
}
```

客户端应将本地任务标记为 `conflict`，并提供两个处理入口：

- 采用云端：丢弃本地待同步变更，使用服务端数据。
- 覆盖云端：重新上传本地版本，由服务端生成新版本。

## WebSocket 连接

先获取短期 Ticket：

```http
POST /api/v1/auth/ws-ticket
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "device_id": "windows-001"
}
```

再建立 WebSocket 连接：

```text
ws://127.0.0.1:8000/ws/sync?ticket=<short_lived_ticket>&device_id=windows-001
```

服务端会校验 Ticket 对应用户和 `device_id` 是否匹配。设备未注册时连接会被关闭。

## 心跳

客户端发送：

```text
ping
```

服务端响应：

```json
{
  "event": "pong",
  "server_time": "2026-05-17T12:10:00Z"
}
```

## 任务变化通知

```json
{
  "event": "task_changed",
  "action": "updated",
  "task_id": 123,
  "version": 5,
  "server_time": "2026-05-17T12:00:00Z"
}
```

收到通知后，客户端必须调用：

```http
GET /api/v1/sync/pull?last_sync_time=<client_last_sync_time>
Authorization: Bearer <access_token>
```

WebSocket 通知不能作为最终数据来源。
