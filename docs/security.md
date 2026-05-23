# 安全说明

本文档说明 TaskBridge 当前版本的安全边界、默认防护和部署注意事项。这里不讨论明文传输问题；是否使用 HTTPS / WSS 取决于你的部署环境和反向代理配置。

## 后端

- 除注册、登录、刷新 Token 和健康检查外，业务接口默认需要 Bearer Token。
- 服务端以 `user_id` 作为数据隔离边界。任务查询、任务修改、父任务引用、同步日志和设备操作都必须校验归属。
- Refresh Token 保存在服务端，并绑定 `device_id`。
- 删除设备会撤销该设备关联的 Refresh Token。
- WebSocket 推荐使用短期 Ticket 建连，Ticket 有效期由 `WEBSOCKET_TICKET_EXPIRE_SECONDS` 控制。
- WebSocket 只发送变更通知，不发送完整任务内容。
- CSV 导出会转义公式前缀，降低表格软件公式注入风险。
- 生产环境启动时会拒绝默认 `JWT_SECRET` 和默认数据库密码。

## Android

- Release APK 必须使用正式签名。缺少签名配置时，`assembleRelease` 会失败。
- Release 构建默认关闭 Android backup。
- Token 使用加密存储。
- 分享导入 TaskBridge 备份时，需要识别备份格式并由用户确认后才写入本地数据。
- Widget 操作 receiver 不对外导出。

## Windows 桌面端

- Electron 主窗口和悬浮窗启用 `contextIsolation`，禁用 `nodeIntegration`，并启用 renderer sandbox。
- Preload 只暴露 `window.taskBridge` 受控接口。
- Renderer 不能直接写入 Token。登录、注册和刷新 Token 后由主进程保存。
- IPC handler 会校验调用方是否来自当前主窗口或悬浮窗。
- 备份导入限制文件大小、备份格式和导入条数，并会清洗字段长度。

## Docker 部署

- Release Compose 默认只暴露后端 API 端口 `8000`。
- MySQL 和 Redis 默认只在 Docker Compose 内部网络可访问。
- `.env` 必须修改 `MYSQL_ROOT_PASSWORD`、`MYSQL_PASSWORD` 和 `JWT_SECRET`。
- 不要把 `.env`、keystore、数据库卷、Redis 数据卷或本地配置提交到 Git。

## 发布检查

发布前至少运行：

```powershell
cd backend
python -m pytest tests -q
python -m compileall -q app tests

cd ..\desktop
npm run check:security-config
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
