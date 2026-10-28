# 脚本目录

`scripts/` 负责仓库级开发工具和跨端检查。`checks/` 放置跨端契约、后端和 Android 配置、CI、发布与安全治理检查；`lib/` 放置共用源码解析和路径工具。桌面专用构建、运行时检查和 Electron 辅助脚本保留在 `desktop/scripts/`。

仓库检查从根目录运行 `npm run check:<名称>`。桌面包保留同名代理，已有 `npm --prefix desktop run check:<名称>` 和 CI 命令继续可用。脚本根据自身位置解析仓库路径，不依赖调用时所在目录。

## 当前脚本

| 文件 | 说明 |
| --- | --- |
| `bootstrap-local.ps1` | 安装本地验证所需的后端、桌面端和可选 Android 依赖 |
| `check-local.ps1` | 运行本地统一验收，汇总通过、失败、阻塞和跳过的检查 |
| `check-version-source.mjs` | 校验根目录 `VERSION` 与后端、桌面端、Android、Web 和 release workflow 版本一致 |
| `backend/tools/openapi_contract.py` | 从 FastAPI 运行时导出 `shared/openapi.taskbridge.v1.json`，并检查 OpenAPI 契约漂移 |
| `npm run test:web` | 运行 Web/PWA Node 单元测试，覆盖离线核心真实行为 |
| `check-web-client.mjs` | 检查 Web/PWA 静态客户端、任务列表 cursor 分页、后端 CORS 和 CI 守门是否齐全 |
| `check-web-offline-first.mjs` | 检查 Web/PWA 是否按服务器与用户隔离 IndexedDB、校验缓存就绪标记、迁移旧库、对账远端快照，并守卫离线队列、文档和 CI |
| `check-web-offline-core.mjs` | 执行 Web/PWA 离线核心行为回归，覆盖本地任务、视图过滤、冲突状态和本地统计 |
| `smoke-web-client.mjs` | 启动随机端口本地 HTTP 服务，检查 Web/PWA shell 和静态资源能被真实 HTTP 访问 |
| `clean-local.ps1` | 清理本地生成文件和缓存，支持 `-DryRun` 和 `-All` |
| `checks/` | 仓库与跨端守门脚本，根 `package.json` 提供正式 npm 入口 |
| `lib/script-helpers.mjs` | 共用源码解析、换行规范化、日志检查和仓库路径工具 |
| `npm run check:architecture` | 检查桌面、后端和 Android 的依赖边界 |
| `npm run test:tooling` | 运行仓库工具与架构守门的行为测试 |

示例：

```powershell
# 首次拉取或本地依赖缺失时，先执行 bootstrap
.\scripts\bootstrap-local.ps1

# 运行后端和桌面端主要守门检查；缺失依赖会标记为 blocked 并让脚本失败
.\scripts\check-local.ps1

# 直接从根目录检查跨端契约、用户体验和架构边界
npm run check:contract-drift
npm run check:user-experience
npm run check:architecture
npm run test:tooling

# 只生成报告，blocked 不会影响退出码
.\scripts\check-local.ps1 -ReportOnly

# 先执行 bootstrap-local.ps1，再运行统一验证
.\scripts\check-local.ps1 -BootstrapMissing

# 同时运行 Android 离线单元测试
.\scripts\check-local.ps1 -IncludeAndroid

# 在线准备 Android Gradle wrapper、依赖缓存和离线验证所需构建工件
.\scripts\bootstrap-local.ps1 -IncludeAndroid

# 只预览将要清理的内容
.\scripts\clean-local.ps1 -DryRun

# 清理构建缓存
.\scripts\clean-local.ps1

# 同时清理 desktop/node_modules
.\scripts\clean-local.ps1 -All
```

## API 契约快照

后端 OpenAPI 契约由运行时 FastAPI 应用导出到 `shared/openapi.taskbridge.v1.json`。修改后端路由、Schema、响应模型或鉴权声明后，在 `backend/` 目录运行：

```powershell
python -m tools.openapi_contract --write
python -m tools.openapi_contract --check
```

`check-local.ps1` 会自动执行 `python -m tools.openapi_contract --check`，防止客户端继续对着旧接口开发。

以下命令按职责分属两个目录：跨端、后端、Android、CI、发布和安全治理检查由 `scripts/checks/` 实现，从仓库根目录运行；桌面专用检查及桌面行为验证由 `desktop/scripts/` 实现，需在 `desktop/` 中运行或使用 `npm --prefix desktop run ...`。跨端检查的旧桌面 npm 入口保留为兼容代理。

| 命令 | 说明 |
| --- | --- |
| `npm run check:security-config` | 检查安全敏感配置 |
| `npm run check:auth-session-config` | 检查后端 Refresh Token 会话治理接口和文档 |
| `npm run check:backend-observability` | 检查后端请求 ID、安全头、readiness 和 Docker healthcheck |
| `npm run check:desktop-endpoint-config` | 检查桌面端默认后端地址注入 |
| `npm run check:package-size-config` | 检查生产依赖、asar、locale 和安装包体积配置 |
| `npm run test:unit` | 运行桌面端 Node 单元测试，覆盖共享业务逻辑真实行为 |
| `npm run check:task-order` | 检查任务时间线排序，并用 `shared/task-timeline-fixtures.json` 防止跨端排序契约漂移 |
| `npm run check:quick-add-parser` | 检查快速添加解析 |
| `npm run check:sync-push` | 检查同步推送处理 |
| `npm run check:sync-diagnostics` | 检查设置页同步诊断入口 |
| `npm run check:sync-recovery-center` | 检查设置页同步异常中心和耗尽队列重试入口 |
| `npm run check:desktop-backup` | 检查桌面端备份导出分页、导入错误反馈和统计 |
| `npm run check:desktop-theme` | 检查桌面端主题配置、持久化和设置页入口 |
| `npm run check:desktop-efficiency` | 检查桌面端设置自愈与恢复通知、提醒去重缓存裁剪以及任务列表排序/索引 |
| `npm run check:ux-priority-polish` | 检查跨端主流程层级、首用引导与高优先级体验约束 |
| `npm run check:user-experience` | 检查 Web、Windows 与 Android 的完整用户体验契约 |
| `npm run check:desktop-docs` | 检查桌面端文档和实际连接地址策略一致 |
| `npm run check:release-readiness` | 检查 release 产物不会写死局域网地址，并允许 HTTP/HTTPS 与 WS/WSS 端点 |
| `npm run check:release-artifacts` | 检查 release 会生成 SHA-256 校验清单 |
| `npm run check:desktop-auto-update` | 检查桌面端自动更新依赖、更新入口和 release manifest / blockmap 产物 |
| `npm run check:android-data-extraction` | 检查 Android backup / device transfer 排除 Token、设备 ID、本地数据库和导出缓存 |
| `npm run check:security-governance` | 检查 `SECURITY.md`、Dependabot、CodeQL、dependency-review、Scorecard 和 Trivy 治理配置 |
| `npm run check:production-hardening` | 检查公开 Release 仅含签名客户端、备份恢复脚本和 readiness 策略 |
| `npm run check:ci-workflows` | 检查 CI / release 是否运行关键守门脚本 |
| `npm run check:contract-drift` | 检查后端、桌面端和 Android 字段契约是否漂移 |

## 编写约定

- 脚本名称应说明具体用途。
- 脚本参数和运行方式应写入本 README 或脚本头部注释。
- 不要在脚本中写死数据库密码、JWT 密钥、服务器地址等敏感配置。
- 可重复执行的脚本应尽量保持幂等。
- 删除或移动文件前，应明确限制目标目录，避免误删工作区外文件。
