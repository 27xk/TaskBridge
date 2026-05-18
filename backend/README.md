# TaskBridge 后端服务

本目录是 TaskBridge 的 FastAPI 后端服务，负责用户认证、任务管理、设备管理、增量同步、WebSocket 通知和同步日志记录。后端是任务数据的权威来源，Android 与 Windows 客户端都通过 HTTP API 与它同步数据。

## 当前能力

- FastAPI 应用与 OpenAPI 自动文档。
- `.env` 配置读取。
- SQLAlchemy 2.x ORM 与 MySQL 连接。
- Redis 连接、在线设备缓存和 WebSocket 状态辅助。
- bcrypt 密码哈希。
- JWT Access Token、Refresh Token 和 WebSocket 短期 Ticket。
- 注册、登录、刷新 Token 和当前用户接口。
- 设备注册、设备列表和设备删除。
- 任务 CRUD、软删除、回收站、彻底删除和用户隔离。
- 今日、收件箱、逾期、本周、高优先级、已完成、待同步、冲突和模板视图。
- 子清单、任务模板、重复任务、稍后提醒、计划日期、项目和标签。
- 批量操作、导入导出、项目和标签重命名、冲突处理。
- HTTP 增量同步、客户端离线变更上传和同步日志。
- WebSocket 同账号多设备通知、心跳和断线重连支持。
- 后端自动化测试。

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

`--host 0.0.0.0` 表示监听所有网卡，Android 真机和 Windows 桌面端才能通过局域网 IP 访问后端。如果只监听默认的 `127.0.0.1`，外部设备无法连接。

`backend/.env.example` 面向外部 MySQL / Redis。第一次启动前至少需要修改：

- `DATABASE_URL`：MySQL 连接地址。
- `REDIS_URL`：Redis 连接地址。
- `JWT_SECRET`：JWT 签名密钥，生产环境必须使用随机强密钥。

后端应用不会直接读取 `MYSQL_ROOT_PASSWORD`。如果使用外部 MySQL，只要 `DATABASE_URL` 指向正确的数据库用户即可。

外部 MySQL 使用前需要先创建数据库和业务用户。后端连接成功后不会自动创建数据库；表结构由 Alembic 管理，执行 `alembic upgrade head` 后会创建或升级 `users`、`tasks`、`devices`、`sync_logs` 等业务表。

OpenAPI 文档：

```text
http://127.0.0.1:8000/docs
http://127.0.0.1:8000/redoc
```

## Docker 启动

```powershell
cd backend
Copy-Item .env.docker.example .env
docker compose up --build
```

`backend/.env.docker.example` 才包含 `MYSQL_ROOT_PASSWORD`、`MYSQL_DATABASE`、`MYSQL_USER` 和 `MYSQL_PASSWORD`，这些变量只用于 Docker Compose 初始化内置 MySQL。容器启动时会先执行 `alembic upgrade head`，再启动 Uvicorn。

## 数据库迁移

初始化迁移：

```text
alembic/versions/20260517_0001_initial.py
```

同步日志扩展迁移：

```text
alembic/versions/20260517_0002_extend_sync_logs.py
```

模型变更后生成新迁移：

```powershell
alembic revision --autogenerate -m "描述本次变更"
alembic upgrade head
```

主要数据表：

- `users`
- `refresh_tokens`
- `devices`
- `tasks`
- `sync_logs`

## 核心接口

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
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
POST   /api/v1/tasks/{task_id}/restore
POST   /api/v1/tasks/batch
POST   /api/v1/tasks/import
GET    /api/v1/tasks/export

GET  /api/v1/sync/pull?last_sync_time=...
POST /api/v1/sync/push
```

同步接口示例见 [同步接口示例](./docs/sync-examples.md)。

## 统一响应结构

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误响应同样使用统一结构，`data` 为 `null`。

## WebSocket

推荐使用短期 Ticket 建立连接：

```text
POST /api/v1/auth/ws-ticket
WS   /ws/sync?ticket=<short_lived_ticket>&device_id=<device_id>
```

WebSocket 只发送任务变化通知，不同步完整任务数据。客户端收到通知后，应调用：

```text
GET /api/v1/sync/pull?last_sync_time=...
```

## 测试

```powershell
cd backend
python -m pytest tests -q
python -m compileall -q app tests
```
