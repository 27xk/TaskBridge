# 同步设计

## 核心原则

TaskBridge 采用「HTTP 同步 + WebSocket 通知」的架构：

- HTTP API 负责真实数据同步。
- WebSocket 只负责通知任务发生变化。
- WebSocket 消息不携带完整任务数据。
- 客户端收到通知后，调用 `GET /api/v1/sync/pull` 拉取最新增量。
- Android 后台不长期保持 WebSocket，后台同步使用 WorkManager。
- Windows 桌面端可以常驻 WebSocket。

## 服务端数据模型

任务核心字段：

- `id`
- `user_id`
- `title`
- `content`
- `status`
- `priority`
- `tag`
- `due_time`
- `remind_time`
- `repeat_rule`
- `version`
- `is_deleted`
- `created_at`
- `updated_at`
- `deleted_at`

同步日志记录每次任务变更，主要用于审计、增量同步和排查问题。

## 客户端本地状态

客户端任务表额外维护：

- `local_id`
- `server_id`
- `sync_status`
- `local_updated_at`
- `last_sync_at`

`sync_status` 可选值：

- `synced`
- `pending_create`
- `pending_update`
- `pending_delete`
- `conflict`

待上传变更必须写入持久化同步队列，不能只保存在内存中。

## 上传流程

`POST /api/v1/sync/push` 接收客户端本地变更数组。

支持动作：

- `create`
- `update`
- `delete`
- `complete`
- `restore`

处理规则：

1. `create` 创建服务端任务，生成 `server_id`，`version` 从 1 开始。
2. `update` 先校验任务归属和 `version`，成功后递增 `version`。
3. `delete` 使用软删除，不物理删除。
4. `complete` 将任务状态改为 `completed`。
5. `restore` 恢复软删除任务。
6. 服务端统一使用自己的时间写入 `updated_at`。
7. 每条成功变更都会写入 `sync_logs`。
8. 处理完成后通知同一用户下除当前设备以外的在线设备。

## 拉取流程

`GET /api/v1/sync/pull?last_sync_time=...` 返回服务端在该时间之后变化的任务。

响应字段：

- `changed_tasks`：新增或更新的任务。
- `deleted_tasks`：软删除任务。
- `server_time`：服务端当前时间，客户端保存为下一次拉取的 `last_sync_time`。

客户端应在本地事务中合并数据，并且只在合并成功后更新 `last_sync_time`。

## 冲突策略

当前版本使用 `version` 做乐观锁：

- 客户端 `version` 等于服务端 `version` 时，可以提交修改。
- 客户端 `version` 小于服务端 `version` 时，服务端返回冲突。
- 客户端将本地任务标记为 `conflict`，由用户选择「采用云端」或「覆盖云端」。

后续可以扩展字段级合并，例如标题采用最新值、子清单按 item ID 合并。

## WebSocket 通知

连接方式：

```text
POST /api/v1/auth/ws-ticket
WS   /ws/sync?ticket=<short_lived_ticket>&device_id=<device_id>
```

心跳：

```text
ping
```

响应：

```json
{
  "event": "pong",
  "server_time": "2026-05-17T12:10:00Z"
}
```

任务变化通知：

```json
{
  "event": "task_changed",
  "action": "updated",
  "task_id": 123,
  "version": 5,
  "server_time": "2026-05-17T12:00:00Z"
}
```

客户端收到通知后只做一件事：调用增量拉取接口。

## Android 同步策略

- App 前台可以连接 WebSocket。
- App 后台不要求长期保持 WebSocket。
- WorkManager 在网络恢复后上传本地同步队列。
- App 启动后主动执行一次增量拉取。
- 小组件只读取本地 Room，不直接请求网络。
- 同步完成后刷新任务列表、提醒和小组件。

## Windows 同步策略

- 应用启动后建立 WebSocket 长连接。
- 断线后自动重连。
- 本地 SQLite 操作立即更新 UI 和悬浮窗。
- 网络可用时调用 `POST /api/v1/sync/push` 上传同步队列。
- 收到 WebSocket 通知后调用 `GET /api/v1/sync/pull`。
- 同步完成后通知主窗口和悬浮窗刷新。

## 异常处理

- 网络失败：保留本地同步队列，稍后重试。
- Token 过期：先刷新 Token，再重试同步。
- 设备未注册：先调用设备注册接口。
- 版本冲突：标记为 `conflict`，等待用户处理。
- 服务端返回失败：增加尝试次数，避免无限快速重试。
