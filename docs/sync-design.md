# 同步设计

TaskBridge 使用「HTTP 同步 + WebSocket 通知」的架构。

## 核心原则

- HTTP API 负责真实数据同步。
- WebSocket 只负责通知任务发生变化。
- WebSocket 消息不携带完整任务数据。
- 客户端收到通知后，调用 `GET /api/v1/sync/pull` 拉取增量。
- Android 后台不长期保活 WebSocket，后台同步使用 WorkManager。
- Windows 桌面端可以常驻 WebSocket。

## 服务端任务字段

任务核心字段：

- `id`
- `user_id`
- `title`
- `content`
- `status`
- `priority`
- `tag`
- `project`
- `planned_date`
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
8. 处理完成后通知同一用户下除当前设备外的在线设备。

## 幂等与回放

同步上传必须支持客户端安全重试。服务端以 `user_id + device_id + local_id + action + version` 识别一次客户端变更：

- 同一幂等键、同一 payload 重放时，服务端返回第一次成功应用后的任务结果，不重复创建任务，也不重复写成功日志。
- 同一幂等键但 payload 被篡改或队列项被错误复用时，`create` 会返回 `failed`，消息为 `idempotency key reused with different payload`。
- 同一幂等键的 `update` 已经落后于当前服务端版本时，服务端返回正常 `conflict` 和服务端任务快照，客户端按冲突流程处理。
- 客户端不应把 `local_id` 当成“可反复覆盖的草稿 ID”；如果要表达一条新的本地变更，必须使用新的队列项版本或在本地合并后再上传。

这条规则的回归测试在 `backend/tests/test_sync.py::test_sync_push_rejects_reused_idempotency_key_with_different_payload`，用于确保非法重放不会退化成数据库唯一约束错误。

Web 离线队列直接重放 `POST /api/v1/tasks` 时使用 `client_request_id`：队列项首次创建时生成，后续网络重试始终复用。服务端按 `user_id + client_request_id` 去重，并保存首次创建数据的摘要；相同数据返回原任务，不同数据返回 409。客户端收到非冲突永久失败时，只阻塞同一任务的依赖操作，其他无依赖队列项仍继续上传，并提供重试或放弃入口。

## 拉取流程

`GET /api/v1/sync/pull?last_sync_time=...` 返回服务端在该时间之后变化的任务。

响应字段：

- `changed_tasks`：新增或更新的任务。
- `deleted_tasks`：软删除任务。
- `server_time`：服务端当前时间，客户端保存为下一次拉取的 `last_sync_time`。
- `has_more`：是否还有下一页。
- `next_cursor_updated_at` / `next_cursor_id`：下一页游标。

客户端应分页拉取直到 `has_more=false`，每页都在本地事务中合并数据，并且只在最后一页合并成功后更新 `last_sync_time`。

## 冲突策略

当前版本使用 `version` 做乐观锁：

- 客户端 `version` 等于服务端 `version` 时，可以提交修改。
- 客户端 `version` 小于服务端 `version` 时，服务端返回冲突。
- 客户端将本地任务标记为 `conflict`，对比这台设备版本和同步来的版本，由用户选择保留哪一版。

后续可以扩展字段级合并，例如标题采用最新值、子清单按 item ID 合并。

## Android 同步策略

- App 前台可连接 WebSocket。
- App 后台不要求长期保持 WebSocket。
- WorkManager 在网络恢复后上传本地同步队列。
- App 启动后主动执行一次增量拉取。
- 小组件只读取本地 Room，不直接请求网络。
- 同步完成后刷新任务列表、提醒和小组件。

## Windows 同步策略

- 应用启动后建立 WebSocket 长连接。
- 断线后自动重连。
- 本地 SQLite 操作立即更新主窗口和悬浮窗。
- 网络可用时调用 `POST /api/v1/sync/push` 上传同步队列。
- 收到 WebSocket 通知后调用 `GET /api/v1/sync/pull`。
- 同步完成后通知主窗口和悬浮窗刷新。

## 会话失效与本机工作区

本机工作区不是独立账号体系。用户必须至少成功登录并同步一次，客户端才有可恢复的服务器、用户身份和本机任务缓存。

- Refresh Token 被服务器拒绝时，Windows 和 Android 只清除失效 Token，保留当前服务器与用户对应的工作区身份；Web 清除会话 Token，但保留不含凭据的最小身份摘要。
- Windows 和 Android 登录页提供“进入本机工作区”，Web 登录页提供“继续离线使用”。进入后可以查看、创建和修改本机任务，但不得启动同步 Worker、HTTP 上传或 WebSocket。
- 用户点击“登录并同步”并通过同一服务器账号重新认证后，客户端才恢复队列上传和远端拉取。
- 主动退出会清除工作区身份；切换服务器也必须清除旧身份，避免把任务写入错误的服务器工作区。
- 不存在已初始化缓存时不显示本机入口，避免把空工作区误认为已恢复数据。

## 异常处理

- **网络失败：** 保留本地同步队列，稍后重试。
- **Token 过期：** 先刷新 Token，再重试同步。
- **Refresh Token 终止失效：** 保留本地任务和队列，清除失效会话并进入重新登录状态；重新认证前不得继续上传。
- **设备未注册：** 先调用设备注册接口。
- **版本冲突：** 标记为 `conflict`，等待用户处理。
- **服务端失败：** 增加尝试次数，避免无限快速重试。

## 安全约束

- `POST /api/v1/sync/push` 会先校验 `device_id` 是否属于当前用户。
- 更新、删除、完成和恢复任务时，服务端只接受当前用户拥有的 `server_id`。
- 设置 `parent_task_id` 时，父任务必须属于当前用户且未删除。
- WebSocket 通知不携带完整任务内容，客户端必须通过鉴权后的 HTTP 拉取真实数据。
