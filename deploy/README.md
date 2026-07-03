# TaskBridge 一键部署

`deploy/` 提供面向普通用户和自托管用户的 Docker Compose 部署方式。默认使用 GitHub Container Registry 上的正式镜像，也可以切换到 Docker Hub 镜像。

这份文档只适合“还没有服务器地址，需要在本机试用或长期自托管”的用户。已经拿到 TaskBridge 服务器地址和账号的用户，不需要执行这里的 Docker 命令，直接回到客户端填写服务器地址并登录。

## 快速启动

先确认要走哪条路径：

- **本机试用：** 只在当前电脑或同一局域网里体验同步流程，使用下面的本机试用步骤。
- **长期自托管：** 准备长期使用、多人使用或公网访问，完成试用验证后继续看“配置”，替换密码、密钥、域名和 HTTPS 反向代理。

### 本机试用

如果只是先在本机体验完整同步流程，请先确认这条路径需要 Docker：

1. 确认已安装 Docker Desktop。
2. 复制 `.env.local.example` 为 `.env`，先不用改域名或反向代理。
3. 执行下面的启动命令。
4. 看到 `http://127.0.0.1:8000/ready` 返回可用后，在桌面端或 Web/PWA 中填写服务器根地址 `http://127.0.0.1:8000`。
5. 如果 Android 模拟器连接本机后端，服务器地址使用 `http://10.0.2.2:8000`；真机或另一台电脑请填写后端所在电脑的局域网 IP。

环境要求：

- 已安装 Docker Engine 或 Docker Desktop。
- `docker compose version` 可以正常执行。
- 服务器防火墙允许访问 API 端口 `8000`，或由 Nginx / Caddy 反向代理到该端口。

```bash
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge/deploy
cp .env.local.example .env
docker compose -f docker-compose.release.yml up -d
```

Windows PowerShell：

```powershell
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge\deploy
Copy-Item .env.local.example .env
docker compose -f docker-compose.release.yml up -d
```

本机试用示例使用 `ENVIRONMENT=development`，并设置 `WEB_CORS_ORIGINS=*`，方便手机、局域网电脑和 Web/PWA 同时访问开发后端。如果要部署到公网或共享服务器，请改用下面“配置”章节的生产示例，替换密码、密钥和域名，并把 `WEB_CORS_ORIGINS` 改为明确的 HTTPS Web 客户端来源，例如 `WEB_CORS_ORIGINS=https://taskbridge.example.com`。

启动后访问：

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/ready
```

`/health` 只表示 API 进程存活，`/ready` 会检查数据库和 Redis 连通性。Redis 不可用时 `/ready` 返回 503，并在响应体中标记 `degraded`。

### 验证客户端能登录

1. 打开 Web/PWA、桌面端或 Android 端。
2. 在登录页填写服务器根地址：本机桌面/Web 使用 `http://127.0.0.1:8000`；Android 模拟器使用 `http://10.0.2.2:8000`；手机或另一台电脑使用后端所在电脑的局域网 IP 或域名。
3. 直接登录或注册。登录会自动检查连接；“检查连接”只用于排查服务器地址。
4. 新建一条待办，刷新或切换到另一端确认能看到同一条任务。

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
- `METRICS_TOKEN`
- `REGISTRATION_ENABLED`
- `TASKBRIDGE_API_BIND`
- `WEB_CORS_ORIGINS`

如果 `ENVIRONMENT=production`，`JWT_SECRET` 必须是至少 32 位的随机字符串，且数据库密码不能使用默认值。

生产示例默认 `REGISTRATION_ENABLED=false`，避免部署后开放陌生账号注册；本机试用示例会打开注册，方便创建第一个账号。生产示例默认 `TASKBRIDGE_API_BIND=127.0.0.1:8000`，建议通过 Nginx / Caddy 对外提供 HTTPS；如果确实要直接暴露 API 端口，再改成 `8000` 或指定公网监听地址。
生成 `JWT_SECRET`：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 创建首个账号

生产环境关闭公开注册后，请先在后端容器内创建首个账号，再用客户端登录。交互式输入密码：

```bash
docker compose -f docker-compose.release.yml exec api python -m tools.create_user --username owner --email owner@example.com
```

自动化部署可以从标准输入传入密码，避免把密码直接写进命令历史：

```bash
printf '%s\n' 'replace-with-a-strong-password' | docker compose -f docker-compose.release.yml exec -T api \
  python -m tools.create_user --username owner --email owner@example.com --password-stdin
```

确认第一个账号能登录后，再保持 `REGISTRATION_ENABLED=false`。需要新增用户时，重复执行该命令或临时打开注册后再关闭。

`.env` 中的 `DATABASE_URL` 密码需要和 `MYSQL_PASSWORD` 保持一致。默认文件写法如下：

```text
MYSQL_PASSWORD=change-this-password
DATABASE_URL=mysql+pymysql://taskbridge:change-this-password@mysql:3306/taskbridge
```

如果你改了 `MYSQL_PASSWORD`，也要同步改 `DATABASE_URL` 里的密码。

## 客户端连接地址

客户端填写服务器根地址，例如：

```text
http://<服务器 IP 或域名>:8000
```

桌面端可以在设置页修改服务器地址，登录页也会保留首次连接入口。Android 端可以在登录 / 注册页直接填写服务器地址，也可以在设置页修改。客户端会自动派生请求地址和同步连接地址，保存后新的请求和同步连接会使用用户填写的服务器根地址。

构建时注入的地址会作为首次启动默认值，用户保存自己的服务器地址后会覆盖该默认值。

高级端点通常不需要手动填写。只有在反向代理把请求路径或同步路径分流到不同位置时，才需要展开高级端点并分别填写：

```text
http://<服务器 IP 或域名>:8000/api/v1/
ws://<服务器 IP 或域名>:8000/ws/sync
```

## HTTPS / WSS 反向代理

公网部署不要直接让客户端用明文 HTTP / WS 登录。建议在后端容器前放 Nginx 或 Caddy。客户端填写服务器根地址：`https://<域名>`。

客户端会自动派生请求地址和同步连接地址。只有需要手动配置高级端点时，才分别填写：

```text
https://<域名>/api/v1/
wss://<域名>/ws/sync
```

示例配置：

- [Nginx 示例](./nginx.taskbridge.conf.example)
- [Caddy 示例](./Caddyfile.taskbridge.example)

替换示例中的 `taskbridge.example.com` 和证书路径后，再把客户端默认服务器根地址改成对应的 HTTPS 域名。

## 生产运维

### 健康检查和监控指标

常用检查地址：

```text
http://<服务器 IP 或域名>:8000/health
http://<服务器 IP 或域名>:8000/ready
http://<服务器 IP 或域名>:8000/status
http://<服务器 IP 或域名>:8000/metrics
```

`/health` 只表示 API 进程存活，`/ready` 会检查数据库和 Redis 连通性。Redis 不可用时 `/ready` 返回 503，并在响应体中标记 `degraded`，让容器健康检查真正反映“是否可接流量”。如果只想查看降级详情而不触发健康检查失败，使用 `/status`。`/metrics` 输出 Prometheus 文本指标，建议只暴露给内网监控系统。

生产环境默认要求为 `/metrics` 配置 `METRICS_TOKEN`。采集时带上：

```text
Authorization: Bearer <METRICS_TOKEN>
```

### 可信代理

如果后端部署在 Nginx / Caddy 等反向代理之后，只有把代理出口 IP 或 CIDR 写入 `TRUSTED_PROXY_IPS` 后，后端才会信任 `X-Forwarded-For` / `X-Real-IP` 并用于限流。不要把它设置成开放网段，除非你明确知道入口链路只有可信代理。

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

推荐使用仓库内置脚本做在线一致性备份，脚本会通过 `mysqldump --single-transaction` 导出并 gzip 压缩：

```bash
cd deploy
./backup-mysql.sh
```

默认备份目录是 `deploy/backups`，默认保留 14 天。可以按需覆盖：

```bash
BACKUP_DIR=/data/taskbridge-backups BACKUP_RETENTION_DAYS=30 ./backup-mysql.sh
```

恢复会覆盖目标库中的同名表数据，必须显式确认：

```bash
TASKBRIDGE_RESTORE_CONFIRM=restore ./restore-mysql.sh ./backups/taskbridge-mysql-20260528T120000Z.sql.gz
```

恢复前请确认目标数据库为空，或先运行一次 `backup-mysql.sh` 备份现有数据。

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
