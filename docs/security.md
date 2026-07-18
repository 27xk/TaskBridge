# 安全说明

本文档说明 TaskBridge 当前版本的安全边界、默认防护和部署注意事项。这里不讨论明文传输问题；是否使用 HTTPS / WSS 取决于你的部署环境和反向代理配置。

## 后端

- 除注册、登录、刷新 Token 和健康检查外，业务接口默认需要 Bearer Token。
- 服务端以 `user_id` 作为数据隔离边界。任务查询、任务修改、父任务引用、同步日志和设备操作都必须校验归属。
- Access Token 携带签发时的设备和 Refresh Token 会话声明；会话治理接口会校验当前会话仍然活跃，避免已撤销会话继续管理其他设备。
- Refresh Token 保存在服务端，并绑定 `device_id`。
- 删除设备会撤销该设备关联的 Refresh Token。
- 用户可以列出活跃 Refresh Token 会话，撤销单个会话，或按当前设备撤销其他设备会话。
- 用户修改密码时必须提供当前密码，成功后撤销其他活跃会话；管理员重置密码会撤销该账号全部会话。
- WebSocket 推荐使用短期 Ticket 建连，Ticket 有效期由 `WEBSOCKET_TICKET_EXPIRE_SECONDS` 控制。
- WebSocket 只发送变更通知，不发送完整任务内容。
- 每个响应都会附带 `X-Request-ID`，用于日志关联和故障排查。
- 默认会写入基础安全响应头，减少浏览器端误用和嵌入风险。
- `/metrics` 暴露 Prometheus 文本指标，至少包含按 method / path / status 标记的 HTTP 请求量、错误响应量和请求耗时直方图；生产或预发环境如果启用指标，必须配置 `METRICS_TOKEN`，采集时使用 `Authorization: Bearer <token>`。
- `/api/v1/observability/client-error` 接收已登录客户端的错误上报，并在 `/metrics` 中计入 `taskbridge_client_error_reports_total`；上报载荷应包含客户端版本、路由、`trace_id`、在线状态、页面可见性、浏览器类型和脱敏后的错误堆栈，响应中的 `request_id` 用于和服务端日志关联。上报前会移除查询参数、hash、令牌和 token 类字段，避免把完整链接或认证信息写入日志。
- Web/PWA 的 `access_token` 和 `refresh_token` 都只保存在 `sessionStorage`，不会写入 `localStorage`。任务草稿也仅保存在当前浏览器会话中，避免长期落盘保存用户可能输入的敏感内容。
- 为提供“继续离线使用”，Web/PWA 会在 `localStorage` 保存最小离线身份摘要 `{id, username, email, api_base_url}`，仅用于选择“规范化 API 地址 + 用户 ID”对应的 IndexedDB；摘要不包含 Token、密码、角色或权限信息。这样可避免同一浏览器连接两套服务器、且两边用户 ID 相同时混用缓存。主动退出或清除此设备数据会删除该摘要。
- 离线恢复入口只会在摘要中的服务器与当前连接地址一致、对应 IndexedDB 已存在且写入 `cache_ready` 标记后显示。升级时会把旧版仅按用户 ID 命名的数据库迁移到当前服务器工作区，迁移完成后删除旧库。
- “继续离线使用”只允许读取本机缓存并把修改写入本机队列，不代表恢复了在线身份。网络恢复后必须重新登录，队列才会发送到服务器。
- Web/PWA 的任务快照和离线队列保存在浏览器 IndexedDB 中，并按规范化 API 地址和用户 ID 隔离。共享设备上的其他本机用户或具有浏览器配置访问权限的人可能读取这些数据；在公共设备上使用后应先确认队列已同步，再执行“清除此设备数据”。
- Web/PWA 的生产静态托管应使用 HTTP 响应头下发 CSP 和基础安全头，参考 `web/_headers.example`；`web/index.html` 不再内嵌开发 CSP，避免把 `localhost` / `127.0.0.1` 连接策略误带到公开站点。
- 限流默认只信任直连客户端 IP；只有 `TRUSTED_PROXY_IPS` 命中的反向代理才能提供 `X-Forwarded-For` / `X-Real-IP`。
- CSV 导出会转义公式前缀，降低表格软件公式注入风险。
- 生产环境启动时会拒绝默认 `JWT_SECRET` 和默认数据库密码。

- `REGISTRATION_ENABLED=false` 可以关闭公开注册入口，适合已经完成首个账号初始化、邀请制或内网受控部署；关闭后 `/api/v1/auth/register` 返回 403。

## Android

- 本地 `assembleRelease` 缺少签名配置时会生成 unsigned release APK，不会回退到 debug signing；公开 Release 只上传通过 `apksigner` 校验的 APK，未配置签名时省略该文件。
- Release 构建默认关闭 Android backup；Manifest 同时声明 `dataExtractionRules` 和 `fullBackupContent`，即使 debug 或测试构建允许备份，也会排除 `taskbridge_secure_tokens`、`taskbridge_device`、`taskbridge_sync`、`taskbridge.db` 和 `cache/exports` 等敏感或可恢复数据。
- Token 使用加密存储。
- Refresh Token 被服务器拒绝时只清除当前工作区的加密 Token，保留工作区 ID 供用户明确选择本机模式；主动退出和切换服务器仍会清除工作区身份。没有 Access Token 时，WorkManager、即时同步和 WebSocket 都会停止。
- 分享导入 TaskBridge 备份时，需要识别备份格式并由用户确认后才写入本地数据。
- Widget 操作 receiver 不对外导出。

## Windows 桌面端

- Electron 主窗口和悬浮窗启用 `contextIsolation`，禁用 `nodeIntegration`，并启用 renderer sandbox。
- Preload 只暴露 `window.taskBridge` 受控接口。
- Renderer 不能直接写入 Token。登录、注册和刷新 Token 后由主进程保存。
- Token 只通过 Electron `safeStorage` 加密保存；如果系统安全存储不可用，不会回退到明文保存 Token，旧明文 Token 会在可加密时迁移，否则清除。
- 刷新会话失效时主进程只删除 `safeStorage` Token，保留当前用户 ID 和服务器工作区，避免本机编辑误写入 `signed-out` 数据库；主动退出或切换服务器会完整清除身份。
- IPC handler 会校验调用方是否来自当前主窗口或悬浮窗。
- 备份导入限制文件大小、备份格式和导入条数，并会清洗字段长度。
- 公开 Release 只上传 Authenticode 状态为 `Valid` 的安装包；未配置证书时省略 Windows 下载文件。

## Docker 部署

- Release Compose 提供 Web 入口 `8080`，并由该入口同源代理 `/api/` 和 `/ws/`；后端 API 端口 `8000` 仍可通过 `TASKBRIDGE_API_BIND` 限制为仅本机访问。
- MySQL 和 Redis 默认只在 Docker Compose 内部网络可访问。
- `.env` 必须修改 `MYSQL_ROOT_PASSWORD`、`MYSQL_PASSWORD`、`JWT_SECRET` 和生产指标用的 `METRICS_TOKEN`。
- 不要把 `.env`、keystore、数据库卷、Redis 数据卷或本地配置提交到 Git。
- HTTP / WS 连接不需要证书，适合本机或受控内网；客户端不会强制升级为 HTTPS / WSS。选择 HTTPS / WSS 时仍使用平台默认的证书和主机名校验，不会安装“信任所有证书”的实现。

## 发布检查

发布前至少运行：

```powershell
cd backend
python -m pytest tests -q
python -m compileall -q app tests

cd ..\desktop
npm run check:security-config
npm run check:auth-session-config
npm run check:backend-observability
npm run check:desktop-endpoint-config
npm run build
```

Android Release 还需要确认 GitHub Secrets：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Docker Hub 同步发布需要确认：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
