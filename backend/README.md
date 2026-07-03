# TaskBridge 后端服务

`backend/` 是 TaskBridge 的 FastAPI 后端，负责用户认证、设备管理、任务持久化、增量同步、WebSocket 通知和同步日志。

后端是云端权威数据源。Android 和 Windows 客户端都通过 HTTP API 与后端同步数据；WebSocket 只发送任务变化通知，不传输完整任务内容。

## 功能

- 用户注册、登录、刷新 Token 和当前用户查询。
- JWT Access Token、Refresh Token 和短期 WebSocket Ticket。
- 设备注册、设备列表和设备删除。
- 任务 CRUD、完成、恢复、软删除和彻底删除。
- 今日、收件箱、逾期、本周、高优先级、已完成、待同步、冲突和模板视图。
- 子清单、任务模板、重复任务、稍后提醒、计划日期、项目和标签。
- 批量操作、导入预览、导入导出、项目重命名、标签重命名和冲突处理。
- HTTP 增量同步、离线变更上传和同步日志。
- 产品事件上报和用户级行为汇总，用于分析关键功能使用情况。
- WebSocket 多设备通知、心跳和断线重连支持。
- 基础限流和自动化测试。
- 生产环境配置检查、设备绑定 Refresh Token 和 CSV 导出安全转义。

## 环境要求

- Python 3.11+
- MySQL 8.0+
- Redis 7+
- Docker Desktop（可选）

## 本地启动

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` 用于允许局域网设备访问后端。只监听 `127.0.0.1` 时，手机真机和其他电脑无法连接。

## Docker 启动

```powershell
cd backend
Copy-Item .env.docker.example .env
docker compose up --build
```

`backend/.env.docker.example` 包含 MySQL 容器初始化变量。容器启动时会先执行 `alembic upgrade head`，再启动 Uvicorn。

Docker Compose 中只有 API 端口对宿主机开放。MySQL 和 Redis 默认只在 Docker 内部网络可访问，避免把数据库直接暴露到外部网络。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `APP_NAME` | 应用名称 |
| `APP_VERSION` | 应用版本 |
| `ENVIRONMENT` | 运行环境 |
| `DATABASE_URL` | MySQL 连接字符串 |
| `REDIS_URL` | Redis 连接字符串 |
| `JWT_SECRET` | JWT 签名密钥，生产环境必须替换 |
| `JWT_ALGORITHM` | JWT 算法，默认 `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access Token 有效期 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh Token 有效期 |
| `WEBSOCKET_TICKET_EXPIRE_SECONDS` | WebSocket Ticket 有效期 |
| `REGISTRATION_ENABLED` | 是否允许公开注册，关闭后 `/api/v1/auth/register` 返回 403 |
| `METRICS_ENABLED` | 是否启用 `/metrics` |
| `METRICS_TOKEN` | 生产 / 预发环境启用指标时必须配置 |
| `TRUSTED_PROXY_IPS` | 允许提供 `X-Forwarded-For` / `X-Real-IP` 的反向代理 IP 或 CIDR |
| `WEB_CORS_ORIGINS` | Web/PWA 客户端允许访问 API 的 Origin，多个值用英文逗号分隔 |

`MYSQL_ROOT_PASSWORD`、`MYSQL_DATABASE`、`MYSQL_USER` 和 `MYSQL_PASSWORD` 只用于 Docker Compose 内置 MySQL 初始化。

生产环境建议：

- `ENVIRONMENT=production`
- `JWT_SECRET` 至少 32 位，使用随机生成值。
- 不要使用示例里的数据库密码。
- 不要把 `.env`、keystore、数据库文件或 Redis 数据目录提交到 Git。

## 数据库迁移

```powershell
cd backend
alembic upgrade head
```

生成新迁移：

```powershell
alembic revision --autogenerate -m "describe change"
```

主要数据表：

- `users`
- `refresh_tokens`
- `devices`
- `tasks`
- `sync_logs`

## API 文档

启动后端后访问：

```text
http://127.0.0.1:8000/docs
http://127.0.0.1:8000/redoc
```

核心接口：

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
POST /api/v1/auth/sessions/revoke-other-devices
DELETE /api/v1/auth/sessions/{session_id}
POST /api/v1/auth/ws-ticket

POST   /api/v1/devices/register
GET    /api/v1/devices
DELETE /api/v1/devices/{device_id}

GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/{task_id}
PUT    /api/v1/tasks/{task_id}
DELETE /api/v1/tasks/{task_id}
POST   /api/v1/tasks/{task_id}/complete
POST   /api/v1/tasks/{task_id}/undo-complete
POST   /api/v1/tasks/{task_id}/restore

GET  /api/v1/sync/pull?last_sync_time=...
POST /api/v1/sync/push
```

`POST /api/v1/sync/push` 支持安全重试：同一 `device_id + local_id + action + version` 且 payload 相同的变更会返回首次应用结果，不会重复写入。复用同一幂等键但更换 payload 会被拒绝；如果该变更已经落后于服务端版本，则按普通 `conflict` 返回服务端任务快照。

## WebSocket

推荐连接方式：

```text
POST /api/v1/auth/ws-ticket
WS   /ws/sync?ticket=<short_lived_ticket>&device_id=<device_id>
```

任务变化通知示例：

```json
{
  "event": "task_changed",
  "action": "updated",
  "task_id": 123,
  "version": 5,
  "server_time": "2026-05-17T12:00:00Z"
}
```

客户端收到通知后，应调用 `GET /api/v1/sync/pull` 拉取增量数据。

## 安全说明

- 所有业务接口按 Bearer Token 鉴权。
- 任务、父任务、同步日志和设备操作都按 `user_id` 做归属校验。
- Access Token 携带签发时的设备和 Refresh Token 会话声明；会话治理接口会校验当前会话仍然活跃。
- Refresh Token 绑定设备；删除设备会撤销该设备的 Refresh Token。
- 用户可以列出活跃 Refresh Token 会话，撤销单个会话，或一键撤销其他设备会话。
- WebSocket 推荐使用短期 Ticket 建连。
- CSV 导出会转义公式前缀，降低表格软件公式注入风险。
- 生产环境会拒绝默认 `JWT_SECRET` 和默认数据库密码。

## 测试

```powershell
cd backend
python -m pytest tests -q
python -m compileall -q app tests tools
python -m tools.openapi_contract --check
python -m ruff check app tests tools
```

修改路由、Schema、响应模型或鉴权声明后，运行 `python -m tools.openapi_contract --write` 刷新 `../shared/openapi.taskbridge.v1.json`，再用 `--check` 校验。统一本地验收 `..\scripts\check-local.ps1` 也会执行这一步。
