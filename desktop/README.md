# TaskBridge Windows 桌面端

`desktop/` 是 TaskBridge 的 Windows 桌面客户端，适合在电脑上管理任务、接收提醒，并用悬浮窗查看今日待办。

## 普通用户入口

1. 从项目 Releases 下载 Windows 安装包并安装。
2. 第一次打开时填写“服务器地址”。已有服务器就填管理员或部署者给你的地址；没有服务器地址时，先回到根目录 README 选择本机试用或长期自托管。安装后也可以在设置页修改服务器地址。
3. 使用已有账号登录；如果服务器开放注册，也可以直接创建账号。
4. 登录后在主窗口管理任务，在悬浮窗快速查看今日待办。

没有服务器时，先看根目录 README 的“没有服务器地址”章节；服务准备好后，再回到桌面端填写服务器地址并登录。登录会自动检查连接。

如果手机也要连接同一套服务，请在手机上填写同一套服务对应的服务器地址；本机试用的跨设备地址以根目录说明为准。

离线新增、编辑和完成任务依赖本机已有登录会话；第一次打开时请先连接服务器并登录一次。

## 开发者说明

下面内容面向本地开发、构建和发布。应用使用 Vue 3、TypeScript、Pinia、SQLite 和 electron-builder。运行时配置使用轻量 JSON 存储，避免引入额外桌面端配置依赖。

## 环境要求

- Windows 10/11
- Node.js 22
- npm

## 本地启动

```powershell
cd desktop
npm ci
npm run dev
```

## 常用命令

```powershell
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
npm run check:desktop-theme
npm run check:desktop-efficiency
npm run check:desktop-docs
npm run check:release-artifacts
npm run check:production-hardening
npm run check:android-sync-recovery
npm run check:ci-workflows
npm run check:contract-drift
npm run typecheck
npm run build
npm run dist
npm run rebuild:native
npm run clean:dry-run
npm run clean
```

如果启动后出现 `Could not locate the bindings file` 或 `better_sqlite3.node` 相关错误，说明 SQLite 原生模块没有为当前 Electron 版本生成。进入 `desktop/` 后执行：

```powershell
npm run rebuild:native
```

`npm run dev` 和 `npm run dist` 会先检查该文件，缺失时会自动尝试重建。

说明：

- `npm run build` 构建 Electron 主进程、preload 和 renderer。
- `npm run dist` 生成 Windows 安装包，输出目录为 `desktop/release/`。
- 主窗口默认隐藏 Electron 菜单栏。
- 悬浮窗使用独立入口，不受主窗口布局样式影响。
- `npm run check:security-config` 检查 Electron sandbox、IPC 入口、Android release 签名和 Docker 端口配置。
- `npm run check:auth-session-config` 检查后端 Refresh Token 会话治理接口、测试和文档。
- `npm run check:backend-observability` 检查后端请求 ID、安全响应头、readiness 探针和 Docker healthcheck。
- `npm run check:desktop-endpoint-config` 检查桌面端是否正确使用构建时注入的后端地址。
- `npm run check:package-size-config` 检查桌面端生产依赖、Electron locale、asar、native 解包和安装包排除规则，防止体积回退。
- `npm run test:unit` 运行桌面端 Node 单元测试，覆盖共享业务逻辑和可复用模块的真实行为。
- `npm run check:sync-diagnostics` 检查设置页是否提供同步队列、耗尽重试和冲突数量诊断。
- `npm run check:sync-recovery-center` 检查设置页是否提供重试耗尽队列的异常中心和手动恢复入口。
- `npm run check:desktop-backup` 检查桌面端备份导出分页、导入错误反馈和导入统计，避免坏备份静默显示为成功。
- `npm run check:desktop-theme` 检查桌面端主题配置、持久化、IPC 校验和设置页入口是否完整。
- `npm run check:desktop-efficiency` 检查桌面端设置自愈与恢复通知、提醒去重缓存裁剪以及任务列表排序 / 索引是否到位。
- `npm run check:desktop-docs` 检查 README、部署说明和桌面端说明是否与实际连接地址策略一致。
- `npm run check:ci-workflows` 检查 CI / release 是否真正运行桌面端关键守门脚本。
- `npm run check:contract-drift` 检查后端、桌面端和 Android 端任务 / 同步字段是否发生漂移。
- `npm run clean:dry-run` 查看会清理哪些本地构建缓存；`npm run clean` 会移除 `out/`、`release/`、Electron/Vite/npm 本地缓存等桌面端临时目录。

## 功能

- 登录、注册、Token 保存和自动刷新。
- 今日任务、全部任务和设置页。
- SQLite 本地缓存和离线同步队列。
- WebSocket 常驻连接，收到通知后拉取增量数据。
- 系统托盘和手动同步。
- 桌面悬浮窗显示今日任务。
- 全局快捷键 `Ctrl + Alt + T`。
- 系统通知和本地提醒。
- 桌面端主题可在设置页随时切换，并持久化到本地配置。
- 导入导出备份 JSON。

## 后端地址

桌面端默认后端地址在构建时注入。GitHub Release 会读取仓库 Variables：

- `TASKBRIDGE_BASE_URL`
- `TASKBRIDGE_WS_URL`

本地打包时可这样指定：

```powershell
$env:TASKBRIDGE_BASE_URL="http://192.168.1.10:8000/api/v1/"
$env:TASKBRIDGE_WS_URL="ws://192.168.1.10:8000/ws/sync"
npm run dist
```

用户安装后可以在设置页展示和修改后端连接地址。应用会迁移旧版本内置的默认地址，但会保留用户历史版本中已经手动改过的地址。

## 卸载清理

Windows 安装包使用 NSIS。卸载 TaskBridge 不会自动删除本地数据，避免误删本机任务、登录态、配置和缓存。重新安装后，应用仍会读取原来的本地数据。

如需彻底清理，请在确认已经完成同步或导出备份后，手动删除 `%APPDATA%\TaskBridge`、`%APPDATA%\taskbridge-desktop`、`%LOCALAPPDATA%\TaskBridge` 和 `%LOCALAPPDATA%\taskbridge-desktop`。

用户主动导出的备份 JSON 不在上述应用数据目录内，卸载时不会自动删除。

## 安全边界

- 主窗口和悬浮窗启用 `contextIsolation`、禁用 `nodeIntegration`，并启用 renderer sandbox。
- Preload 只暴露受控的 `window.taskBridge` 能力。
- Renderer 不能直接写入 Token；登录、注册和刷新 Token 后由主进程保存。
- IPC handler 会校验调用方是否来自当前主窗口或悬浮窗。

## 打包注意事项

`electron-builder` 会下载 Electron 运行时。如果本机网络受限，`npm run dist` 可能失败在 Electron zip 下载阶段。GitHub Actions 的 Windows runner 通常可以正常下载。

发布 workflow 会先校验并写入 Windows 签名证书，同时设置 Electron 下载缓存：

```text
CSC_LINK=<runner temp>/taskbridge-codesign.pfx
CSC_KEY_PASSWORD=<WINDOWS_CERTIFICATE_PASSWORD>
ELECTRON_CACHE=<workspace>/.cache/electron
ELECTRON_BUILDER_CACHE=<workspace>/.cache/electron-builder
```

这样既避免发布未签名安装包，也避免使用系统级 Electron 缓存目录导致权限问题。

## 本地验证

```powershell
cd desktop
npm run test:unit
npm run typecheck
npm run build
```
