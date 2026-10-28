# TaskBridge 一键部署

`deploy/` 提供面向普通用户和自托管用户的 Docker Compose 部署方式。默认使用 GitHub Container Registry 上的正式镜像，也可以切换到 Docker Hub 镜像。

这份文档适合本机试用或长期自托管。普通用户拿到 Web 入口或对应服务的发布包与账号后，直接打开客户端登录，不需要执行 Docker 命令或填写服务地址。

## 快速启动

先确认要走哪条路径：

- **本机试用：** 只在当前电脑或同一局域网里体验同步流程，使用下面的本机试用步骤。
- **长期自托管：** 准备长期使用、多人使用或公网访问，完成试用验证后继续看“配置”，替换密码、密钥、域名和反向代理；公网建议使用 HTTPS / WSS。

### 本机试用

如果只是先在本机体验完整同步流程，请先确认这条路径需要 Docker。推荐从 [GitHub Releases](https://github.com/27xk/TaskBridge/releases) 下载 `TaskBridge-<version>-deployment.zip`，解压后使用内置启动入口，不需要先安装 Git：

- **Windows：** 启动 Docker Desktop 后，双击 `deploy/start-local.cmd`。
- **Linux / macOS：** 启动 Docker 后，在解压目录运行 `sh deploy/start-local.sh`。

启动入口只会在 `.env` 不存在时复制本机试用模板，不会覆盖已有配置。它会启动容器并等待 `http://127.0.0.1:8080/ready`，确认就绪后才报告成功；Windows 会随后打开 Web 页面。

完整步骤：

1. 确认已安装 Docker Desktop。
2. 下载并解压 Release 部署包，或准备完整项目源码。
3. 使用上面的启动入口；需要手动控制时再复制 `.env.local.example` 为 `.env` 并执行下面的 Compose 命令。
4. 打开 `http://127.0.0.1:8080/ready` 确认服务可用，再访问 `http://127.0.0.1:8080` 打开 Web/PWA。
5. Web 直接使用当前入口；手机或另一台电脑可打开 `http://<运行服务电脑的局域网 IP>:8080`。Windows / Android 开发构建可配置对应测试地址，发布包需在构建时注入地址。

环境要求：

- 已安装 Docker Engine 或 Docker Desktop。
- `docker compose version` 可以正常执行。
- 服务器防火墙允许访问统一入口 `8080`。普通客户端不需要访问 `8000`；只有开发或高级 API 直连时才单独开放该端口。

```bash
# 源码方式；使用 Release 部署包时直接进入解压目录
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge/deploy
cp .env.local.example .env
docker compose -f docker-compose.release.yml up -d
```

Windows PowerShell：

```powershell
# 源码方式；使用 Release 部署包时直接进入解压目录
git clone https://github.com/27xk/TaskBridge.git
cd TaskBridge\deploy
Copy-Item .env.local.example .env
docker compose -f docker-compose.release.yml up -d
```

本机试用示例使用 `ENVIRONMENT=development`，并设置 `WEB_CORS_ORIGINS=*`，方便开发工具访问后端。内置 Web/PWA 使用同源入口，可通过 HttpOnly Cookie 自动恢复登录。若要部署到公网或共享服务器，请改用下面“配置”章节的生产示例，替换密码、密钥和域名，并把 `WEB_CORS_ORIGINS` 改为明确的 Web 客户端来源，例如 `WEB_CORS_ORIGINS=http://taskbridge.example.com` 或 `WEB_CORS_ORIGINS=https://taskbridge.example.com`。

启动后访问：

```text
http://127.0.0.1:8080
http://127.0.0.1:8080/health
http://127.0.0.1:8080/ready
```

`web` 容器直接提供静态客户端，并把 `/api/`、`/ws/`、`/health`、`/ready` 和 `/status` 转发到 `api` 容器。`/health` 只表示 API 进程存活，`/ready` 会检查数据库和 Redis 连通性。

### 验证客户端能登录

1. Web/PWA 访问 `http://127.0.0.1:8080`；桌面端或 Android 端从安装包打开。
2. Web 使用当前站点；Windows / Android 应安装已写入该服务地址的发布包。
3. 直接登录或注册；连接检查用于确认服务状态。
4. 新建一条待办，刷新或切换到另一端确认能看到同一条任务。

## 镜像来源

源码部署默认跟随最新后端镜像：

```text
ghcr.io/27xk/taskbridge:latest
```

如需使用 Docker Hub，在 `.env` 中改为：

```text
TASKBRIDGE_BACKEND_IMAGE=27xk/taskbridge:latest
```

GitHub Release 的 `TaskBridge-<version>-deployment.zip` 会把 `.env.example`、`.env.local.example` 和 Compose fallback 中的后端镜像固定为同一发布标签，例如 `ghcr.io/27xk/taskbridge:v0.1.8`。因此重新解压同一版本不会意外拉取未来的 `latest`。升级时请下载新版本部署包，或主动修改镜像标签。

## 服务

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| `web` | `8080` | Web/PWA 静态页面，并同源代理 API 和 WebSocket |
| `api` | `8000` | TaskBridge 后端 API，对宿主机开放 |
| `mysql` | 内部网络 | MySQL 数据库，默认不对宿主机开放 |
| `redis` | 内部网络 | Redis，默认不对宿主机开放 |

Release Compose 使用固定内部网段 `172.30.27.0/24`，其中 Web 反向代理固定为 `172.30.27.10`。默认 `TRUSTED_PROXY_IPS=172.30.27.10` 只信任这一个代理出口，避免其他容器伪造客户端转发地址；`FORWARDED_ALLOW_IPS=172.30.27.10` 让 Uvicorn 只从同一代理读取 `X-Forwarded-Proto`，从而在 HTTPS 反代下正确设置 Cookie 的 `Secure` 属性。

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
- `TASKBRIDGE_WEB_BIND`
- `WEB_CORS_ORIGINS`

如果 `ENVIRONMENT=production`，`JWT_SECRET` 必须是至少 32 位的随机字符串，且数据库密码不能使用默认值。

生产示例默认 `REGISTRATION_ENABLED=false`，避免部署后开放陌生账号注册；本机试用示例会打开注册，方便创建第一个账号。生产示例把 Web 和 API 分别绑定到 `127.0.0.1:8080`、`127.0.0.1:8000`，建议让 Nginx / Caddy 对外代理 Web 入口 `8080`；公网建议使用 HTTPS / WSS。如果确实要直接提供明文入口，再把 `TASKBRIDGE_WEB_BIND` 改成 `8080`。
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

### 忘记密码

Web、Windows 和 Android 登录页都会提示无法登录的用户联系服务器管理员。已登录用户可在客户端的账号安全入口修改密码；无法登录时，自托管管理员可以在后端容器内重置密码，命令执行后会同时撤销该账号全部登录会话：

```bash
docker compose -f docker-compose.release.yml exec api \
  python -m tools.reset_password --username-or-email owner@example.com
```

自动化环境可通过标准输入提供新密码，避免写入命令历史：

```bash
printf '%s\n' 'replace-with-a-strong-password' | docker compose -f docker-compose.release.yml exec -T api \
  python -m tools.reset_password --username-or-email owner@example.com --password-stdin
```

`.env` 中的 `DATABASE_URL` 密码需要和 `MYSQL_PASSWORD` 保持一致。默认文件写法如下：

```text
MYSQL_PASSWORD=change-this-password
DATABASE_URL=mysql+pymysql://taskbridge:change-this-password@mysql:3306/taskbridge
```

如果你改了 `MYSQL_PASSWORD`，也要同步改 `DATABASE_URL` 里的密码。

## 客户端连接地址

Release Compose 提供统一入口，Web/PWA 直接从此地址打开；Windows 和 Android 的发布配置指向同一服务：

```text
http://<服务器 IP 或域名>:8080
```

该入口已经代理 `/api/` 和 `/ws/`。普通用户不需要知道后端端口，也不需要分别配置 HTTP 和 WebSocket 地址。

发布版桌面和 Android 客户端固定使用构建时注入的 API / WebSocket 地址。服务入口变更后应重新构建并发布客户端；Debug 构建保留手动端点调试。

开发直连后端，或反向代理把请求路径和同步路径分流到不同位置时，在构建配置中分别指定：

```text
http://<服务器 IP 或域名>:8000/api/v1/
ws://<服务器 IP 或域名>:8000/ws/sync
```

## HTTP / WS 与 HTTPS / WSS 反向代理

客户端支持 HTTP / WS，也支持 HTTPS / WSS。公网部署建议在后端容器前放 Nginx 或 Caddy，并使用 HTTPS / WSS；本机试用、内网或明确接受明文传输的部署可以继续使用 HTTP / WS。

供 Web 访问及客户端构建使用的服务器入口例如：

```text
http://<服务器 IP 或域名>:8080
https://<域名>
```

发布构建的 API / WebSocket 参数应分别使用：

```text
http://<服务器 IP 或域名>:8000/api/v1/
ws://<服务器 IP 或域名>:8000/ws/sync
https://<域名>/api/v1/
wss://<域名>/ws/sync
```

示例配置：

- [Nginx 示例](./nginx.taskbridge.conf.example)
- [Caddy 示例](./Caddyfile.taskbridge.example)

示例反向代理把外部域名转发到 Compose Web 入口 `127.0.0.1:8080`，再由内层 Nginx 分发静态资源、API 和 WebSocket。替换域名和证书路径后，让用户从该域名打开 Web，并将相应 API / WebSocket 地址写入发布包。使用明文 HTTP / WS 时，不需要证书文件，但仍应确认网络边界和访问控制。

浏览器通常只允许 HTTPS、`localhost` 或 `127.0.0.1` 注册 Service Worker。通过 `http://192.168.x.x:8080` 访问时普通 Web、HTTP 和 WS 可以工作，但“安装为应用”和离线页面缓存可能被浏览器禁用；这是浏览器安全限制，不能由 TaskBridge 绕过。

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

如果后端部署在 Nginx / Caddy 等反向代理之后，只有把代理出口 IP 或 CIDR 写入 `TRUSTED_PROXY_IPS` 后，后端才会信任 `X-Forwarded-For` / `X-Real-IP` 并用于限流；还要把 Uvicorn 可直接连接到的代理 IP 写入 `FORWARDED_ALLOW_IPS`，才能正确识别 HTTPS 并签发带 `Secure` 的 Cookie。Release Compose 的内层 Web 代理固定使用 `172.30.27.10`，所以示例环境变量只信任该地址；内层 Nginx 会用实际连接地址重写客户端地址头，不接受客户端自行提供的 `X-Forwarded-For`。不要把这些变量设置成开放网段，除非你明确知道入口链路只有可信代理。

内层 Nginx 会保留外层代理提供的 `X-Forwarded-Proto`，用于把 HTTPS 状态传到后端。生产环境应保持 `.env.example` 中的 `TASKBRIDGE_WEB_BIND=127.0.0.1:8080`，只允许受控的外层代理访问该入口；外层代理必须像示例配置一样覆盖 `X-Forwarded-Proto`，不能透传客户端提交的同名请求头。只有本机试用或受控内网需要直接访问明文入口时，才把绑定改为 `8080`。

如果宿主机已有网络与 `172.30.27.0/24` 冲突，需要同时修改 `docker-compose.release.yml` 中的子网、各服务静态地址、`.env` 中的 `TRUSTED_PROXY_IPS` 和 `FORWARDED_ALLOW_IPS`，然后重新创建容器。不要只改其中一处。

## 更新

使用 Git 源码部署时，先更新仓库。Web 容器通过 bind mount 直接读取仓库中的 `web/`，只执行 `docker compose pull` 不会更新 Web/PWA 文件。

```bash
cd TaskBridge
git pull --ff-only
cd deploy
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

如果使用 GitHub Release 中的部署包，请先下载并解压新版部署包，再把原部署目录中的 `.env` 复制到新版 `deploy/` 目录，最后在新版目录中执行上面的两条 `docker compose` 命令。不要直接覆盖数据库备份；更新前建议先运行 `backup-mysql.sh`。

## 查看日志

```bash
docker compose -f docker-compose.release.yml logs -f api
```

查看 Web 入口和代理日志：

```bash
docker compose -f docker-compose.release.yml logs -f web
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

恢复演练使用独立入口：`python deploy/verify-backup.py <backup.sql.gz> --report drill.json`（在仓库根目录运行；部署包内使用 `python verify-backup.py ...`）。脚本先完整验证 gzip 和校验值，再在随机命名、无外部网络和端口、无持久卷的临时 MySQL 8.4 容器中恢复，记录表与行数、迁移版本和恢复耗时，最后删除本次容器。它不能选择已有服务器、容器或数据库，不会执行生产恢复。需要 Python 3.11+ 和 Docker，可按维护周期显式执行。

新同步时钟需要数据库迁移 `20261026_0014`。升级时先备份，再执行后端 `alembic upgrade head`；当前 Docker 启动入口会运行迁移。监控配置、告警与 Grafana 面板参见 [同步监控](./monitoring/README.md)。

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

检查手机打开的 Web 地址或 Android 发布包的内置地址是否指向服务器，而不是 `127.0.0.1`。对手机来说，`127.0.0.1` 指的是手机自己。

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

## 永久删除服务器数据

`down -v` 不是普通停止命令。它会删除 Compose 的 MySQL 和 Redis 数据卷，包括所有账号、服务器任务、会话和同步状态；客户端尚未同步的本机数据也不会自动恢复这些服务器记录。

执行前先运行 `./backup-mysql.sh`，并确认备份文件可读取。只有明确要重建空白服务器时才执行：

```bash
docker compose -f docker-compose.release.yml down -v
```

普通停止或重启只使用 `docker compose -f docker-compose.release.yml down` / `up -d`，不要附加 `-v`。
