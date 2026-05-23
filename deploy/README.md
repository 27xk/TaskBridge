# TaskBridge 一键部署

`deploy/` 提供面向普通用户和自托管用户的 Docker Compose 部署方式。默认使用 GitHub Container Registry 上的正式镜像，也可以切换到 Docker Hub 镜像。

## 快速启动

环境要求：

- 已安装 Docker Engine 或 Docker Desktop。
- `docker compose version` 可以正常执行。
- 服务器防火墙允许访问 API 端口 `8000`，或由 Nginx / Caddy 反向代理到该端口。

```bash
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge/deploy
cp .env.example .env
docker compose -f docker-compose.release.yml up -d
```

启动后访问：

```text
http://127.0.0.1:8000/health
```

## 镜像来源

默认后端镜像：

```text
ghcr.io/27xk/taskbridge:latest
```

如需使用 Docker Hub，在 `.env` 中改为：

```text
TASKBRIDGE_BACKEND_IMAGE=27xk/taskbridge:latest
```

## 服务

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| `api` | `8000` | TaskBridge 后端 API，对宿主机开放 |
| `mysql` | 内部网络 | MySQL 数据库，默认不对宿主机开放 |
| `redis` | 内部网络 | Redis，默认不对宿主机开放 |

## 配置

复制并修改 `.env`：

```bash
cp .env.example .env
```

生产环境至少要修改：

- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `JWT_SECRET`

如果 `ENVIRONMENT=production`，`JWT_SECRET` 必须是至少 32 位的随机字符串，且数据库密码不能使用默认值。

生成 `JWT_SECRET`：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`.env` 中的 `DATABASE_URL` 密码需要和 `MYSQL_PASSWORD` 保持一致。默认文件写法如下：

```text
MYSQL_PASSWORD=change-this-password
DATABASE_URL=mysql+pymysql://taskbridge:change-this-password@mysql:3306/taskbridge
```

如果你改了 `MYSQL_PASSWORD`，也要同步改 `DATABASE_URL` 里的密码。

## 客户端连接地址

后端 API 路径需要带 `/api/v1/`：

```text
http://<服务器 IP 或域名>:8000/api/v1/
```

WebSocket 地址：

```text
ws://<服务器 IP 或域名>:8000/ws/sync
```

桌面端可以在设置页修改这两个地址。Android 端地址写入 APK，修改后需要重新构建。

## 更新

```bash
cd deploy
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

## 查看日志

```bash
docker compose -f docker-compose.release.yml logs -f api
```

## 数据库迁移

后端镜像启动时会自动执行：

```bash
alembic upgrade head
```

然后再启动 API 服务。正常部署不需要在 `api` 服务里额外配置 `command`。

如果你手动运行迁移，请使用完整命令：

```bash
docker compose -f docker-compose.release.yml run --rm api alembic upgrade head
```

不要只运行 `alembic`，否则会出现 `alembic: error: too few arguments`。

## 备份和恢复

备份 MySQL 数据卷前建议先停止服务，避免写入中的数据不一致：

```bash
docker compose -f docker-compose.release.yml down
```

最简单的备份方式是备份 Docker volume 所在目录，或使用 `mysqldump` 导出数据库：

```bash
docker compose -f docker-compose.release.yml exec mysql sh -c \
  'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > taskbridge.sql
```

恢复前请确认目标数据库为空，或先自行备份现有数据。

## 常见问题

### 容器启动后提示 `alembic: error: too few arguments`

通常是因为在容器平台里把 command 拆成了多行或只写了 `alembic`。正常部署不需要覆盖 `command`。如果必须手动填写，请使用完整 shell 命令：

```sh
sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

### 手机无法连接后端

检查客户端填写的地址是否是服务器 IP 或域名，而不是 `127.0.0.1`。对手机来说，`127.0.0.1` 指的是手机自己。

### 需要暴露 MySQL 或 Redis 调试

默认不建议暴露。如果只在本机调试，可以临时绑定到本机回环地址：

```yaml
ports:
  - "127.0.0.1:3306:3306"
```

调试结束后应移除该配置。

## 停止服务

```bash
docker compose -f docker-compose.release.yml down
```

如需删除数据卷：

```bash
docker compose -f docker-compose.release.yml down -v
```
