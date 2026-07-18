# TaskBridge 开发说明

本文档面向维护者和开发者，覆盖本地启动、技术栈、Web/PWA 访问、连接端点和常用验证命令。普通用户只需要阅读 [普通用户快速开始](./user-quick-start.md)。

## 本机试用与自托管

本机试用请使用 `.env.local.example`；正式部署到公网或共享服务器时，再按 [部署说明](../deploy/README.md) 的生产配置替换密码、密钥和域名。

Compose 本机试用默认提供两个入口：

```text
Web/PWA：http://127.0.0.1:8080
后端 API：http://127.0.0.1:8000
```

使用 Release Compose 让手机或其他电脑访问时，普通客户端填写统一入口：

```text
http://192.168.1.10:8080
```

下面的 `8000` 地址只用于开发直连后端。高级连接端点通常不需要手动填写；直连时客户端会根据服务器根地址自动派生：

```text
http://192.168.1.10:8000/api/v1/
ws://192.168.1.10:8000/ws/sync
```

TaskBridge 支持 `http://` / `https://` API 地址，也支持 `ws://` / `wss://` 同步地址。公网环境建议使用 HTTPS / WSS 反向代理；如果你明确选择明文 HTTP / WS，Release 和客户端构建不会因为协议不是 TLS 而拒绝端点。浏览器在非本机明文 HTTP 下通常不允许 Service Worker 和 PWA 安装，但普通网页、HTTP API 和 WebSocket 仍可工作。

## 开发启动

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Android

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

连接本机模拟器后端：

```powershell
.\gradlew.bat :app:assembleDebug `
  -PTASKBRIDGE_BASE_URL=http://10.0.2.2:8000/api/v1/ `
  -PTASKBRIDGE_WS_URL=ws://10.0.2.2:8000/ws/sync
```

### Windows 桌面端

```powershell
cd desktop
npm ci
npm run dev
```

### Web/PWA

使用 Release Compose 时，直接打开 `http://127.0.0.1:8080`；其 Nginx 会同源转发 `/api/` 和 `/ws/`，不需要单独启动静态服务器。

只开发 Web 静态资源时可使用：

```powershell
# 先启动后端，再启动静态 Web 客户端
python -m http.server 8080 -d web
```

默认地址：

```text
http://127.0.0.1:8080
```

需要在后端设置允许的浏览器来源。仅本机试用可以使用 `WEB_CORS_ORIGINS=*`，方便手机、局域网电脑和 Web/PWA 同时访问开发后端；正式部署不要使用通配来源。

明确来源示例：

```text
WEB_CORS_ORIGINS=http://taskbridge.example.com
WEB_CORS_ORIGINS=https://taskbridge.example.com
```

Web/PWA 支持登录、注册、任务新建、编辑、完成、删除、恢复、搜索和同步状态查看。有效登录会话断网时，恢复联网后会自动同步；浏览器会话结束后可通过“继续离线使用”打开按“规范化 API 地址 + 用户 ID”隔离、且已写入 `cache_ready` 标记的 IndexedDB，并继续把修改写入队列，但恢复联网后必须重新登录才能上传。Windows 和 Android 在刷新会话被拒绝时也保留工作区身份，但会停止同步 Worker 和 WebSocket。旧版仅按用户 ID 分库的数据会迁移到当前服务器工作区。Web Token 只在 `sessionStorage`，`localStorage` 仅保存带 `api_base_url` 的最小离线身份摘要。

## 开发者技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 | Python 3.11、FastAPI、SQLAlchemy 2.x、Alembic、MySQL、Redis、JWT、Docker |
| Android | Kotlin、Jetpack Compose、Room、Retrofit、OkHttp WebSocket、WorkManager、DataStore、AppWidget |
| Web/PWA | 静态 HTML、CSS、JavaScript、Service Worker、Manifest、IndexedDB 离线队列 |
| Windows 桌面端 | Electron、Vue 3、TypeScript、Pinia、SQLite、轻量 JSON 配置、electron-builder |
| 同步 | HTTP 增量同步、同步队列、WebSocket 通知、任务版本控制、软删除 |

桌面端主题、悬浮窗、托盘、全局快捷键和本地提醒都属于 Windows 桌面端能力。

## 开发者常用验证命令

```powershell
# 首次拉取或依赖缺失时，先补齐本地验证依赖
.\scripts\bootstrap-local.ps1

# 本地统一验收入口；缺失依赖会在汇总中标记为 blocked 并让脚本失败
.\scripts\check-local.ps1

# 只生成报告，blocked 不会影响退出码
.\scripts\check-local.ps1 -ReportOnly

# 一条命令先补齐依赖再执行本地验证
.\scripts\check-local.ps1 -BootstrapMissing

# 完整验收；Android 需要本地 Gradle / SDK 缓存完整
.\scripts\check-local.ps1 -IncludeAndroid -IncludeAndroidAssemble
```

后端：

```powershell
cd backend
python -m pytest tests -q
python -m pytest tests/test_migrations.py -q
python -m compileall -q app tests tools
python -m tools.openapi_contract --check
python -m ruff check app tests tools
```

Android：

```powershell
cd android
.\gradlew.bat testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

Web/PWA：

```powershell
node scripts/check-version-source.mjs
node scripts/check-web-client.mjs
node scripts/check-web-offline-first.mjs
node scripts/check-web-offline-core.mjs
npm run test:web
node --test desktop/tests/ux-remediation.test.mjs
```

桌面端：

```powershell
cd desktop
npm run check:security-config
npm run check:auth-session-config
npm run check:backend-observability
npm run check:desktop-endpoint-config
npm run check:package-size-config
npm run test:unit
npm run check:quick-add-parser
npm run check:task-order
npm run check:sync-push
npm run check:sync-diagnostics
npm run check:sync-recovery-center
npm run check:desktop-backup
npm run check:desktop-theme
npm run check:desktop-efficiency
npm run check:ux-priority-polish
npm run check:user-experience
npm run check:desktop-docs
npm run check:release-readiness
npm run check:release-artifacts
npm run check:production-hardening
npm run check:android-sync-recovery
npm run check:ci-workflows
npm run check:contract-drift
npm run typecheck
npm run build
```
